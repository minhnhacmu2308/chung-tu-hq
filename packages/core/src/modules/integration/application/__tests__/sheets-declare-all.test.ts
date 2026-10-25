// Khai chính thức cả lô: declareAllSheets + chuỗi nối tiếp IDC/IDE tờ 1 → N của worker (payload.chain = "declare").
import { beforeEach, describe, expect, it } from "vitest";
import { unwrap } from "../../../../shared/result.js";
import { stageOf } from "../../domain/state-machine.js";
import { declareOpFor } from "../branch-send.js";
import { declareAllSheets } from "../declare-all.js";
import { performOperation } from "../perform-operation.js";
import { processOutbox } from "../process-outbox.js";
import { approver, D, declarant, lines, lot as lotOf, makeHarness, ORG, viewer, type Harness } from "./_sheets-harness.js";

let h: Harness;
beforeEach(() => {
  h = makeHarness();
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
const stage = (branch: number) => stageOf(h.uow.data.results.find((r) => r.branch === branch)!);

describe("declareOpFor", () => {
  it("PRE_DECLARED → IDC/EDC, AMEND_PRE_DECLARED → IDE/EDE, khác null", () => {
    expect(declareOpFor("PRE_DECLARED", "IDA")).toBe("IDC");
    expect(declareOpFor("PRE_DECLARED", "EDA")).toBe("EDC");
    expect(declareOpFor("AMEND_PRE_DECLARED", "IDA")).toBe("IDE");
    expect(declareOpFor("AMEND_PRE_DECLARED", "EDA")).toBe("EDE");
    for (const s of ["NOT_SENT", "RECALLED", "DECLARED", "CLEARED", "REJECTED", "AMEND_RECALLED"] as const) expect(declareOpFor(s, "IDA")).toBeNull();
  });
});

describe("declareAllSheets – chuỗi IDC tờ 1 → N", () => {
  it("3 tờ PRE_DECLARED: chỉ tạo IDC tờ 1 (chain = declare); mỗi tờ SENT nối tờ kế; tờ cuối SENT không tạo gì", async () => {
    lot("PRE_DECLARED", "PRE_DECLARED", "PRE_DECLARED");
    unwrap(await declareAllSheets(h.deps, declarant, D));
    expect(sent()).toEqual([[1, "IDC", "PENDING"]]);
    expect(chainOf(0)).toBe("declare");
    await run(h.uow.data.outbox[0]!.id);
    expect(sent()).toEqual([[1, "IDC", "SENT"], [2, "IDC", "PENDING"]]);
    expect(chainOf(1)).toBe("declare");
    await run(h.uow.data.outbox[1]!.id);
    expect(sent()).toEqual([[1, "IDC", "SENT"], [2, "IDC", "SENT"], [3, "IDC", "PENDING"]]);
    await run(h.uow.data.outbox[2]!.id);
    expect(sent()).toEqual([[1, "IDC", "SENT"], [2, "IDC", "SENT"], [3, "IDC", "SENT"]]);
    expect([1, 2, 3].map(stage)).toEqual(["DECLARED", "DECLARED", "DECLARED"]);
  });
  it("khóa idempotency: tờ 1 giữ dạng cũ, tờ ≥ 2 thêm :b<no>", async () => {
    lot("PRE_DECLARED", "PRE_DECLARED");
    unwrap(await declareAllSheets(h.deps, declarant, D));
    await drain();
    expect(h.uow.data.outbox.map((o) => o.idempotencyKey)).toEqual([`${D}:IDC:n1`, `${D}:IDC:n1:b2`]);
  });
  it("tờ 1 CLEARED, tờ 2–3 PRE_DECLARED → outbox đầu tiên là tờ 2", async () => {
    lot("CLEARED", "PRE_DECLARED", "PRE_DECLARED");
    unwrap(await declareAllSheets(h.deps, declarant, D));
    expect(sent()).toEqual([[2, "IDC", "PENDING"]]);
    await drain();
    expect(sent()).toEqual([[2, "IDC", "SENT"], [3, "IDC", "SENT"]]);
  });
  it("tờ 2 AMEND_PRE_DECLARED → nghiệp vụ tờ 2 là IDE", async () => {
    lot("CLEARED", "AMEND_PRE_DECLARED");
    unwrap(await declareAllSheets(h.deps, declarant, D));
    expect(sent()).toEqual([[2, "IDE", "PENDING"]]);
  });
  it("IDC tờ 2 bị từ chối → không tạo IDC tờ 3; tờ 2 đã DECLARED rồi gọi lại → gửi IDC tờ 3", async () => {
    lot("PRE_DECLARED", "PRE_DECLARED", "PRE_DECLARED");
    const gw = h.deps.gateway;
    const declare = gw.declare.bind(gw);
    gw.declare = async (o, msg, key) => (msg.externalId === "fpt-b2" ? { accepted: false, errors: [{ code: "E-X", message: "từ chối" }] } : declare(o, msg, key));
    unwrap(await declareAllSheets(h.deps, declarant, D));
    await drain();
    expect(sent()).toEqual([[1, "IDC", "SENT"], [2, "IDC", "FAILED"]]);
    // Người khai xử lý tờ 2 (Gửi lại theo quy tắc hiện có) → tờ 2 DECLARED; gọi lại khai chính thức cả lô.
    const r2 = h.uow.data.results.find((r) => r.branch === 2)!;
    r2.raw = { ...r2.raw, stage: "DECLARED" };
    gw.declare = declare;
    unwrap(await declareAllSheets(h.deps, declarant, D));
    expect(sent()).toEqual([[1, "IDC", "SENT"], [2, "IDC", "FAILED"], [3, "IDC", "PENDING"]]);
  });
  it("chuỗi dừng khi guard của tờ kế tiếp lỗi (HS bị bỏ xác nhận giữa chừng) → ghi lỗi trên tờ đó, không tạo outbox", async () => {
    lot("PRE_DECLARED", "PRE_DECLARED");
    unwrap(await declareAllSheets(h.deps, declarant, D));
    h.decls.unconfirmedHs = 1;
    await run(h.uow.data.outbox[0]!.id);
    expect(sent()).toEqual([[1, "IDC", "SENT"]]);
    expect(h.uow.data.messages.filter((m) => m.branch === 2 && m.result === "ERROR")).toHaveLength(1);
    expect(h.uow.data.messages.find((m) => m.branch === 2 && m.result === "ERROR")!.summary).toMatch(/Tờ 2\/2: chưa khai chính thức tự động/);
  });
  it("lô một tờ → VALIDATION 'chỉ dùng cho lô nhiều tờ'", async () => {
    h.decls.items = lines(10);
    h.decls.status = "SUBMITTED";
    const e = errOf(await declareAllSheets(h.deps, declarant, D))!;
    expect(e.code).toBe("VALIDATION");
    expect(e.message).toMatch(/chỉ dùng cho lô nhiều tờ/);
  });
  it("còn tờ chờ gửi nội dung → SHEET_ORDER_DECLARE", async () => {
    lot("RECALLED", "PRE_DECLARED");
    expect(errOf(await declareAllSheets(h.deps, declarant, D))).toMatchObject({ code: "INVALID_STATE", reason: "SHEET_ORDER_DECLARE" });
    expect(h.uow.data.outbox).toHaveLength(0);
  });
  it("không tờ nào chờ khai chính thức → INVALID_STATE", async () => {
    lot("DECLARED", "CLEARED");
    expect(errOf(await declareAllSheets(h.deps, declarant, D))).toMatchObject({ code: "INVALID_STATE", message: "Không còn tờ nào chờ khai chính thức" });
  });
  it("có outbox PENDING của hồ sơ (tờ nào, nghiệp vụ nào) → INVALID_STATE 'đang gửi – chờ xong'", async () => {
    lot("PRE_DECLARED", "PRE_DECLARED");
    unwrap(await performOperation(h.deps, declarant, D, "IDC", 2));
    const e = errOf(await declareAllSheets(h.deps, declarant, D))!;
    expect(e.code).toBe("INVALID_STATE");
    expect(e.message).toMatch(/Đang gửi nghiệp vụ khác/);
    expect(h.uow.data.outbox).toHaveLength(1);
  });
  it("gọi hai lần liên tiếp → lần 2 lỗi, chỉ 1 outbox", async () => {
    lot("PRE_DECLARED", "PRE_DECLARED");
    unwrap(await declareAllSheets(h.deps, declarant, D));
    expect(errOf(await declareAllSheets(h.deps, declarant, D))).not.toBeNull();
    expect(h.uow.data.outbox).toHaveLength(1);
  });
  it("HS chưa xác nhận / còn BLOCKER → lỗi, không tạo outbox", async () => {
    lot("PRE_DECLARED", "PRE_DECLARED");
    h.decls.unconfirmedHs = 2;
    expect(errOf(await declareAllSheets(h.deps, declarant, D))).toMatchObject({ code: "HS_UNCONFIRMED" });
    h.decls.unconfirmedHs = 0;
    h.deps.validation = { blockerFails: async () => 1 };
    expect(errOf(await declareAllSheets(h.deps, declarant, D))).toMatchObject({ code: "BLOCKER_FAILED" });
    expect(h.uow.data.outbox).toHaveLength(0);
  });
  it("vai trò VIEWER bị từ chối; APPROVER được", async () => {
    lot("PRE_DECLARED", "PRE_DECLARED");
    expect(errOf(await declareAllSheets(h.deps, viewer, D))).toMatchObject({ code: "FORBIDDEN" });
    expect(h.uow.data.outbox).toHaveLength(0);
    unwrap(await declareAllSheets(h.deps, approver, D));
  });
  it("IDC thường (không chain) của tờ 1 SENT → không nối tờ kế (hành vi cũ)", async () => {
    lot("PRE_DECLARED", "PRE_DECLARED");
    unwrap(await performOperation(h.deps, declarant, D, "IDC", 1));
    expect(chainOf(0)).toBeUndefined();
    await drain();
    expect(sent()).toEqual([[1, "IDC", "SENT"]]);
  });
});
