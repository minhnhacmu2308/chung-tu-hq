import type { IdentifierRequest } from "@kb/contracts";
import { beforeEach, describe, expect, it } from "vitest";
import { domainError } from "../../../../shared/errors.js";
import { RecordingUsageMeter } from "../../../../shared/usage.js";
import { getIdentifier, IDENTIFIER_MAX_POLLS, IDENTIFIER_POLL_DELAY_MS, markIdentifierFailed, pollIdentifier, pollIdentifierNow, processIdentifier, requeueStuckIdentifiers, sendIdentifier, STUCK_IDENTIFIER_MS, type IdentifierPollInput } from "../identifier.js";
import { FakeCustomsGateway } from "../test/fake-customs-gateway.js";
import { D, declarant, makeHarness, ORG, other, viewer, type Harness } from "./_sheets-harness.js";

let h: Harness;
let usage: RecordingUsageMeter;
const gw = (o: ConstructorParameters<typeof FakeCustomsGateway>[0]) => (h.deps.gateway = new FakeCustomsGateway({ clock: h.deps.clock, ...o })) as FakeCustomsGateway;
const REQ: IdentifierRequest = { objectType: "1", goodsType: "2", customsOffice: "60CB", taxCode: "0313833810", companyName: "test", agentTaxCode: "", agentName: "" };
const job = () => h.queue.jobs.at(-1)!;
const runSend = () => processIdentifier(h.deps, job().payload as Parameters<typeof processIdentifier>[1]);
/** Chạy hết chuỗi job identifier-poll đã xếp (bỏ qua delay). */
async function drainPolls() {
  for (let i = 0; i < 100; i++) {
    const j = h.queue.jobs.filter((x) => x.name === "identifier-poll")[i];
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

describe("sendIdentifier – gửi khai báo định danh", () => {
  it("tạo bản ghi SENDING (attempt 1) + job identifier-send, báo giao diện", async () => {
    const res = await sendIdentifier(h.deps, declarant, D, REQ);
    expect(res).toMatchObject({ ok: true, value: { dossierId: D, latest: { attempt: 1, status: "SENDING", request: REQ, identifierNo: null } } });
    expect(h.uow.data.identifiers).toHaveLength(1);
    expect(job()).toMatchObject({ name: "identifier-send", jobId: `identifier-send:${h.uow.data.identifiers[0]!.id}:1`, payload: { orgId: ORG, userId: "usr_chau" } });
    expect(h.dossiers.events).toContainEqual({ type: "customs.message" });
  });
  it("đang chờ kết quả → KVGS_ALREADY_SENDING, không tạo lần gửi thứ hai", async () => {
    await sendIdentifier(h.deps, declarant, D, REQ);
    const again = await sendIdentifier(h.deps, declarant, D, REQ);
    expect(again).toMatchObject({ ok: false, error: { code: "INVALID_STATE", reason: "KVGS_ALREADY_SENDING" } });
    expect(h.uow.data.identifiers).toHaveLength(1);
    expect(h.queue.jobs).toHaveLength(1);
  });
  it("lần trước đã xong → gửi lại thành attempt 2", async () => {
    await sendIdentifier(h.deps, declarant, D, REQ);
    await runSend();
    const res = await sendIdentifier(h.deps, declarant, D, { ...REQ, goodsType: "1" });
    expect(res).toMatchObject({ ok: true, value: { latest: { attempt: 2, status: "SENDING", request: { goodsType: "1" } } } });
  });
  it("người chỉ xem không gửi được", async () => {
    expect(await sendIdentifier(h.deps, viewer, D, REQ)).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(h.uow.data.identifiers).toHaveLength(0);
  });
  it("doanh nghiệp khác không gửi / không xem được hồ sơ", async () => {
    await sendIdentifier(h.deps, declarant, D, REQ);
    expect(await sendIdentifier(h.deps, other, D, REQ)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await getIdentifier(h.deps, other, D)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(h.uow.data.identifiers).toHaveLength(1);
  });
});

describe("processIdentifier – worker identifier-send", () => {
  it("cổng trả kết quả ngay (như FPT thật) → ACCEPTED: số định danh, ngày, QR, câu kết quả; tính phí 1 lần; không poll", async () => {
    const g = gw({});
    await sendIdentifier(h.deps, declarant, D, REQ);
    expect(await runSend()).toMatchObject({ ok: true, value: { status: "ACCEPTED" } });
    expect(g.identifierCalls[0]).toMatchObject({ ...REQ, userId: "BI820001", dossierId: D });
    const row = h.uow.data.identifiers[0]!;
    expect(row).toMatchObject({ status: "ACCEPTED", customsState: "15", identifiedOn: "2026-10-14", errors: null, sendAttempts: 1 });
    expect(row.identifierNo).toMatch(/^1226\d{11}$/);
    expect(row.qrPng).toBeTruthy();
    expect(row.resultText).toContain(row.identifierNo!);
    expect(usage.events).toEqual([expect.objectContaining({ kind: "CUSTOMS_SEND", operation: "V5IdentifierReq", dedupeKey: `customs:identifier:${row.id}` })]);
    expect(h.queue.jobs.filter((j) => j.name === "identifier-poll")).toHaveLength(0);
    const view = await getIdentifier(h.deps, viewer, D);
    expect(view).toMatchObject({ ok: true, value: { latest: { status: "ACCEPTED", identifierNo: row.identifierNo, qrPng: row.qrPng } } });
  });
  it("USER_ID ô panel ưu tiên hơn tài khoản VNACCS doanh nghiệp", async () => {
    const g = gw({});
    await sendIdentifier(h.deps, declarant, D, { ...REQ, userId: "AGENT01" });
    await runSend();
    expect(g.identifierCalls[0]!.userId).toBe("AGENT01");
  });
  it("Hải quan từ chối (MST 9…) → REJECTED + errors", async () => {
    gw({});
    await sendIdentifier(h.deps, declarant, D, { ...REQ, taxCode: "9999999999" });
    await runSend();
    expect(h.uow.data.identifiers[0]).toMatchObject({ status: "REJECTED", customsState: "10", errors: [expect.objectContaining({ code: "E-IDENT-REJ", field: "MA_DV" })] });
  });
  it("cổng chỉ trả REF_ID → lưu REF_ID, poll PENDING ×2 rồi ACCEPTED; phí: gửi 1 + hỏi 3", async () => {
    gw({ identifierMode: "ASYNC", refPendingPolls: 2 });
    await sendIdentifier(h.deps, declarant, D, REQ);
    expect(await runSend()).toMatchObject({ ok: true, value: { status: "SENDING" } });
    const row = h.uow.data.identifiers[0]!;
    expect(row.refId).toMatch(/^FAKE-DD/);
    expect(job()).toMatchObject({ name: "identifier-poll", payload: { id: row.id, n: 1 }, delayMs: IDENTIFIER_POLL_DELAY_MS });
    await drainPolls();
    expect(h.uow.data.identifiers[0]).toMatchObject({ status: "ACCEPTED", customsState: "15" });
    expect(usage.events.filter((e) => e.kind === "CUSTOMS_QUERY")).toHaveLength(3);
    expect(usage.events.filter((e) => e.kind === "CUSTOMS_SEND")).toHaveLength(1);
  });
  it("job chạy lại khi đã có REF_ID → không gửi lại, chỉ xếp lại job hỏi", async () => {
    const g = gw({ identifierMode: "ASYNC" });
    await sendIdentifier(h.deps, declarant, D, REQ);
    const send = job();
    await processIdentifier(h.deps, send.payload as Parameters<typeof processIdentifier>[1]);
    await processIdentifier(h.deps, send.payload as Parameters<typeof processIdentifier>[1]);
    expect(g.identifierCalls).toHaveLength(1);
    expect(h.queue.jobs.filter((j) => j.name === "identifier-poll").map((j) => j.jobId)).toEqual([`identifier-poll:${h.uow.data.identifiers[0]!.id}:1:1`, `identifier-poll:${h.uow.data.identifiers[0]!.id}:1:1`]);
  });
  it("chưa cấu hình (DomainError) → REJECTED, không tính phí; lỗi tạm → ném để retry", async () => {
    const g = gw({});
    g.sendIdentifier = async () => { throw domainError("INTEGRATION_NOT_CONFIGURED", "Chưa cấu hình tài khoản VNACCS"); };
    await sendIdentifier(h.deps, declarant, D, REQ);
    await runSend();
    expect(h.uow.data.identifiers[0]).toMatchObject({ status: "REJECTED", errors: [{ code: "INTEGRATION_NOT_CONFIGURED", message: "Chưa cấu hình tài khoản VNACCS" }] });
    expect(usage.events).toHaveLength(0);

    h = makeHarness();
    h.deps.vnaccsUserId = async () => "BI820001";
    const g2 = gw({});
    g2.sendIdentifier = async () => { throw new Error("ECONNRESET"); };
    await sendIdentifier(h.deps, declarant, D, REQ);
    await expect(runSend()).rejects.toThrow("ECONNRESET");
    expect(h.uow.data.identifiers[0]).toMatchObject({ status: "SENDING", sendAttempts: 1 });
  });
  it("hết lượt job (lỗi tạm kéo dài): chưa có REF_ID → REJECTED; có REF_ID → NO_RESPONSE", async () => {
    gw({ identifierMode: "ASYNC", refPendingPolls: 100 });
    await sendIdentifier(h.deps, declarant, D, REQ);
    const id = h.uow.data.identifiers[0]!.id;
    await markIdentifierFailed(h.deps, { orgId: ORG, id, reason: "timeout" });
    expect(h.uow.data.identifiers[0]).toMatchObject({ status: "REJECTED", errors: [expect.objectContaining({ code: "E-SEND" })] });

    await sendIdentifier(h.deps, declarant, D, REQ);
    await runSend();
    const id2 = h.uow.data.identifiers[1]!.id;
    await markIdentifierFailed(h.deps, { orgId: ORG, id: id2, reason: "timeout" });
    expect(h.uow.data.identifiers[1]!.status).toBe("NO_RESPONSE");
  });
});

describe("requeueStuckIdentifiers – stuck-sweeper", () => {
  const later = (ms: number) => new Date(h.deps.clock.now().getTime() + ms);
  it("job mất: SENDING chưa có REF_ID quá hạn → đẩy lại identifier-send (jobId chuẩn); chưa quá hạn → không đụng", async () => {
    await sendIdentifier(h.deps, declarant, D, REQ);
    const id = h.uow.data.identifiers[0]!.id;
    h.queue.jobs.length = 0;
    expect(await requeueStuckIdentifiers(h.deps, { orgId: ORG, now: later(STUCK_IDENTIFIER_MS - 1000) })).toEqual({ requeued: [], noResponse: [] });
    expect(await requeueStuckIdentifiers(h.deps, { orgId: ORG, now: later(STUCK_IDENTIFIER_MS + 1000) })).toEqual({ requeued: [id], noResponse: [] });
    expect(h.queue.jobs).toEqual([expect.objectContaining({ name: "identifier-send", jobId: `identifier-send:${id}:1`, payload: { orgId: ORG, userId: "usr_chau", id, attempt: 1 } })]);
    // Job đẩy lại chạy bình thường → có kết quả, không còn kẹt.
    gw({});
    await runSend();
    expect(h.uow.data.identifiers[0]!.status).toBe("ACCEPTED");
  });
  it("đã có REF_ID mà chuỗi hỏi kết quả mất → NO_RESPONSE (bấm Hỏi kết quả được); doanh nghiệp khác không thấy", async () => {
    gw({ identifierMode: "ASYNC", refPendingPolls: 100 });
    await sendIdentifier(h.deps, declarant, D, REQ);
    await runSend();
    const id = h.uow.data.identifiers[0]!.id;
    expect(await requeueStuckIdentifiers(h.deps, { orgId: "org_khac", now: later(STUCK_IDENTIFIER_MS + 1000) })).toEqual({ requeued: [], noResponse: [] });
    expect(await requeueStuckIdentifiers(h.deps, { orgId: ORG, now: later(STUCK_IDENTIFIER_MS + 1000) })).toEqual({ requeued: [], noResponse: [id] });
    expect(h.uow.data.identifiers[0]!.status).toBe("NO_RESPONSE");
    expect(await pollIdentifierNow(h.deps, declarant, D)).toMatchObject({ ok: true });
  });
});

describe("pollIdentifier / pollIdentifierNow – hỏi kết quả", () => {
  it(`hết ${IDENTIFIER_MAX_POLLS} lần hỏi vẫn chờ → NO_RESPONSE; Hỏi kết quả (tay) sau đó → ACCEPTED`, async () => {
    const g = gw({ identifierMode: "ASYNC", refPendingPolls: IDENTIFIER_MAX_POLLS });
    await sendIdentifier(h.deps, declarant, D, REQ);
    await runSend();
    await drainPolls();
    expect(h.uow.data.identifiers[0]!.status).toBe("NO_RESPONSE");
    expect(g).toBeTruthy();
    const res = await pollIdentifierNow(h.deps, declarant, D);
    expect(res).toMatchObject({ ok: true, value: { latest: { status: "ACCEPTED" } } });
  });
  it("không có lần gửi đang chờ → INVALID_STATE; người chỉ xem → FORBIDDEN", async () => {
    expect(await pollIdentifierNow(h.deps, declarant, D)).toMatchObject({ ok: false, error: { code: "INVALID_STATE" } });
    expect(await pollIdentifierNow(h.deps, viewer, D)).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
  });
  it("chỉ mới cấp số tiếp nhận (tranG_THAI 11) → vẫn SENDING, giữ số tiếp nhận; Hỏi kết quả lúc chưa xong không xóa số, lần sau lấy được số định danh", async () => {
    const g = gw({});
    g.sendIdentifier = async () => ({ state: "PENDING", refId: "1DF7DAC7", receiptNo: "119292984102", receiptDate: "2026-11-15", customsState: "11" });
    const replies = [
      { state: "PENDING" as const, refId: "1DF7DAC7", customsState: "11", resultText: "Message [1DF7DAC7] đã được hệ thống tiếp nhận nhưng chưa xử lý xong, vui lòng đợi ..." },
      { state: "ACCEPTED" as const, refId: "1DF7DAC7", receiptNo: "119292984102", customsState: "15", identifierNo: "112600050503272", identifiedOn: "2026-11-15", resultText: "Số định danh là [112600050503272]" },
    ];
    g.identifierResult = async () => replies.shift()!;
    await sendIdentifier(h.deps, declarant, D, REQ);
    await runSend();
    expect(h.uow.data.identifiers[0]).toMatchObject({ status: "SENDING", refId: "1DF7DAC7", receiptNo: "119292984102", identifierNo: null });
    expect(await pollIdentifierNow(h.deps, declarant, D)).toMatchObject({ ok: true, value: { latest: { status: "SENDING", receiptNo: "119292984102", customsState: "11", identifierNo: null } } });
    expect(await pollIdentifierNow(h.deps, declarant, D)).toMatchObject({ ok: true, value: { latest: { status: "ACCEPTED", identifierNo: "112600050503272" } } });
  });
  it("lỗi khi hỏi (DomainError) → NO_RESPONSE (không phải từ chối), hỏi tay trả lỗi để báo; sửa xong hỏi lại được", async () => {
    const g = gw({ identifierMode: "ASYNC", refPendingPolls: 0 });
    await sendIdentifier(h.deps, declarant, D, REQ);
    await runSend();
    const ok0 = g.identifierResult.bind(g);
    g.identifierResult = async () => { throw domainError("GATEWAY_ERROR", "Phản hồi khai báo định danh của FPT không đúng định dạng"); };
    await drainPolls();
    expect(h.uow.data.identifiers[0]).toMatchObject({ status: "NO_RESPONSE", errors: null });
    expect(await pollIdentifierNow(h.deps, declarant, D)).toMatchObject({ ok: false, error: { code: "GATEWAY_ERROR" } });
    expect(h.uow.data.identifiers[0]!.status).toBe("NO_RESPONSE");
    g.identifierResult = ok0;
    expect(await pollIdentifierNow(h.deps, declarant, D)).toMatchObject({ ok: true, value: { latest: { status: "ACCEPTED" } } });
  });
  it("hỏi tay không xếp lượt kế; doanh nghiệp khác không thấy lần gửi đang chờ", async () => {
    gw({ identifierMode: "ASYNC", refPendingPolls: 5 });
    await sendIdentifier(h.deps, declarant, D, REQ);
    await runSend();
    const before = h.queue.jobs.length;
    await pollIdentifierNow(h.deps, declarant, D);
    expect(h.queue.jobs).toHaveLength(before);
    expect(await pollIdentifierNow(h.deps, other, D)).toMatchObject({ ok: false, error: { code: "INVALID_STATE" } });
  });
});
