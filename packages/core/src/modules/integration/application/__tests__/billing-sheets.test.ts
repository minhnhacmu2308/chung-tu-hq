// Lượt khai (ADR 0011) ở module integration: chặn khai tạm lần đầu khi thiếu lượt, ghi lượt khi IDC/EDC được chấp nhận, đếm lượt đang giữ.
import { beforeEach, describe, expect, it } from "vitest";
import { RecordingDeclarationBilling } from "../../../../shared/billing.js";
import { reasonError } from "../../../../shared/errors.js";
import { errCode, unwrap } from "../../../../shared/result.js";
import type { CustomsGateway } from "../customs-ports.js";
import { countReservedDeclarations, listDeclaredBranches, unnumberedSheets } from "../billing-sheets.js";
import { declareAllSheets } from "../declare-all.js";
import { performOperation } from "../perform-operation.js";
import { processOutbox } from "../process-outbox.js";
import { resendOperation } from "../resend-operation.js";
import { submitDeclaration } from "../submit-declaration.js";
import { FakeCustomsGateway } from "../test/fake-customs-gateway.js";
import { D, declarant, lines, lot as lotOf, makeHarness, ORG, seed, T, type Harness } from "./_sheets-harness.js";

let h: Harness;
let billing: RecordingDeclarationBilling;
beforeEach(() => {
  h = makeHarness();
  billing = new RecordingDeclarationBilling();
  h.deps.billing = billing;
});
const run = (outboxId: string) => processOutbox(h.deps, { orgId: ORG, userId: "usr_chau", outboxId });
async function drain(max = 30) {
  for (let i = 0; i < max; i++) {
    const job = h.queue.jobs.shift();
    if (!job) return;
    if (job.name === "customs-send") await run((job.payload as Record<string, string>)["outboxId"]!);
  }
}
const insufficient = () => reasonError("INSUFFICIENT_CREDITS", "INSUFFICIENT_CREDITS", { needed: 1, available: 0 });

describe("unnumberedSheets", () => {
  it("đếm tờ 1..of chưa có số tờ khai (thiếu kết quả = chưa có số)", () => {
    expect(unnumberedSheets([], 3)).toBe(3);
    expect(unnumberedSheets([{ branch: 1, declarationNo: "1" }, { branch: 2, declarationNo: null }], 3)).toBe(2);
    expect(unnumberedSheets([{ branch: 1, declarationNo: "1" }, { branch: 4, declarationNo: null }], 2)).toBe(1);
  });
});

describe("chặn khai tạm lần đầu (spec §4.2)", () => {
  it("lô một tờ: kiểm 1 tờ; thiếu lượt → INSUFFICIENT_CREDITS, không tạo outbox, tờ khai chưa SUBMITTED", async () => {
    billing.deny = insufficient();
    expect(errCode(await submitDeclaration(h.deps, declarant, D, "cert_1"))).toBe("INSUFFICIENT_CREDITS");
    expect(billing.checks).toEqual([{ orgId: ORG, sheetsToStart: 1, ownReserved: 0 }]);
    expect(h.uow.data.outbox).toHaveLength(0);
    expect(h.decls.submitted).toEqual([]);
  });
  it("lô 3 tờ gửi lần đầu: kiểm đủ 3 lượt; đủ → gửi; chuỗi khai tạm tờ 2..3 của worker không kiểm lại", async () => {
    h.decls.items = lines(140);
    unwrap(await submitDeclaration(h.deps, declarant, D, "cert_1", { hysWaived: true }));
    expect(billing.checks).toEqual([{ orgId: ORG, sheetsToStart: 3, ownReserved: 0 }]);
    await drain();
    expect(h.uow.data.outbox.filter((o) => o.operation === "IDA")).toHaveLength(3);
    expect(billing.checks).toHaveLength(1);
  });
  it("khai tạm lại sau gọi về (đã có số) / khai chính thức một tờ → không kiểm lượt", async () => {
    seed(h, 1, "PRE_DECLARED");
    h.dossiers.rows[0]!.status = "SUBMITTED";
    h.decls.status = "SUBMITTED";
    unwrap(await performOperation(h.deps, declarant, D, "IDC"));
    expect(billing.checks).toEqual([]);
  });
  it("gửi lại khai tạm của tờ chưa có số (lô nhiều tờ, chưa từng được FPT nhận) → kiểm lượt mọi tờ chưa có số", async () => {
    lotOf(h, "PRE_DECLARED", "NOT_SENT", "NOT_SENT");
    for (const r of h.uow.data.results.filter((x) => x.branch > 1)) Object.assign(r, { declarationNo: null, externalId: null, state: "SEND_FAILED" });
    h.uow.data.outbox.push({
      id: "ob_2", orgId: ORG, dossierId: D, branch: 2, declarationId: "dec_1", operation: "IDA", idempotencyKey: `${D}:IDA:v2:b2`,
      payload: { request: {}, pin: "pin_1", certificateId: "cert_1" }, status: "FAILED", attempts: 5, lastError: "FPT 503", nextAttemptAt: null, createdAt: T, updatedAt: T,
    });
    billing.deny = insufficient();
    expect(errCode(await resendOperation(h.deps, declarant, D, "IDA", 2))).toBe("INSUFFICIENT_CREDITS");
    expect(billing.checks).toEqual([{ orgId: ORG, sheetsToStart: 2, ownReserved: 0 }]);
    expect(h.uow.data.outbox).toHaveLength(1);
  });
  it("khai chính thức cả lô: đếm đúng số tờ đang chờ khai chính thức (đã giữ lượt); thiếu → không tạo outbox", async () => {
    lotOf(h, "PRE_DECLARED", "PRE_DECLARED", "PRE_DECLARED");
    billing.deny = insufficient();
    expect(errCode(await declareAllSheets(h.deps, declarant, D))).toBe("INSUFFICIENT_CREDITS");
    expect(billing.checks).toEqual([{ orgId: ORG, sheetsToStart: 3, ownReserved: 3 }]);
    expect(h.uow.data.outbox).toHaveLength(0);
  });
  it("hợp đồng hết hạn → CONTRACT_EXPIRED trả nguyên cho người gọi", async () => {
    billing.deny = reasonError("CONTRACT_EXPIRED", "CONTRACT_EXPIRED", { endsOn: "2026-10-25" });
    expect(errCode(await submitDeclaration(h.deps, declarant, D, "cert_1"))).toBe("CONTRACT_EXPIRED");
  });
  it("không nối billing (test cũ / cấu hình cũ) → không chặn", async () => {
    delete h.deps.billing;
    unwrap(await submitDeclaration(h.deps, declarant, D, "cert_1", { hysWaived: true }));
  });
});

