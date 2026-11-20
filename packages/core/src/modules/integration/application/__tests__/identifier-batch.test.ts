import { IdentifierBatchRequestSchema, type IdentifierBatchRequest, type IdentifierRequest } from "@kb/contracts";
import { beforeEach, describe, expect, it } from "vitest";
import { RecordingOrgAudit } from "../../../../shared/audit.js";
import type { RecordingNotifier } from "../../../../shared/notifier.js";
import { RecordingUsageMeter } from "../../../../shared/usage.js";
import { deleteIdentifiers, listIdentifiers, notifyIdentifierBatchDone, pollIdentifierById, releaseIdentifier, requestIdentifierBatch, retryIdentifier, useIdentifier } from "../identifier-batch.js";
import { markIdentifierFailed, pollIdentifier, processIdentifier, requeueStuckIdentifiers, type IdentifierPollInput, type IdentifierSendInput } from "../identifier.js";
import { FakeCustomsGateway } from "../test/fake-customs-gateway.js";
import { D, declarant, makeHarness, ORG, other, viewer, type Harness } from "./_sheets-harness.js";

let h: Harness;
let usage: RecordingUsageMeter;
const gw = (o: ConstructorParameters<typeof FakeCustomsGateway>[0]) => (h.deps.gateway = new FakeCustomsGateway({ clock: h.deps.clock, ...o })) as FakeCustomsGateway;
const REQ: IdentifierRequest = { objectType: "1", goodsType: "2", customsOffice: "60CB", taxCode: "0313833810", companyName: "test", agentTaxCode: "", agentName: "" };
const KEY = "11111111-1111-4111-8111-111111111111";
const batch = (count = 3): IdentifierBatchRequest => ({ clientKey: KEY, count, request: REQ });
const jobsOf = (name: string) => h.queue.jobs.filter((j) => j.name === name);
const rows = () => h.uow.data.identifiers;

/** Chạy mọi job identifier-send rồi hết chuỗi identifier-poll (bỏ qua delay). */
async function drain() {
  for (const j of jobsOf("identifier-send")) await processIdentifier(h.deps, j.payload as IdentifierSendInput);
  for (let i = 0; i < 200; i++) {
    const j = jobsOf("identifier-poll")[i];
    if (!j) return;
    await pollIdentifier(h.deps, j.payload as IdentifierPollInput);
  }
}

beforeEach(() => {
  h = makeHarness();
  usage = new RecordingUsageMeter();
  h.deps.usage = usage;
  h.deps.vnaccsUserId = async () => "BI820001";
});

describe("requestIdentifierBatch – xin số theo lô", () => {
  it("requestIdentifierBatch_creates_N_rows_and_N_jobs", async () => {
    const res = await requestIdentifierBatch(h.deps, declarant, batch(3));
    expect(res.ok).toBe(true);
    expect(rows()).toHaveLength(3);
    expect(rows().map((r) => [r.status, r.batchId, r.batchIndex, r.attempt, r.dossierId])).toEqual([1, 2, 3].map((i) => ["SENDING", KEY, i, 1, null]));
    expect(res).toMatchObject({ ok: true, value: { batchId: KEY, ids: rows().map((r) => r.id) } });
    expect(jobsOf("identifier-send").map((j) => j.jobId)).toEqual(rows().map((r) => `identifier-send:${r.id}:1`));
  });
  it("requestIdentifierBatch_same_clientKey_returns_existing_batch", async () => {
    const first = await requestIdentifierBatch(h.deps, declarant, batch(3));
    const second = await requestIdentifierBatch(h.deps, declarant, batch(3));
    expect(second).toEqual(first);
    expect(rows()).toHaveLength(3);
    expect(jobsOf("identifier-send")).toHaveLength(3);
  });
  it("requestIdentifierBatch_count_out_of_range_rejected_by_schema", () => {
    expect(IdentifierBatchRequestSchema.safeParse(batch(0)).success).toBe(false);
    expect(IdentifierBatchRequestSchema.safeParse(batch(51)).success).toBe(false);
    expect(IdentifierBatchRequestSchema.safeParse(batch(50)).success).toBe(true);
  });
  it("viewer_cannot_request_batch", async () => {
    expect(await requestIdentifierBatch(h.deps, viewer, batch(3))).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(rows()).toHaveLength(0);
  });
  it("batch_rows_flow_through_send_and_poll", async () => {
    const g = gw({ identifierMode: "ASYNC", refPendingPolls: 1 });
    await requestIdentifierBatch(h.deps, declarant, batch(3));
    await drain();
    expect(rows().map((r) => r.status)).toEqual(["ACCEPTED", "ACCEPTED", "ACCEPTED"]);
    expect(g.identifierCalls.every((c) => c.dossierId === undefined)).toBe(true);
    const sends = usage.events.filter((e) => e.operation === "V5IdentifierReq");
    expect(sends).toHaveLength(3);
    expect(sends.every((e) => e.dossierId === null)).toBe(true);
    expect(h.dossiers.events).toHaveLength(0);
  });
});

