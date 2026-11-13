import { beforeEach, describe, expect, it } from "vitest";
import { domainError } from "../../../../shared/errors.js";
import { RecordingUsageMeter } from "../../../../shared/usage.js";
import type { ContainerListRecord, KvgsSheetRecord, OutboxRow } from "../customs-ports.js";
import { KVGS_MAX_POLLS, KVGS_POLL_DELAY_MS, pollKvgs, pollKvgsNow } from "../poll-kvgs.js";
import { markOutboxFailed } from "../reopen-declaration.js";
import { hasBlockingPending, pendingOps } from "../_customs-view.js";
import { processOutbox } from "../process-outbox.js";
import { FakeCustomsGateway } from "../test/fake-customs-gateway.js";
import { D, declarant, makeHarness, ORG, seed, T, viewer, type Harness } from "./_sheets-harness.js";

let h: Harness;
let usage: RecordingUsageMeter;
const gw = (o: ConstructorParameters<typeof FakeCustomsGateway>[0]) => (h.deps.gateway = new FakeCustomsGateway(o)) as FakeCustomsGateway;
const list = (): ContainerListRecord => ({ id: "cl_1", orgId: ORG, dossierId: D, branch: 1, attempt: 1, rows: [], status: "SENDING", refId: null, receiptNo: null, receiptDate: null, errors: null, sentRows: [{ billNo: "HPSEL1", containerNo: "FBIU5802429", sealNo: "S1", note: "", source: "USER" as const }], sentBy: "usr_chau", sentAt: T, createdAt: T, updatedAt: T });
const kv = (): KvgsSheetRecord => ({ id: "kv_1", orgId: ORG, dossierId: D, branch: 1, status: "SENDING", refId: null, receiptNo: null, receiptDate: null, errors: null, sheet: null, raw: null, requestedBy: "usr_chau", requestedAt: T, fetchedAt: null, createdAt: T, updatedAt: T });
const ob = (operation: "CONT_LIST" | "KVGS", payload: unknown, key: string): OutboxRow => ({ id: `ob_${key}`, orgId: ORG, dossierId: D, branch: 1, declarationId: "dec_1", operation, idempotencyKey: key, payload, status: "PENDING", attempts: 0, lastError: null, nextAttemptAt: null, createdAt: T, updatedAt: T });
const run = (o: OutboxRow) => processOutbox(h.deps, { orgId: ORG, userId: "usr_chau", outboxId: o.id });
const poll = (kind: "CONT_LIST", id: string, n: number) => pollKvgs(h.deps, { orgId: ORG, userId: "usr_chau", kind, id, n });
/** Chạy hết chuỗi poll đã xếp (bỏ qua delay) tới khi không còn job mới. */
async function drain() {
  for (let i = 0; i < 100; i++) {
    const job = h.queue.jobs.filter((j) => j.name === "kvgs-poll")[i];
    if (!job) return;
    await pollKvgs(h.deps, job.payload as Parameters<typeof pollKvgs>[1]);
  }
}
beforeEach(() => {
  h = makeHarness();
  usage = new RecordingUsageMeter();
  h.deps.usage = usage;
  seed(h, 1, "CLEARED");
  h.uow.data.results[0]!.raw = { ...h.uow.data.results[0]!.raw, customsInfo: { registeredDate: "2026-10-14" } } as never;
});

