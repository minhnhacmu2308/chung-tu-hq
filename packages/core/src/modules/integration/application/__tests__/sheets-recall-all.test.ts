// Gọi về tất cả tờ (spec tách tờ khai IDC/gọi về §2.2–2.3): recallAllSheets + chuỗi gọi về nối tiếp của worker (payload.chain = "recall")
// và tự mở lại tờ khai khi lệnh gọi về cuối cùng thành công.
import { declarationEditScope, type CustomsOperation } from "@kb/contracts";
import { beforeEach, describe, expect, it } from "vitest";
import { RecordingOrgAudit } from "../../../../shared/audit.js";
import { fixedClock } from "../../../../shared/clock.js";
import type { RecordingNotifier } from "../../../../shared/notifier.js";
import { unwrap } from "../../../../shared/result.js";
import { stageOf } from "../../domain/state-machine.js";
import { performOperation } from "../perform-operation.js";
import { processOutbox } from "../process-outbox.js";
import { recallAllSheets } from "../recall-all.js";
import { D, declarant, lines, lot as lotOf, makeHarness, ORG, other, seed as seedOf, viewer, type Harness } from "./_sheets-harness.js";

let h: Harness;
let audit: RecordingOrgAudit;
beforeEach(() => {
  h = makeHarness();
  audit = new RecordingOrgAudit();
  h.deps.orgAudit = audit;
});
const lot = (...stages: string[]) => lotOf(h, ...stages);
const run = (outboxId: string) => processOutbox(h.deps, { orgId: ORG, userId: "usr_chau", outboxId });
/** Worker giả: xử lý hết job customs-send đang xếp hàng (kể cả job do chuỗi nối tiếp tạo thêm). */
async function drain(max = 20) {
  for (let i = 0; i < max; i++) {
    const job = h.queue.jobs.shift();
    if (!job) return;
    const p = job.payload as Record<string, string>;
    if (job.name === "customs-send") await run(p["outboxId"]!);
  }
}
const sent = () => h.uow.data.outbox.map((o) => [o.branch, o.operation, o.status] as const);
const chainOf = (i: number) => (h.uow.data.outbox[i]!.payload as { chain?: string }).chain;
const errOf = (r: { ok: boolean; error?: { code: string; reason?: string; message?: string } }) => (r.ok ? null : r.error!);
const stages = () => [...h.uow.data.results].sort((a, b) => a.branch - b.branch).map((r) => stageOf(r));
const reopenedAudits = () => audit.entries.filter((e) => e.action === "DECLARATION_REOPENED");
const notes = () => (h.deps.notify as RecordingNotifier).sent.map((s) => s.draft);
/** Gateway từ chối nghiệp vụ `op` của tờ `branch` (externalId fpt-b<branch>). */
const rejectOn = (branch: number, op: CustomsOperation) => {
  const gw = h.deps.gateway;
  const send = gw.send.bind(gw);
  gw.send = async (o, msg, key) => (msg.externalId === `fpt-b${branch}` && msg.op === op ? { errors: [{ code: "E-X", message: "từ chối" }] } : send(o, msg, key));
  return () => {
    gw.send = send;
  };
};