describe("báo lô xong", () => {
  it("batch_done_notifies_once", async () => {
    const g = gw({});
    const orig = g.sendIdentifier.bind(g);
    let n = 0;
    g.sendIdentifier = async (o, req, k) => (++n === 2 ? { state: "REJECTED", errors: [{ code: "E-X", message: "sai" }] } : orig(o, req, k));
    await requestIdentifierBatch(h.deps, declarant, batch(3));
    await drain();
    const done = jobsOf("identifier-batch-done");
    expect(done).toEqual([expect.objectContaining({ jobId: `identifier-batch-done:${KEY}:3`, payload: { orgId: ORG, batchId: KEY } })]);
    await notifyIdentifierBatchDone(h.deps, done[0]!.payload as { orgId: string; batchId: string });
    const sent = (h.deps.notify as RecordingNotifier).sent;
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ orgId: ORG, audience: { userIds: ["usr_chau"] }, draft: { body: "Lô 3 định danh: 2 có số, 1 bị từ chối, 0 chưa phản hồi", href: `/customs/ops?batchId=${KEY}` } });
  });
  it("lô còn dòng SENDING khi job chạy (đã gửi lại) → không báo", async () => {
    gw({});
    await requestIdentifierBatch(h.deps, declarant, batch(2));
    rows()[1]!.status = "SENDING";
    await notifyIdentifierBatchDone(h.deps, { orgId: ORG, batchId: KEY });
    expect((h.deps.notify as RecordingNotifier).sent).toHaveLength(0);
  });
  it("lô xong không đếm dòng đã xóa mềm", async () => {
    gw({});
    await requestIdentifierBatch(h.deps, declarant, batch(3));
    const [a, b, c] = rows();
    Object.assign(a!, { status: "ACCEPTED", identifierNo: "1" });
    Object.assign(b!, { status: "REJECTED", deletedAt: new Date(), deletedBy: "usr_chau" });
    Object.assign(c!, { status: "ACCEPTED", identifierNo: "3" });
    await notifyIdentifierBatchDone(h.deps, { orgId: ORG, batchId: KEY });
    expect((h.deps.notify as RecordingNotifier).sent[0]).toMatchObject({ draft: { body: "Lô 2 định danh: 2 có số, 0 bị từ chối, 0 chưa phản hồi" } });
  });
  it("gửi lại lần lượt hai dòng cùng lên attempt 2 → mỗi lần xong đều báo (jobId theo tổng attempt)", async () => {
    gw({});
    await requestIdentifierBatch(h.deps, declarant, batch(2));
    for (const r of rows()) r.status = "REJECTED";
    h.queue.jobs.length = 0;
    for (const r of rows()) {
      await retryIdentifier(h.deps, declarant, r.id);
      await processIdentifier(h.deps, jobsOf("identifier-send").at(-1)!.payload as IdentifierSendInput);
    }
    expect(jobsOf("identifier-batch-done").map((j) => j.jobId)).toEqual([`identifier-batch-done:${KEY}:3`, `identifier-batch-done:${KEY}:4`]);
  });
  it("xóa mềm một dòng rồi gửi lại → jobId tính cả dòng đã xóa nên không trùng lần trước", async () => {
    gw({});
    await requestIdentifierBatch(h.deps, declarant, batch(3));
    const [, b, c] = rows();
    for (const r of rows()) r.status = "REJECTED";
    h.queue.jobs.length = 0;
    const resend = async () => {
      await retryIdentifier(h.deps, declarant, c!.id);
      await processIdentifier(h.deps, jobsOf("identifier-send").at(-1)!.payload as IdentifierSendInput);
      Object.assign(rows().find((x) => x.id === c!.id)!, { status: "REJECTED", identifierNo: null });
    };
    await resend();
    Object.assign(b!, { deletedAt: new Date(), deletedBy: "usr_chau" });
    await resend();
    const ids = jobsOf("identifier-batch-done").map((j) => j.jobId);
    expect(ids.at(-1)).toBe(`identifier-batch-done:${KEY}:5`);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("dòng gắn hồ sơ không thuộc kho số theo lô", () => {
  const bound = (id: string, attempt: number, p: Partial<(typeof h.uow.data.identifiers)[number]> = {}) =>
    rows().push({ id, orgId: ORG, dossierId: D, attempt, status: "ACCEPTED", request: REQ, refId: null, receiptNo: null, receiptDate: null, customsState: null, identifierNo: `NO-${id}`, identifiedOn: "2026-10-14", qrPng: null, resultText: null, errors: null, sendAttempts: 1, sentBy: "usr_chau", sentAt: new Date(), batchId: null, batchIndex: null, usedAt: null, usedByDossierId: null, deletedAt: null, deletedBy: null, createdAt: new Date(), updatedAt: new Date(), ...p });
  it("không liệt kê, không dùng, không xóa được", async () => {
    bound("idn_dos_ok", 1);
    bound("idn_dos_rej", 2, { status: "REJECTED", identifierNo: null, identifiedOn: null });
    expect(await listIdentifiers(h.deps, declarant, { offset: 0, limit: 200 })).toMatchObject({ ok: true, value: { total: 0, items: [], expiringCount: 0 } });
    h.dossiers.rows.push({ ...h.dossiers.rows[0]!, id: "dos_2" });
    expect(await useIdentifier(h.deps, declarant, "idn_dos_ok", "dos_2")).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(rows()[0]!.usedByDossierId).toBeNull();
    expect(await deleteIdentifiers(h.deps, declarant, ["idn_dos_rej"])).toEqual({ ok: true, value: { deleted: [] } });
    expect(rows()[1]!.deletedAt).toBeNull();
    expect(await retryIdentifier(h.deps, declarant, "idn_dos_rej")).toMatchObject({ ok: false, error: { code: "INVALID_STATE" } });
  });
});

describe("listIdentifiers / deleteIdentifiers / useIdentifier / retryIdentifier", () => {
  const seed = async (count = 3) => {
    await requestIdentifierBatch(h.deps, declarant, batch(count));
    return rows();
  };
  const accept = (r: (typeof h.uow.data.identifiers)[number], identifiedOn = "2026-10-14") => Object.assign(r, { status: "ACCEPTED", identifierNo: `1226${r.batchIndex}`, identifiedOn });

  it("listIdentifiers: mọi thành viên xem được, có trạng thái hiển thị và hạn dùng", async () => {
    const [a] = await seed(2);
    accept(a!);
    const res = await listIdentifiers(h.deps, viewer, { offset: 0, limit: 20 });
    expect(res).toMatchObject({ ok: true, value: { total: 2, expiringCount: 0 } });
    if (!res.ok) return;
    expect(res.value.items.map((i) => [i.batchIndex, i.displayStatus, i.expiresOn, i.expiringSoon])).toEqual([[1, "AVAILABLE", "2026-12-31", false], [2, "SENDING", null, false]]);
  });
  it("deleteIdentifiers_only_failed_rows", async () => {
    const audit = new RecordingOrgAudit();
    h.deps.orgAudit = audit;
    const [a, b, c] = await seed(3);
    accept(a!);
    b!.status = "REJECTED";
    expect(await deleteIdentifiers(h.deps, viewer, [b!.id])).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(await deleteIdentifiers(h.deps, declarant, [a!.id, b!.id, c!.id])).toEqual({ ok: true, value: { deleted: [b!.id] } });
    expect(rows().find((r) => r.id === b!.id)!.deletedAt).not.toBeNull();
    expect(audit.entries).toEqual([expect.objectContaining({ orgId: ORG, userId: "usr_chau", action: "IDENTIFIER_DELETED", targetType: "customs_identifier", detail: { ids: [b!.id] } })]);
    // Không còn gì để xóa → không ghi audit.
    await deleteIdentifiers(h.deps, declarant, [b!.id]);
    expect(audit.entries).toHaveLength(1);
  });
  it("useIdentifier_already_used_returns_IDENTIFIER_TAKEN", async () => {
    const [a] = await seed(1);
    accept(a!);
    expect(await useIdentifier(h.deps, declarant, a!.id, D)).toEqual({ ok: true, value: { identifierNo: "12261" } });
    expect(rows()[0]).toMatchObject({ usedByDossierId: D });
    // Bấm lại cùng hồ sơ → vẫn được (idempotent); hồ sơ khác → IDENTIFIER_TAKEN.
    expect(await useIdentifier(h.deps, declarant, a!.id, D)).toEqual({ ok: true, value: { identifierNo: "12261" } });
    h.dossiers.rows.push({ ...h.dossiers.rows[0]!, id: "dos_2" });
    expect(await useIdentifier(h.deps, declarant, a!.id, "dos_2")).toMatchObject({ ok: false, error: { code: "INVALID_STATE", reason: "IDENTIFIER_TAKEN" } });
    expect(await useIdentifier(h.deps, declarant, a!.id, "dos_none")).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await releaseIdentifier(h.deps, declarant, a!.id, D)).toEqual({ ok: true, value: undefined });
    expect(rows()[0]).toMatchObject({ usedAt: null, usedByDossierId: null });
  });
  it("useIdentifier_expired_returns_IDENTIFIER_EXPIRED", async () => {
    const [a] = await seed(1);
    accept(a!, "2025-06-01");
    expect(await useIdentifier(h.deps, declarant, a!.id, D)).toMatchObject({ ok: false, error: { code: "INVALID_STATE", reason: "IDENTIFIER_EXPIRED" } });
    expect(rows()[0]!.usedAt).toBeNull();
  });
  it("doanh nghiệp khác không xem / xóa / dùng / gửi lại được", async () => {
    const [a, b] = await seed(2);
    accept(a!);
    b!.status = "REJECTED";
    expect(await listIdentifiers(h.deps, other, { offset: 0, limit: 20 })).toMatchObject({ ok: true, value: { total: 0, items: [] } });
    expect(await deleteIdentifiers(h.deps, other, [b!.id])).toEqual({ ok: true, value: { deleted: [] } });
    expect(await useIdentifier(h.deps, other, a!.id, D)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await retryIdentifier(h.deps, other, b!.id)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await requestIdentifierBatch(h.deps, other, batch(2))).toMatchObject({ ok: true });
    expect(rows().filter((r) => r.orgId === ORG).map((r) => r.status)).toEqual(["ACCEPTED", "REJECTED"]);
  });
  it("retryIdentifier_resets_and_enqueues_new_jobId", async () => {
    const [a, b] = await seed(2);
    Object.assign(a!, { status: "REJECTED", refId: "R1", receiptNo: "9", errors: [{ code: "E", message: "x" }], sendAttempts: 2 });
    accept(b!);
    h.queue.jobs.length = 0;
    expect(await retryIdentifier(h.deps, declarant, a!.id)).toEqual({ ok: true, value: undefined });
    expect(rows()[0]).toMatchObject({ status: "SENDING", attempt: 2, refId: null, receiptNo: null, receiptDate: null, errors: null, sendAttempts: 0 });
    expect(h.queue.jobs).toEqual([expect.objectContaining({ name: "identifier-send", jobId: `identifier-send:${a!.id}:2` })]);
    // Lần gửi lại là lời gọi FPT mới → tính phí với khóa riêng (không bị gộp vào lần gửi đầu).
    gw({});
    await processIdentifier(h.deps, h.queue.jobs[0]!.payload as IdentifierSendInput);
    expect(rows()[0]!.status).toBe("ACCEPTED");
    expect(usage.events.map((e) => e.dedupeKey)).toEqual([`customs:identifier:${a!.id}:2`]);
    expect(jobsOf("identifier-batch-done").map((j) => j.jobId)).toEqual([`identifier-batch-done:${KEY}:3`]);
    expect(await retryIdentifier(h.deps, declarant, b!.id)).toMatchObject({ ok: false, error: { code: "INVALID_STATE" } });
    expect(await retryIdentifier(h.deps, viewer, a!.id)).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
  });
  it("retryIdentifier: dòng bị xóa cùng lúc (sau khi đọc) → INVALID_STATE, không hồi sinh, không xếp job", async () => {
    const [a] = await seed(1);
    a!.status = "REJECTED";
    h.queue.jobs.length = 0;
    const orig = h.uow.asOrg.bind(h.uow);
    h.uow.asOrg = ((ctx, fn) =>
      orig(ctx, (r) =>
        fn({ ...r, identifiers: { ...r.identifiers, get: async (o, i) => {
          const x = await r.identifiers.get(o, i);
          Object.assign(rows()[0]!, { deletedAt: new Date(), deletedBy: "usr_khac" });
          return x;
        } } }),
      )) as typeof h.uow.asOrg;
    expect(await retryIdentifier(h.deps, declarant, a!.id)).toMatchObject({ ok: false, error: { code: "INVALID_STATE" } });
    expect(rows()[0]).toMatchObject({ status: "REJECTED", attempt: 1 });
    expect(h.queue.jobs).toHaveLength(0);
  });
});

describe("pollIdentifierById – hỏi kết quả một dòng", () => {
  it("pollIdentifierById_polls_row_with_refId_once", async () => {
    gw({ identifierMode: "ASYNC", refPendingPolls: 0 });
    await requestIdentifierBatch(h.deps, declarant, batch(1));
    await processIdentifier(h.deps, jobsOf("identifier-send")[0]!.payload as IdentifierSendInput);
    expect(rows()[0]).toMatchObject({ status: "SENDING", refId: expect.any(String) });
    expect(await pollIdentifierById(h.deps, declarant, rows()[0]!.id)).toEqual({ ok: true, value: undefined });
    expect(rows()[0]!.status).toBe("ACCEPTED");
    expect(await pollIdentifierById(h.deps, other, rows()[0]!.id)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });
  it("pollIdentifierById_invalid_state_without_refId", async () => {
    await requestIdentifierBatch(h.deps, declarant, batch(1));
    expect(await pollIdentifierById(h.deps, declarant, rows()[0]!.id)).toMatchObject({ ok: false, error: { code: "INVALID_STATE" } });
    expect(await pollIdentifierById(h.deps, viewer, rows()[0]!.id)).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
  });
});

describe("job còn sót sau Gửi lại (attempt cũ)", () => {
  const queries = () => usage.events.filter((e) => e.operation === "V5IdentifierRes").length;
  /** Lô 1 dòng: gửi (ASYNC → có REF_ID, xếp hỏi lần 1) rồi dòng thành NO_RESPONSE và người dùng bấm Gửi lại → attempt 2. */
  async function retried() {
    gw({ identifierMode: "ASYNC", refPendingPolls: 100 });
    await requestIdentifierBatch(h.deps, declarant, batch(1));
    await processIdentifier(h.deps, jobsOf("identifier-send")[0]!.payload as IdentifierSendInput);
    const oldPoll = jobsOf("identifier-poll")[0]!;
    expect(oldPoll).toMatchObject({ jobId: `identifier-poll:${rows()[0]!.id}:1:1`, payload: { attempt: 1, n: 1 } });
    rows()[0]!.status = "NO_RESPONSE";
    await retryIdentifier(h.deps, declarant, rows()[0]!.id);
    return oldPoll.payload as IdentifierPollInput;
  }

  it("lượt hỏi của attempt cũ không hỏi, không xếp lượt kế, không đổi attempt mới", async () => {
    const stale = await retried();
    const before = h.queue.jobs.length;
    expect(await pollIdentifier(h.deps, stale)).toEqual({ ok: true, value: { again: false } });
    // Attempt 2 đã có REF_ID mới: job cũ vẫn bỏ qua.
    await processIdentifier(h.deps, jobsOf("identifier-send").at(-1)!.payload as IdentifierSendInput);
    expect(jobsOf("identifier-poll").at(-1)).toMatchObject({ jobId: `identifier-poll:${rows()[0]!.id}:2:1`, payload: { attempt: 2, n: 1 } });
    const q = queries();
    const polls = jobsOf("identifier-poll").length;
    expect(await pollIdentifier(h.deps, { ...stale, n: 39 })).toEqual({ ok: true, value: { again: false } });
    expect(queries()).toBe(q);
    expect(jobsOf("identifier-poll")).toHaveLength(polls);
    expect(rows()[0]).toMatchObject({ status: "SENDING", attempt: 2 });
    expect(h.queue.jobs.length).toBeGreaterThan(before);
  });
  it("markIdentifierFailed của attempt cũ không đụng attempt mới; đúng attempt thì có", async () => {
    await retried();
    const id = rows()[0]!.id;
    await markIdentifierFailed(h.deps, { orgId: ORG, id, reason: "timeout", attempt: 1 });
    expect(rows()[0]).toMatchObject({ status: "SENDING", attempt: 2 });
    await markIdentifierFailed(h.deps, { orgId: ORG, id, reason: "timeout", attempt: 2 });
    expect(rows()[0]).toMatchObject({ status: "REJECTED", attempt: 2 });
  });
  it("lượt hỏi còn chờ ghi updatedAt → stuck-sweeper không cắt chuỗi hỏi đang chạy", async () => {
    const g = gw({ identifierMode: "ASYNC", refPendingPolls: 100 });
    await requestIdentifierBatch(h.deps, declarant, batch(1));
    await processIdentifier(h.deps, jobsOf("identifier-send")[0]!.payload as IdentifierSendInput);
    // Cổng trả "còn chờ" trơn, không trường nào mới.
    g.identifierResult = async () => ({ state: "PENDING" });
    // Chuỗi hỏi đã chạy lâu: lần đổi cuối cách đây 20 phút.
    rows()[0]!.updatedAt = new Date(h.deps.clock.now().getTime() - 20 * 60_000);
    await pollIdentifier(h.deps, jobsOf("identifier-poll")[0]!.payload as IdentifierPollInput);
    expect(rows()[0]!.updatedAt).toEqual(h.deps.clock.now());
    expect(await requeueStuckIdentifiers(h.deps, { orgId: ORG, now: new Date(h.deps.clock.now().getTime() + 60_000) })).toEqual({ requeued: [], noResponse: [] });
    expect(rows()[0]!.status).toBe("SENDING");
  });
});