describe("outbox CONT_LIST", () => {
  it("gửi → REF_ID + job kvgs-poll; PENDING ×2 → ACCEPTED lưu số tiếp nhận; usage hỏi 3 lần + gửi 1 lần", async () => {
    const g = gw({ refPendingPolls: 2 });
    h.uow.data.containerLists.push(list());
    const o = ob("CONT_LIST", { listId: "cl_1" }, "cont:cl_1:a1");
    h.uow.data.outbox.push(o);
    expect(await run(o)).toMatchObject({ ok: true, value: { status: "SENT" } });
    expect(g.containerListCalls[0]).toMatchObject({ declarationNo: "104000000001", registeredOn: "2026-10-14", taxCode: "0316789012", customsOffice: "03CE", typeCode: "A11", rows: [{ containerNo: "FBIU5802429", sealNo: "S1" }] });
    const cl = h.uow.data.containerLists[0]!;
    expect(cl.refId).toMatch(/^FAKE-CL/);
    expect(cl.status).toBe("SENDING");
    expect(h.queue.jobs).toEqual([expect.objectContaining({ name: "kvgs-poll", payload: { orgId: ORG, userId: "usr_chau", kind: "CONT_LIST", id: "cl_1", n: 1 }, delayMs: KVGS_POLL_DELAY_MS })]);
    await drain();
    const done = h.uow.data.containerLists[0]!;
    expect(done).toMatchObject({ status: "ACCEPTED", errors: null });
    expect(done.receiptNo).toMatch(/^\d{8}$/);
    expect(usage.events.filter((e) => e.kind === "CUSTOMS_QUERY")).toHaveLength(3);
    expect(usage.events.filter((e) => e.kind === "CUSTOMS_SEND")).toHaveLength(1);
    expect(h.uow.data.messages.map((m) => `${m.direction}:${m.result}`)).toEqual(["OUT:OK", "IN:OK", "IN:OK"]);
    expect(h.dossiers.events.length).toBeGreaterThan(0);
  });
  it("cổng từ chối khi gửi (thiếu seal) → REJECTED + errors, outbox SENT, không poll", async () => {
    gw({});
    h.uow.data.containerLists.push({ ...list(), sentRows: [{ billNo: "H", containerNo: "FBIU5802429", sealNo: "", note: "", source: "USER" as const }] });
    const o = ob("CONT_LIST", { listId: "cl_1" }, "cont:cl_1:a1");
    h.uow.data.outbox.push(o);
    await run(o);
    expect(h.uow.data.containerLists[0]).toMatchObject({ status: "REJECTED", errors: [expect.objectContaining({ code: "E-CONT-SEL" })] });
    expect(h.uow.data.outbox[0]!.status).toBe("SENT");
    expect(h.queue.jobs).toHaveLength(0);
  });
  it("Hải quan từ chối khi hỏi (seal REJECT…) → REJECTED", async () => {
    gw({});
    h.uow.data.containerLists.push({ ...list(), sentRows: [{ billNo: "H", containerNo: "FBIU5802429", sealNo: "REJECT1", note: "", source: "USER" as const }] });
    const o = ob("CONT_LIST", { listId: "cl_1" }, "cont:cl_1:a1");
    h.uow.data.outbox.push(o);
    await run(o);
    await drain();
    expect(h.uow.data.containerLists[0]).toMatchObject({ status: "REJECTED", errors: [expect.objectContaining({ code: "E-CONT-REJ" })] });
  });
  it("lỗi mạng → ném, outbox PENDING (retry), không tính phí", async () => {
    const g = gw({});
    h.uow.data.containerLists.push(list());
    const o = ob("CONT_LIST", { listId: "cl_1" }, "cont:cl_1:a1");
    h.uow.data.outbox.push(o);
    g.sendContainerList = async () => { throw new Error("ECONNRESET"); };
    await expect(run(o)).rejects.toThrow("ECONNRESET");
    expect(h.uow.data.outbox[0]).toMatchObject({ status: "PENDING", lastError: "ECONNRESET", attempts: 1 });
    expect(h.uow.data.containerLists[0]!.status).toBe("SENDING");
    expect(usage.events).toHaveLength(0);
  });
  it("chạy lại khi bản ghi đã có REF_ID (crash trước khi xếp job) → không gọi cổng, xếp lại job poll", async () => {
    const g = gw({});
    h.uow.data.containerLists.push({ ...list(), refId: "REF-1" });
    const o = ob("CONT_LIST", { listId: "cl_1" }, "cont:cl_1:a1");
    h.uow.data.outbox.push(o);
    expect(await run(o)).toMatchObject({ ok: true, value: { status: "SENT" } });
    expect(g.containerListCalls).toHaveLength(0);
    expect(h.queue.jobs).toHaveLength(1);
  });
  it("payload hỏng / bản ghi không có → outbox FAILED", async () => {
    const o = ob("CONT_LIST", { listId: "nope" }, "cont:x:a1");
    h.uow.data.outbox.push(o);
    expect(await run(o)).toMatchObject({ ok: true, value: { status: "FAILED" } });
  });
});