describe("recallAllSheets – chuỗi gọi về tờ 1 → N", () => {
  it("tờ 1 PRE_DECLARED, tờ 2 DECLARED, tờ 3 CLEARED: IDB tờ 1 (chain recall) → IDD tờ 2 → hết chuỗi; trả sheets [1, 2]", async () => {
    lot("PRE_DECLARED", "DECLARED", "CLEARED");
    const res = unwrap(await recallAllSheets(h.deps, declarant, D));
    expect(res.sheets).toEqual([1, 2]);
    expect(res.sent).toBe(true);
    expect(sent()).toEqual([[1, "IDB", "PENDING"]]);
    expect(chainOf(0)).toBe("recall");
    await run(h.uow.data.outbox[0]!.id);
    expect(sent()).toEqual([[1, "IDB", "SENT"], [2, "IDD", "PENDING"]]);
    expect(chainOf(1)).toBe("recall");
    expect(h.uow.data.outbox[1]!.idempotencyKey).toBe(`${D}:IDD:chain${h.uow.data.outbox[0]!.id}:b2`);
    await run(h.uow.data.outbox[1]!.id);
    expect(sent()).toEqual([[1, "IDB", "SENT"], [2, "IDD", "SENT"]]);
    expect(stages()).toEqual(["RECALLED", "AMEND_RECALLED", "CLEARED"]);
  });

  it("tự mở lại chỉ sau lệnh gọi về cuối: sau tờ 1 tờ khai vẫn SUBMITTED; sau tờ 2 → DRAFT, hồ sơ review, audit scope ALL, một thông báo nêu số tờ", async () => {
    lot("PRE_DECLARED", "DECLARED", "CLEARED");
    unwrap(await recallAllSheets(h.deps, declarant, D));
    await run(h.uow.data.outbox[0]!.id);
    expect(h.decls.status).toBe("SUBMITTED");
    expect(h.decls.reopened).toEqual([]);
    expect(reopenedAudits()).toEqual([]);
    expect(notes()).toEqual([]);
    await run(h.uow.data.outbox[1]!.id);
    expect(h.decls.status).toBe("DRAFT");
    expect(h.decls.reopened).toEqual([D]);
    expect(h.dossiers.rows[0]!.step).toBe("review");
    expect(reopenedAudits()).toEqual([expect.objectContaining({ targetType: "dossier", targetId: D, targetLabel: "HS-NK-2610-021", detail: { scope: "ALL" } })]);
    expect(notes()).toHaveLength(1);
    expect(notes()[0]).toMatchObject({ title: expect.stringContaining("đã gọi về 2 tờ"), href: `/dossiers/${D}?step=review` });
  });

  it("gọi về một tờ (IDB tờ 2, không chain) thành công → mở lại ngay, audit scope [2]; tờ khác không bị gọi về", async () => {
    lot("PRE_DECLARED", "PRE_DECLARED", "PRE_DECLARED");
    unwrap(await performOperation(h.deps, declarant, D, "IDB", 2));
    expect(chainOf(0)).toBeUndefined();
    await drain();
    expect(sent()).toEqual([[2, "IDB", "SENT"]]);
    expect(h.decls.status).toBe("DRAFT");
    expect(h.decls.reopened).toEqual([D]);
    expect(h.dossiers.rows[0]!.step).toBe("review");
    expect(reopenedAudits().map((e) => e.detail)).toEqual([{ scope: [2] }]);
    expect(notes()).toHaveLength(1);
  });

  it("lô một tờ: gọi về (IDB) → mở lại như trước, audit scope [1]", async () => {
    h.decls.items = lines(10);
    h.decls.status = "SUBMITTED";
    seedOf(h, 1, "PRE_DECLARED");
    unwrap(await performOperation(h.deps, declarant, D, "IDB", 1));
    await drain();
    expect(h.decls.status).toBe("DRAFT");
    expect(reopenedAudits().map((e) => e.detail)).toEqual([{ scope: [1] }]);
  });

  it("một tờ đích còn outbox PENDING → RECALL_ALL_BLOCKED nêu tờ, không tạo outbox nào", async () => {
    lot("PRE_DECLARED", "PRE_DECLARED", "PRE_DECLARED");
    unwrap(await performOperation(h.deps, declarant, D, "PORT_FEE", 2));
    expect(errOf(await recallAllSheets(h.deps, declarant, D))).toMatchObject({ code: "INVALID_STATE", reason: "RECALL_ALL_BLOCKED", params: { sheets: "2" } });
    expect(sent()).toEqual([[2, "PORT_FEE", "PENDING"]]);
  });

  it("gọi về tờ 2 bị từ chối → dừng, không gửi tờ 3, không mở lại; gọi lại → chỉ gửi tờ chưa gọi về (2, 3), xong thì mở lại", async () => {
    lot("PRE_DECLARED", "PRE_DECLARED", "PRE_DECLARED");
    const restore = rejectOn(2, "IDB");
    unwrap(await recallAllSheets(h.deps, declarant, D));
    await drain();
    expect(sent()).toEqual([[1, "IDB", "SENT"], [2, "IDB", "FAILED"]]);
    expect(h.decls.reopened).toEqual([]);
    expect(h.decls.status).toBe("SUBMITTED");
    restore();
    const again = unwrap(await recallAllSheets(h.deps, declarant, D));
    expect(again.sheets).toEqual([2, 3]);
    await drain();
    expect(sent()).toEqual([[1, "IDB", "SENT"], [2, "IDB", "FAILED"], [2, "IDB", "SENT"], [3, "IDB", "SENT"]]);
    expect(stages()).toEqual(["RECALLED", "RECALLED", "RECALLED"]);
    expect(h.decls.reopened).toEqual([D]);
    expect(reopenedAudits().map((e) => e.detail)).toEqual([{ scope: "ALL" }]);
  });

  it("tờ khai đã DRAFT (đã gọi về tờ 2): gọi về tất cả → tờ 1, 3; xong không mở lại lần nữa; phạm vi sửa thành FULL", async () => {
    lot("PRE_DECLARED", "PRE_DECLARED", "PRE_DECLARED");
    unwrap(await performOperation(h.deps, declarant, D, "IDB", 2));
    await drain();
    expect(h.decls.status).toBe("DRAFT");
    const sheetsNow = () => [...h.uow.data.results].sort((a, b) => a.branch - b.branch).map((r) => ({ no: r.branch, stage: stageOf(r), declarationNo: r.declarationNo }));
    expect(declarationEditScope("DRAFT", sheetsNow()).common).toBe("LOCKED");
    const res = unwrap(await recallAllSheets(h.deps, declarant, D));
    expect(res.sheets).toEqual([1, 3]);
    await drain();
    expect(sent()).toEqual([[2, "IDB", "SENT"], [1, "IDB", "SENT"], [3, "IDB", "SENT"]]);
    expect(h.decls.reopened).toEqual([D]);
    expect(reopenedAudits()).toHaveLength(1);
    expect(declarationEditScope("DRAFT", sheetsNow()).common).toBe("FULL");
  });

  it("worker chạy lại outbox tờ 1 đã SENT: không tạo gọi về tờ 2 thứ hai (kể cả khi tờ 2 FAILED), không mở lại sớm", async () => {
    lot("PRE_DECLARED", "PRE_DECLARED", "PRE_DECLARED");
    unwrap(await recallAllSheets(h.deps, declarant, D));
    const ob1 = h.uow.data.outbox[0]!.id;
    await run(ob1);
    await run(ob1);
    expect(sent()).toEqual([[1, "IDB", "SENT"], [2, "IDB", "PENDING"]]);
    h.uow.data.outbox[1]!.status = "FAILED";
    await run(ob1);
    expect(sent()).toEqual([[1, "IDB", "SENT"], [2, "IDB", "FAILED"]]);
    expect(h.decls.reopened).toEqual([]);
  });

  it("lô một tờ → VALIDATION; không còn tờ nào cần gọi về → INVALID_STATE; VIEWER bị từ chối", async () => {
    h.decls.items = lines(10);
    h.decls.status = "SUBMITTED";
    seedOf(h, 1, "PRE_DECLARED");
    const e = errOf(await recallAllSheets(h.deps, declarant, D))!;
    expect(e).toMatchObject({ code: "VALIDATION", reason: "RECALL_ALL_SINGLE_SHEET" });
    expect(e.message).toMatch(/chỉ dùng cho lô nhiều tờ/);
    h = makeHarness();
    lot("RECALLED", "CLEARED");
    expect(errOf(await recallAllSheets(h.deps, declarant, D))).toMatchObject({ code: "INVALID_STATE", reason: "RECALL_ALL_NONE", message: "Không còn tờ nào cần gọi về" });
    h = makeHarness();
    lot("PRE_DECLARED", "PRE_DECLARED");
    expect(errOf(await recallAllSheets(h.deps, viewer, D))).toMatchObject({ code: "FORBIDDEN" });
    expect(errOf(await recallAllSheets(h.deps, other, D))).toMatchObject({ code: "NOT_FOUND" });
    expect(h.uow.data.outbox).toHaveLength(0);
  });

  it("chuỗi gọi về không bị outbox chuỗi khai chính thức cũ chặn nhầm (lọc theo loại chuỗi)", async () => {
    lot("PRE_DECLARED", "PRE_DECLARED");
    // Outbox khai chính thức cả lô đã FAILED từ trước ở tờ 2 (cùng thời điểm) – không phải chuỗi gọi về.
    h.uow.data.outbox.push({ id: "ob_old", orgId: ORG, dossierId: D, branch: 2, declarationId: "dec_1", operation: "IDC", idempotencyKey: "old", payload: { chain: "declare" }, status: "FAILED", attempts: 1, lastError: "x", nextAttemptAt: null, createdAt: new Date("2026-10-14T03:00:00.000Z"), updatedAt: new Date("2026-10-14T03:00:00.000Z") });
    unwrap(await recallAllSheets(h.deps, declarant, D));
    await drain();
    expect(sent()).toEqual([[2, "IDC", "FAILED"], [1, "IDB", "SENT"], [2, "IDB", "SENT"]]);
    expect(stages()).toEqual(["RECALLED", "RECALLED"]);
  });
});

