// Nhắc khai HYS trước IDA/EDA: HYS_SUGGESTED khi còn gợi ý chưa thỏa, hysWaived ghi NOTE rồi khai tiếp (spec khai-hys-truoc-ida §3.3).
import { beforeEach, describe, expect, it } from "vitest";
import { RecordingOrgAudit } from "../../../../shared/audit.js";
import { createHysSubmission } from "../hys-submissions.js";
import { performOperation } from "../perform-operation.js";
import { outboxKey, submitDeclaration } from "../submit-declaration.js";
import { D, declarant, makeHarness, seed, type Harness } from "./_sheets-harness.js";

let h: Harness;
let audit: RecordingOrgAudit;
beforeEach(() => {
  h = makeHarness();
  audit = new RecordingOrgAudit();
  h.deps.orgAudit = audit;
});
const submit = (opts?: { hysWaived?: boolean }) => submitDeclaration(h.deps, declarant, D, "cert_1", opts);
const notes = () => h.uow.data.messages.filter((m) => m.direction === "NOTE");

describe("khai IDA lần đầu", () => {
  it("có container, không bộ HYS, không cờ → HYS_SUGGESTED {codes:A02}, không outbox, không ghi gì", async () => {
    const r = await submit();
    expect(!r.ok && r.error).toMatchObject({ code: "INVALID_STATE", reason: "HYS_SUGGESTED", params: { codes: "A02" } });
    expect(h.uow.data.outbox).toEqual([]);
    expect(h.uow.data.results).toEqual([]);
    expect(h.decls.submitted).toEqual([]);
    expect(notes()).toEqual([]);
  });

  it("hysWaived → tạo outbox + 1 message NOTE (codes) + nhật ký doanh nghiệp", async () => {
    const r = await submit({ hysWaived: true });
    expect(r.ok).toBe(true);
    expect(h.uow.data.outbox).toHaveLength(1);
    expect(notes()).toEqual([expect.objectContaining({ operation: "IDA", direction: "NOTE", result: "OK", summary: "Người khai xác nhận không khai HYS: A02", payloadMasked: { codes: "A02" }, externalRef: null, orgId: "org_a", dossierId: D })]);
    expect(audit.entries).toEqual([expect.objectContaining({ action: "HYS_WAIVED", targetType: "dossier", targetId: D, detail: { codes: "A02" } })]);
  });

  it("bộ A02 đang gửi (số chưa vào 1.63) → vẫn bị hỏi (Ruling R8)", async () => {
    const c = await createHysSubmission(h.deps, declarant, D, { procedureCode: "A02" });
    if (!c.ok) throw new Error("create");
    h.uow.data.hys.find((x) => x.id === c.value.id)!.status = "SENDING";
    const r = await submit();
    expect(!r.ok && r.error.reason).toBe("HYS_SUGGESTED");
  });

  it("bộ A02 ACCEPTED đã điền 1.63 (FILLED) → gửi bình thường, không NOTE", async () => {
    const c = await createHysSubmission(h.deps, declarant, D, { procedureCode: "A02" });
    if (!c.ok) throw new Error("create");
    Object.assign(h.uow.data.hys.find((x) => x.id === c.value.id)!, { status: "ACCEPTED", fill: { outcome: "FILLED", slot: 1 } });
    expect((await submit()).ok).toBe(true);
    expect(notes()).toEqual([]);
  });

  it("1.63 nhập tay A02 + số tiếp nhận → không hỏi", async () => {
    h.decls.fields = { TK_EA1: { value: "A02" }, TK_EB1: { value: "300000000001" } };
    expect((await submit()).ok).toBe(true);
    expect(notes()).toEqual([]);
  });

  it("hysWaived nhưng outbox không tạo được (đã truyền – ALREADY_SUBMITTED) → không NOTE, không nhật ký", async () => {
    const at = new Date("2026-10-14T03:00:00.000Z");
    h.uow.data.outbox.push({ id: "msg_old", orgId: "org_a", dossierId: D, branch: 1, declarationId: "dec_1", operation: "IDA", idempotencyKey: outboxKey(D, "IDA", h.decls.version), payload: {}, status: "PENDING", attempts: 1, lastError: null, nextAttemptAt: null, createdAt: at, updatedAt: at });
    const r = await submit({ hysWaived: true });
    expect(!r.ok && r.error.code).toBe("ALREADY_SUBMITTED");
    expect(notes()).toEqual([]);
    expect(audit.entries).toEqual([]);
  });

  it("bộ A02 còn nháp (chưa gửi) vẫn bị hỏi", async () => {
    await createHysSubmission(h.deps, declarant, D, { procedureCode: "A02" });
    const r = await submit();
    expect(!r.ok && r.error.reason).toBe("HYS_SUGGESTED");
  });
});

describe("gửi lại IDA qua performOperation", () => {
  const recalled = () => {
    h.decls.status = "APPROVED";
    seed(h, 1, "RECALLED");
  };

  it("người dùng bấm IDA sau gọi về → bị hỏi; có cờ → NOTE + outbox", async () => {
    recalled();
    const r = await performOperation(h.deps, declarant, D, "IDA");
    expect(!r.ok && r.error.reason).toBe("HYS_SUGGESTED");
    expect(h.uow.data.outbox).toEqual([]);
    const w = await performOperation(h.deps, declarant, D, "IDA", 1, { hysWaived: true });
    expect(w.ok).toBe(true);
    expect(h.uow.data.outbox).toHaveLength(1);
    expect(notes()).toHaveLength(1);
  });

  it("hysWaived nhưng guard sau trượt (tỷ giá khác tuần) → không NOTE, không outbox", async () => {
    recalled();
    h.decls.rateDate = "2026-10-11";
    const r = await performOperation(h.deps, declarant, D, "IDA", 1, { hysWaived: true });
    expect(!r.ok && r.error.reason).toBe("RATE_WEEK_CHANGED_REBUILD");
    expect(h.uow.data.outbox).toEqual([]);
    expect(notes()).toEqual([]);
    expect(audit.entries).toEqual([]);
  });

  it("chuỗi worker (chainFrom) không bị hỏi, không NOTE", async () => {
    recalled();
    const r = await performOperation(h.deps, declarant, D, "IDA", 1, { chainFrom: "msg_x" });
    expect(r.ok).toBe(true);
    expect(notes()).toEqual([]);
  });

  it("IDC (khai chính thức) không bị guard HYS", async () => {
    h.decls.status = "SUBMITTED";
    seed(h, 1, "PRE_DECLARED");
    const r = await performOperation(h.deps, declarant, D, "IDC");
    expect(r.ok).toBe(true);
    expect(notes()).toEqual([]);
  });
});