describe("outbox KVGS (POST /api/KVGS – một lời gọi đồng bộ)", () => {
  const start = (payload: unknown = { kvgsId: "kv_1" }) => {
    h.uow.data.kvgs.push(kv());
    const o = ob("KVGS", payload, "kvgs:kv_1");
    h.uow.data.outbox.push(o);
    return o;
  };
  it("→ ACCEPTED ngay: sheet, raw, fetchedAt = clock; không REF_ID / số tiếp nhận, không job kvgs-poll; phí gửi 1 lần", async () => {
    const g = gw({});
    const o = start();
    expect(await run(o)).toMatchObject({ ok: true, value: { status: "SENT" } });
    expect(g.kvgsCalls).toEqual([{ dossierId: D, declarationNo: "104000000001", registeredOn: "2026-10-14", customsOffice: "03CE", taxCode: "0316789012" }]);
    const k = h.uow.data.kvgs[0]!;
    expect(k).toMatchObject({ status: "ACCEPTED", errors: null, refId: null, receiptNo: null, receiptDate: null, fetchedAt: T });
    expect(k.sheet?.containers).toHaveLength(1);
    expect(k.raw).toBeTruthy();
    expect(h.uow.data.outbox[0]).toMatchObject({ status: "SENT", lastError: null });
    expect(h.queue.jobs.filter((j) => j.name === "kvgs-poll")).toHaveLength(0);
    expect(h.uow.data.messages.map((m) => `${m.direction}:${m.result}`)).toEqual(["OUT:OK", "IN:OK"]);
    expect(usage.events).toEqual([expect.objectContaining({ kind: "CUSTOMS_SEND", operation: "KVGS", dedupeKey: "customs:kvgs:kv_1" })]);
    expect(h.dossiers.events.length).toBeGreaterThan(0);
  });
  it("payload cũ còn `kind` vẫn xử lý được (API tự quyết loại hàng)", async () => {
    gw({ kvgsKind: "CARGO" });
    await run(start({ kvgsId: "kv_1", kind: "CONTAINER" }));
    expect(h.uow.data.kvgs[0]).toMatchObject({ status: "ACCEPTED", sheet: { kind: "CARGO", barcode: "104000000001" } });
  });
  it("thiếu dữ liệu để in → REJECTED + KVGS_RESPONSE_INCOMPLETE, raw vẫn lưu, outbox SENT, có tính phí", async () => {
    gw({ kvgsOutcome: "INCOMPLETE" });
    await run(start());
    expect(h.uow.data.kvgs[0]).toMatchObject({ status: "REJECTED", sheet: null, raw: expect.anything(), errors: [expect.objectContaining({ code: "KVGS_RESPONSE_INCOMPLETE" })] });
    expect(h.uow.data.outbox[0]!.status).toBe("SENT");
    expect(usage.events).toHaveLength(1);
  });
  it("errorList của FPT → REJECTED + errors, thông điệp IN lỗi", async () => {
    gw({ kvgsOutcome: "REJECTED" });
    await run(start());
    expect(h.uow.data.kvgs[0]).toMatchObject({ status: "REJECTED", errors: [expect.objectContaining({ code: "E-KVGS-001" })] });
    expect(h.uow.data.messages.map((m) => `${m.direction}:${m.result}`)).toEqual(["OUT:OK", "IN:ERROR"]);
  });
  it("lỗi mạng/5xx → ném (retry), outbox PENDING + lastError, bản kê vẫn SENDING, không tính phí; lần sau thành công", async () => {
    const g = gw({});
    const o = start();
    const real = g.fetchKvgs.bind(g);
    g.fetchKvgs = async () => { throw new Error("ECONNRESET"); };
    await expect(run(o)).rejects.toThrow("ECONNRESET");
    expect(h.uow.data.outbox[0]).toMatchObject({ status: "PENDING", lastError: "ECONNRESET", attempts: 1 });
    expect(h.uow.data.kvgs[0]!.status).toBe("SENDING");
    expect(usage.events).toHaveLength(0);
    g.fetchKvgs = real;
    await run(h.uow.data.outbox[0]!);
    expect(h.uow.data.kvgs[0]!.status).toBe("ACCEPTED");
    expect(h.uow.data.messages.filter((m) => m.direction === "OUT")).toHaveLength(1);
  });
  it("lỗi vĩnh viễn (chưa cấu hình) → REJECTED ngay, outbox FAILED, không retry/không tính phí", async () => {
    const g = gw({});
    g.fetchKvgs = async () => { throw domainError("INTEGRATION_NOT_CONFIGURED", "Chưa cấu hình tài khoản VNACCS"); };
    expect(await run(start())).toMatchObject({ ok: true, value: { status: "FAILED" } });
    expect(h.uow.data.kvgs[0]).toMatchObject({ status: "REJECTED", errors: [expect.objectContaining({ code: "INTEGRATION_NOT_CONFIGURED" })] });
    expect(usage.events).toHaveLength(0);
  });
  it("outbox đã SENT (job chạy lại) → không gọi cổng lần hai", async () => {
    const g = gw({});
    const o = start();
    await run(o);
    await run(h.uow.data.outbox[0]!);
    expect(g.kvgsCalls).toHaveLength(1);
    expect(usage.events).toHaveLength(1);
  });
  it("org khác không đọc được bản kê của outbox", async () => {
    const g = gw({});
    const o = start();
    await processOutbox(h.deps, { orgId: "org_b", userId: "usr_chau", outboxId: o.id });
    expect(g.kvgsCalls).toHaveLength(0);
    expect(h.uow.data.kvgs[0]!.status).toBe("SENDING");
  });
});