describe("job gọi về chạy lại sau SENT không hủy việc người khai đã làm (ADR 0005)", () => {
  const LATER = "2026-10-14T04:00:00.000Z";
  /** Gọi về tờ `branch` (không chain) thành công → tự mở lại; trả id outbox gọi về. */
  async function recallAndReopen(branch: number) {
    unwrap(await performOperation(h.deps, declarant, D, "IDB", branch));
    const id = h.uow.data.outbox.at(-1)!.id;
    await drain();
    expect(h.decls.status).toBe("DRAFT");
    return id;
  }
  it("lô nhiều tờ: gọi về → mở lại → duyệt lại → job chạy lại → vẫn APPROVED, không mở lại / audit lần nữa", async () => {
    lot("PRE_DECLARED", "PRE_DECLARED", "PRE_DECLARED");
    const ob = await recallAndReopen(2);
    Object.assign(h.decls, { status: "APPROVED", approvedAt: LATER });
    await run(ob);
    expect(h.decls.status).toBe("APPROVED");
    expect(h.decls.reopened).toEqual([D]);
    expect(reopenedAudits()).toHaveLength(1);
  });
  it("lô một tờ: gọi về → mở lại → duyệt lại → job chạy lại → vẫn APPROVED", async () => {
    h.decls.items = lines(10);
    h.decls.status = "SUBMITTED";
    seedOf(h, 1, "PRE_DECLARED");
    const ob = await recallAndReopen(1);
    Object.assign(h.decls, { status: "APPROVED", approvedAt: LATER });
    await run(ob);
    expect(h.decls.status).toBe("APPROVED");
    expect(h.decls.reopened).toEqual([D]);
  });
  it("gọi về → mở lại → duyệt lại → truyền (IDA tờ 2 PENDING, tờ vẫn RECALLED) → job chạy lại → vẫn SUBMITTED, không markDraft", async () => {
    lot("PRE_DECLARED", "PRE_DECLARED", "PRE_DECLARED");
    const ob = await recallAndReopen(2);
    // Lần duyệt không mang approvedAt (dữ liệu cũ) → chặn nhờ outbox gửi nội dung tạo sau lần gọi về.
    h.decls.status = "APPROVED";
    h.deps.clock = fixedClock(LATER);
    unwrap(await performOperation(h.deps, declarant, D, "IDA", 2));
    expect(h.decls.status).toBe("SUBMITTED");
    expect(sent().at(-1)).toEqual([2, "IDA", "PENDING"]);
    expect(stages()[1]).toBe("RECALLED");
    await run(ob);
    expect(h.decls.status).toBe("SUBMITTED");
    expect(h.decls.reopened).toEqual([D]);
    expect(reopenedAudits()).toHaveLength(1);
  });
});