describe("ghi lượt khi IDC/EDC được chấp nhận (D2)", () => {
  it("IDA → IDC: chỉ IDC thành công ghi lượt (một lần) với số tờ khai; job chạy lại sau khi SENT không ghi thêm", async () => {
    unwrap(await submitDeclaration(h.deps, declarant, D, "cert_1", { hysWaived: true }));
    await drain();
    expect(billing.declared).toEqual([]);
    unwrap(await performOperation(h.deps, declarant, D, "IDC"));
    const idc = h.uow.data.outbox.find((o) => o.operation === "IDC")!;
    await drain();
    const no = h.uow.data.results[0]!.declarationNo!;
    expect(billing.declared).toEqual([{ orgId: ORG, dossierId: D, branch: 1, declarationNo: no, op: "IDC" }]);
    await run(idc.id);
    expect(billing.declared).toHaveLength(1);
  });
  it("IDC bị từ chối / chưa có phân luồng → không ghi lượt", async () => {
    seed(h, 1, "PRE_DECLARED");
    h.dossiers.rows[0]!.status = "SUBMITTED";
    h.decls.status = "SUBMITTED";
    const g = new FakeCustomsGateway();
    h.deps.gateway = { ...(g as unknown as CustomsGateway), name: "stub", preDeclare: g.preDeclare.bind(g), attachDocuments: g.attachDocuments.bind(g), queryStatus: g.queryStatus.bind(g), send: g.send.bind(g), declare: async () => ({ accepted: false, errors: [{ code: "E1", message: "Sai" }] }) } as CustomsGateway;
    unwrap(await performOperation(h.deps, declarant, D, "IDC"));
    await drain();
    expect(h.uow.data.outbox[0]!.status).toBe("FAILED");
    expect(billing.declared).toEqual([]);
  });
  it("khai chính thức cả lô 3 tờ → 3 lượt, mỗi tờ một số tờ khai", async () => {
    lotOf(h, "PRE_DECLARED", "PRE_DECLARED", "PRE_DECLARED");
    unwrap(await declareAllSheets(h.deps, declarant, D));
    await drain();
    expect(billing.declared.map((d) => [d.branch, d.declarationNo])).toEqual([[1, "104000000001"], [2, "104000000002"], [3, "104000000003"]]);
  });
  it("ghi sổ lượt lỗi → không làm hỏng luồng (tờ khai vẫn SENT/DECLARED), chỉ log", async () => {
    seed(h, 1, "PRE_DECLARED");
    h.dossiers.rows[0]!.status = "SUBMITTED";
    h.decls.status = "SUBMITTED";
    billing.fail = true;
    unwrap(await performOperation(h.deps, declarant, D, "IDC"));
    await drain();
    expect(h.uow.data.outbox[0]!.status).toBe("SENT");
    expect(billing.declared).toEqual([]);
  });
});

describe("lượt đang giữ / tờ đã khai chính thức (đối soát)", () => {
  it("đếm tờ đã có số ở PRE_DECLARED / RECALLED; bỏ tờ đã khai chính thức, bị từ chối, hồ sơ đã hủy; org khác không thấy", async () => {
    lotOf(h, "PRE_DECLARED", "RECALLED", "DECLARED", "REJECTED");
    expect(await countReservedDeclarations(h.deps, ORG)).toBe(2);
    expect(await countReservedDeclarations(h.deps, "org_b")).toBe(0);
    h.dossiers.rows[0]!.status = "CANCELLED";
    expect(await countReservedDeclarations(h.deps, ORG)).toBe(0);
  });
  it("tờ đã khai chính thức từ mốc: cần thông điệp IDC/EDC thành công lúc ≥ mốc (không tính hồi tố)", async () => {
    lotOf(h, "DECLARED", "CLEARED", "PRE_DECLARED");
    const msg = (branch: number, at: string) => h.uow.data.messages.push({ id: `m${branch}`, orgId: ORG, dossierId: D, branch, operation: "IDC", direction: "IN", result: "OK", summary: "ok", payloadMasked: {}, externalRef: null, at: new Date(at) });
    msg(1, "2026-10-14T03:00:00Z");
    msg(2, "2026-10-01T00:00:00Z");
    const since = new Date("2026-10-10T00:00:00Z");
    expect(await listDeclaredBranches(h.deps, ORG, since)).toEqual([{ orgId: ORG, dossierId: D, branch: 1, declarationNo: "104000000001", op: "IDC" }]);
    expect(await listDeclaredBranches(h.deps, "org_b", since)).toEqual([]);
  });
});