describe("pollKvgs", () => {
  it("PENDING mãi: tới lần KVGS_MAX_POLLS → NO_RESPONSE; trước đó xếp lượt kế", async () => {
    gw({ refPendingPolls: 1000 });
    h.uow.data.containerLists.push({ ...list(), refId: "R1" });
    expect(await poll("CONT_LIST", "cl_1", 1)).toMatchObject({ ok: true, value: { again: true } });
    expect(h.queue.jobs[0]).toMatchObject({ payload: { n: 2 }, delayMs: KVGS_POLL_DELAY_MS });
    expect(await poll("CONT_LIST", "cl_1", KVGS_MAX_POLLS)).toMatchObject({ ok: true, value: { again: false } });
    expect(h.uow.data.containerLists[0]!.status).toBe("NO_RESPONSE");
    expect(h.queue.jobs).toHaveLength(1);
  });
  it("bản đã ACCEPTED → không hỏi cổng, không tính phí", async () => {
    h.uow.data.containerLists.push({ ...list(), refId: "R1", status: "ACCEPTED" });
    expect(await poll("CONT_LIST", "cl_1", 1)).toMatchObject({ ok: true, value: { again: false } });
    expect(usage.events).toHaveLength(0);
  });
  it("org khác không thấy bản ghi", async () => {
    h.uow.data.containerLists.push({ ...list(), refId: "R1" });
    expect(await pollKvgs(h.deps, { orgId: "org_b", userId: "u", kind: "CONT_LIST", id: "cl_1", n: 1 })).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });
});

describe("chi phí & lỗi cấu hình", () => {
  it("poll tự động chạy lại (BullMQ retry) cùng lần n → tính phí một lần; lần n khác tính riêng", async () => {
    gw({ refPendingPolls: 1000 });
    h.uow.data.containerLists.push({ ...list(), refId: "R1" });
    await poll("CONT_LIST", "cl_1", 1);
    await poll("CONT_LIST", "cl_1", 1);
    expect(usage.events.filter((e) => e.kind === "CUSTOMS_QUERY")).toHaveLength(1);
    expect(usage.events[0]!.dedupeKey).toBe("kvgs-poll:CONT_LIST:cl_1:1");
    await poll("CONT_LIST", "cl_1", 2);
    expect(usage.events).toHaveLength(2);
  });
  it("gateway ném INTEGRATION_NOT_CONFIGURED khi gửi → REJECTED rõ ràng, outbox FAILED, không retry", async () => {
    const g = gw({});
    g.sendContainerList = async () => { throw domainError("INTEGRATION_NOT_CONFIGURED", "Chưa cấu hình tài khoản VNACCS của doanh nghiệp"); };
    h.uow.data.containerLists.push(list());
    const o = ob("CONT_LIST", { listId: "cl_1" }, "cont:cl_1:a1");
    h.uow.data.outbox.push(o);
    expect(await run(o)).toMatchObject({ ok: true, value: { status: "FAILED" } });
    expect(h.uow.data.containerLists[0]).toMatchObject({ status: "REJECTED", errors: [expect.objectContaining({ code: "INTEGRATION_NOT_CONFIGURED", message: expect.stringContaining("VNACCS") })] });
    expect(h.uow.data.outbox[0]!.status).toBe("FAILED");
    expect(usage.events).toHaveLength(0);
    expect(h.queue.jobs).toHaveLength(0);
  });
  it("gateway ném INTEGRATION_NOT_CONFIGURED khi hỏi kết quả → REJECTED, không xếp lượt kế (không retry)", async () => {
    const g = gw({});
    g.containerListResult = async () => { throw domainError("INTEGRATION_NOT_CONFIGURED", "Chưa cấu hình tài khoản VNACCS"); };
    h.uow.data.containerLists.push({ ...list(), refId: "R1" });
    expect(await poll("CONT_LIST", "cl_1", 1)).toMatchObject({ ok: true, value: { again: false } });
    expect(h.uow.data.containerLists[0]).toMatchObject({ status: "REJECTED", errors: [expect.objectContaining({ code: "INTEGRATION_NOT_CONFIGURED" })] });
    expect(h.queue.jobs).toHaveLength(0);
  });
});

describe("pollKvgsNow", () => {
  it("NO_RESPONSE → hỏi một lượt, có kết quả thì ACCEPTED, không xếp job", async () => {
    gw({});
    h.uow.data.containerLists.push({ ...list(), refId: "R1", status: "NO_RESPONSE" });
    expect(await pollKvgsNow(h.deps, declarant, D, 1)).toMatchObject({ ok: true });
    expect(h.uow.data.containerLists[0]!.status).toBe("ACCEPTED");
    expect(h.queue.jobs).toHaveLength(0);
  });
  it("vẫn PENDING → giữ nguyên NO_RESPONSE, không xếp job", async () => {
    gw({ refPendingPolls: 5 });
    h.uow.data.containerLists.push({ ...list(), refId: "R1", status: "NO_RESPONSE" });
    await pollKvgsNow(h.deps, declarant, D, 1);
    expect(h.uow.data.containerLists[0]!.status).toBe("NO_RESPONSE");
    expect(h.queue.jobs).toHaveLength(0);
  });
  it("không có bản SENDING/NO_RESPONSE → INVALID_STATE; VIEWER → FORBIDDEN", async () => {
    h.uow.data.containerLists.push({ ...list(), refId: "R1", status: "ACCEPTED" });
    expect(await pollKvgsNow(h.deps, declarant, D, 1)).toMatchObject({ ok: false, error: { code: "INVALID_STATE" } });
    expect(await pollKvgsNow(h.deps, viewer, D, 1)).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
  });
});

describe("markOutboxFailed (BullMQ hết lượt thử)", () => {
  it("CONT_LIST: bản ghi SENDING chưa REF_ID → REJECTED E-SEND, outbox FAILED, không đụng kết quả truyền của tờ khai", async () => {
    h.uow.data.containerLists.push(list());
    const o = ob("CONT_LIST", { listId: "cl_1" }, "cont:cl_1:a1");
    h.uow.data.outbox.push(o);
    const before = JSON.stringify(h.uow.data.results);
    expect((await markOutboxFailed(h.deps, { orgId: ORG, outboxId: o.id, reason: "timeout" })).ok).toBe(true);
    expect(h.uow.data.containerLists[0]).toMatchObject({ status: "REJECTED", errors: [{ code: "E-SEND", message: "timeout" }] });
    expect(h.uow.data.outbox[0]).toMatchObject({ status: "FAILED", lastError: "timeout" });
    expect(JSON.stringify(h.uow.data.results)).toBe(before);
  });
  it("KVGS: bản kê SENDING → REJECTED E-SEND; có thể yêu cầu lại; kết quả truyền không đổi", async () => {
    h.uow.data.kvgs.push(kv());
    const o = ob("KVGS", { kvgsId: "kv_1" }, "kvgs:kv_1");
    h.uow.data.outbox.push(o);
    const before = JSON.stringify(h.uow.data.results);
    await markOutboxFailed(h.deps, { orgId: ORG, outboxId: o.id, reason: "FPT 503" });
    expect(h.uow.data.kvgs[0]).toMatchObject({ status: "REJECTED", errors: [{ code: "E-SEND", message: "FPT 503" }] });
    expect(h.uow.data.outbox[0]!.status).toBe("FAILED");
    expect(JSON.stringify(h.uow.data.results)).toBe(before);
  });
  it("bản ghi không còn SENDING / đã có REF_ID → giữ nguyên; payload hỏng không ném", async () => {
    h.uow.data.kvgs.push({ ...kv(), status: "ACCEPTED" });
    const o = ob("KVGS", { kvgsId: "kv_1" }, "kvgs:kv_1");
    const bad = ob("CONT_LIST", { sai: 1 }, "cont:bad");
    h.uow.data.outbox.push(o, bad);
    await markOutboxFailed(h.deps, { orgId: ORG, outboxId: o.id, reason: "x" });
    await markOutboxFailed(h.deps, { orgId: ORG, outboxId: bad.id, reason: "x" });
    expect(h.uow.data.kvgs[0]!.status).toBe("ACCEPTED");
    expect(h.uow.data.outbox.map((x) => x.status)).toEqual(["FAILED", "FAILED"]);
  });
});

describe("outbox CONT_LIST/KVGS đang PENDING không phải nghiệp vụ tờ khai đang chờ", () => {
  it("hasBlockingPending / pendingOps bỏ qua; IDA vẫn tính", () => {
    const k = ob("KVGS", { kvgsId: "kv_1" }, "k1");
    const c = ob("CONT_LIST", { listId: "cl_1" }, "k2");
    expect(hasBlockingPending([k, c])).toBe(false);
    expect(pendingOps([k, c])).toEqual([]);
    const ida = { ...ob("KVGS", {}, "k3"), operation: "IDA" } as unknown as OutboxRow;
    expect(hasBlockingPending([k, c, ida], 1)).toBe(true);
    expect(pendingOps([k, c, ida])).toEqual(["IDA"]);
  });
});
