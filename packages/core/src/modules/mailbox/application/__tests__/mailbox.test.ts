import { beforeEach, describe, expect, it } from "vitest";
import { fixedClock } from "../../../../shared/clock.js";
import type { Ctx } from "../../../../shared/ctx.js";
import { asOrgId, asUserId, sequentialIdGen } from "../../../../shared/ids.js";
import { InMemoryJobQueue } from "../../../../shared/queue.js";
import { errCode, unwrap } from "../../../../shared/result.js";
import { completeMailConnect, disconnectMailbox, getMailboxOverview, requestMailSync, startMailConnect, SYNC_BATCH, syncMailConnection } from "../connections.js";
import { addInboxToDossier, getInboxAttachmentFile, listInbox, setInboxMessageStatus } from "../inbox.js";
import type { MailboxDeps } from "../ports.js";
import { FakeDossierIntake, FakeMailProvider, FakeStateSigner, fakeCipher, MemoryBlobStore } from "../test/fakes.js";
import { InMemoryMailboxUow } from "../test/in-memory-uow.js";

const NOW = "2026-10-22T03:00:00.000Z";
const ctx = (role: Ctx["role"], user = `usr_${role}`, org = "org_a"): Ctx => ({ orgId: asOrgId(org), userId: asUserId(user), role });
const pdf = (s: string) => Buffer.from(`%PDF-1.4 ${s}`);

let uow: InMemoryMailboxUow;
let gmail: FakeMailProvider;
let outlook: FakeMailProvider;
let queue: InMemoryJobQueue;
let storage: MemoryBlobStore;
let dossiers: FakeDossierIntake;
let deps: MailboxDeps;
beforeEach(() => {
  uow = new InMemoryMailboxUow();
  gmail = new FakeMailProvider("GMAIL");
  outlook = new FakeMailProvider("OUTLOOK", false);
  queue = new InMemoryJobQueue();
  storage = new MemoryBlobStore();
  dossiers = new FakeDossierIntake([
    { orgId: "org_a", id: "dos_1", code: "HS-NK-2610-0001", partner: "Hansol Technics Co., Ltd", billNo: "SGNHPH2410023", status: "PROCESSING", updatedAt: new Date("2026-10-20") },
    { orgId: "org_a", id: "dos_2", code: "HS-NK-2610-0002", partner: "Samsung", billNo: "", status: "APPROVED", updatedAt: new Date("2026-10-21") },
  ]);
  deps = {
    uow, providers: { GMAIL: gmail, OUTLOOK: outlook }, cipher: fakeCipher, state: new FakeStateSigner(), storage, queue, dossiers,
    members: { names: async () => ({ usr_DECLARANT: "Lê Minh Châu" }) }, redirectUri: "https://app.example/api/mailbox/oauth/callback", clock: fixedClock(NOW), idGen: sequentialIdGen(),
  };
});

async function connect(code = "c1", c = ctx("DECLARANT")) {
  const { url } = unwrap(await startMailConnect(deps, c, "GMAIL"));
  const state = decodeURIComponent(new URL(url).searchParams.get("state")!);
  return unwrap(await completeMailConnect(deps, c, { code, state }));
}

describe("kết nối hộp thư (OAuth)", () => {
  it("bắt đầu → URL đồng ý kèm state + redirect; callback lưu token mã hóa, không lộ token ra DTO", async () => {
    const { url } = unwrap(await startMailConnect(deps, ctx("DECLARANT"), "GMAIL"));
    expect(url).toContain("redirect_uri=https%3A%2F%2Fapp.example%2Fapi%2Fmailbox%2Foauth%2Fcallback");
    const c = await connect();
    expect(c).toMatchObject({ provider: "GMAIL", email: "ops@anphat.vn", status: "ACTIVE", connectedByName: "Lê Minh Châu", lastSyncedAt: null });
    expect(JSON.stringify(c)).not.toContain("rt-c1");
    expect(uow.data.connections[0]!.ciphertext).toMatch(/^enc:/);
    expect(unwrap(await getMailboxOverview(deps, ctx("VIEWER"))).providers).toEqual([{ provider: "GMAIL", configured: true }, { provider: "OUTLOOK", configured: false }]);
  });

  it("chưa cấu hình nhà cung cấp / thiếu khóa mã hóa → MAILBOX_NOT_CONFIGURED; Người xem không kết nối được", async () => {
    const r = await startMailConnect(deps, ctx("DECLARANT"), "OUTLOOK");
    expect(!r.ok && r.error).toMatchObject({ code: "INTEGRATION_NOT_CONFIGURED", reason: "MAILBOX_NOT_CONFIGURED", params: { provider: "Outlook" } });
    expect(errCode(await startMailConnect({ ...deps, cipher: null }, ctx("ADMIN"), "GMAIL"))).toBe("INTEGRATION_NOT_CONFIGURED");
    expect(errCode(await startMailConnect(deps, ctx("VIEWER"), "GMAIL"))).toBe("FORBIDDEN");
  });

  it("state giả / hết hạn / của người khác → MAILBOX_STATE_INVALID; đổi code lỗi → MAILBOX_AUTH_FAILED", async () => {
    const { url } = unwrap(await startMailConnect(deps, ctx("DECLARANT"), "GMAIL"));
    const state = decodeURIComponent(new URL(url).searchParams.get("state")!);
    const bad = await completeMailConnect(deps, ctx("DECLARANT"), { code: "c", state: "x.forged" });
    expect(!bad.ok && bad.error.reason).toBe("MAILBOX_STATE_INVALID");
    expect(errCode(await completeMailConnect(deps, ctx("ADMIN", "usr_other"), { code: "c", state }))).toBe("VALIDATION");
    expect(errCode(await completeMailConnect({ ...deps, clock: fixedClock("2026-10-22T03:11:00.000Z") }, ctx("DECLARANT"), { code: "c", state }))).toBe("VALIDATION");
    const failed = await completeMailConnect(deps, ctx("DECLARANT"), { code: "bad", state });
    expect(!failed.ok && failed.error.reason).toBe("MAILBOX_AUTH_FAILED");
  });

  it("kết nối lại cùng hộp thư: không tạo bản mới, giữ refresh token cũ khi lần này không có, trạng thái về bình thường", async () => {
    const first = await connect("c1");
    uow.data.connections[0]!.status = "REAUTH";
    const again = await connect("no-refresh");
    expect(again.id).toBe(first.id);
    expect(again.status).toBe("ACTIVE");
    expect(uow.data.connections).toHaveLength(1);
    expect(fakeCipher.decrypt(uow.data.connections[0]!.ciphertext, 1)).toContain("rt-c1");
  });

  it("gỡ kết nối: người kết nối hoặc Quản trị; người khác bị chặn", async () => {
    const c = await connect();
    expect(errCode(await disconnectMailbox(deps, ctx("APPROVER", "usr_x"), c.id))).toBe("FORBIDDEN");
    unwrap(await disconnectMailbox(deps, ctx("ADMIN", "usr_admin"), c.id));
    expect(uow.data.connections).toHaveLength(0);
    expect(errCode(await disconnectMailbox(deps, ctx("ADMIN"), c.id))).toBe("NOT_FOUND");
  });
});

describe("lấy chứng từ mới", () => {
  const msg = (id: string, at: string, v: Partial<FakeMailProvider["messages"][number]> = {}) => ({
    id, fromName: "Hansol Technics", fromEmail: "export@hansol.co.kr", subject: `Shipping docs ${id}`, snippet: "Please find attached", receivedAt: new Date(at),
    attachments: [{ id: "a1", fileName: "Commercial Invoice.pdf", mime: "application/pdf", size: 1200 }, { id: "a2", fileName: "logo.gif", mime: "image/gif", size: 300 }], ...v,
  });

  it("nút lấy thư xếp job cho hộp thư còn dùng được (bỏ hộp thư cần kết nối lại / đang lấy)", async () => {
    const c = await connect();
    expect(unwrap(await requestMailSync(deps, ctx("DECLARANT")))).toEqual({ queued: 1 });
    expect(queue.jobs[0]).toMatchObject({ name: "mailbox-sync", payload: { orgId: "org_a", connectionId: c.id } });
    expect(uow.data.connections[0]!.status).toBe("SYNCING");
    expect(unwrap(await requestMailSync(deps, ctx("DECLARANT")))).toEqual({ queued: 0 });
    expect(errCode(await requestMailSync(deps, ctx("VIEWER")))).toBe("FORBIDDEN");
  });

  it("lần đầu lấy 30 ngày; chỉ email có file hợp lệ; file lưu kho; chống trùng; lần sau lấy từ mốc", async () => {
    const c = await connect();
    gmail.messages = [msg("m1", "2026-10-21T01:00:00Z"), msg("m2", "2026-10-21T02:00:00Z", { attachments: [{ id: "x", fileName: "banner.gif", mime: "image/gif", size: 10 }] }), msg("old", "2026-08-01T00:00:00Z")];
    expect(await syncMailConnection(deps, { orgId: "org_a", connectionId: c.id })).toEqual({ added: 1, status: "ACTIVE" });
    expect(gmail.calls[0]!.since.toISOString()).toBe("2026-09-22T03:00:00.000Z");
    expect(uow.data.messages.map((m) => m.providerMessageId)).toEqual(["m1"]);
    expect(uow.data.attachments).toMatchObject([{ fileName: "Commercial Invoice.pdf", kindGuess: "INVOICE", status: "PENDING" }]);
    expect(storage.objects.size).toBe(1);
    expect(uow.data.connections[0]).toMatchObject({ status: "ACTIVE", lastSyncCount: 1, lastSyncedAt: new Date(NOW) });

    gmail.messages.push(msg("m3", "2026-10-22T03:00:00Z"));
    await syncMailConnection(deps, { orgId: "org_a", connectionId: c.id });
    expect(gmail.calls[1]!.since.toISOString()).toBe(NOW);
    expect(uow.data.messages.map((m) => m.providerMessageId)).toEqual(["m1", "m3"]);
    await syncMailConnection(deps, { orgId: "org_a", connectionId: c.id });
    expect(uow.data.messages).toHaveLength(2);
  });

  it("nhiều hơn một lô: mốc = email mới nhất của lô, lần sau lấy tiếp", async () => {
    const c = await connect();
    gmail.messages = Array.from({ length: SYNC_BATCH + 5 }, (_, i) => msg(`m${i}`, new Date(Date.parse("2026-10-01T00:00:00Z") + i * 60_000).toISOString()));
    await syncMailConnection(deps, { orgId: "org_a", connectionId: c.id });
    expect(uow.data.messages).toHaveLength(SYNC_BATCH);
    await syncMailConnection(deps, { orgId: "org_a", connectionId: c.id });
    expect(uow.data.messages).toHaveLength(SYNC_BATCH + 5);
    expect(uow.data.connections[0]!.lastSyncedAt).toEqual(new Date(NOW));
  });

  it("token sắp hết hạn → làm mới và lưu lại; bị thu hồi → REAUTH; lỗi mạng → ERROR, không mất mốc", async () => {
    const c = await connect();
    deps.clock = fixedClock("2026-10-22T03:59:30.000Z");
    await syncMailConnection(deps, { orgId: "org_a", connectionId: c.id });
    expect(gmail.refreshed).toBe(1);
    expect(fakeCipher.decrypt(uow.data.connections[0]!.ciphertext, 1)).toContain("at-c1+");

    const mark = uow.data.connections[0]!.lastSyncedAt;
    gmail.failList = true;
    expect(await syncMailConnection(deps, { orgId: "org_a", connectionId: c.id })).toMatchObject({ status: "ERROR" });
    expect(uow.data.connections[0]).toMatchObject({ status: "ERROR", lastError: "MAILBOX_SYNC_FAILED", lastSyncedAt: mark });

    gmail.revoked = true;
    deps.clock = fixedClock("2026-10-22T05:30:00.000Z");
    expect(await syncMailConnection(deps, { orgId: "org_a", connectionId: c.id })).toMatchObject({ status: "REAUTH" });
    expect(uow.data.connections[0]).toMatchObject({ status: "REAUTH", lastError: "MAILBOX_REAUTH_REQUIRED" });
  });
});

describe("hộp thư chứng từ", () => {
  async function seeded() {
    const c = await connect();
    gmail.messages = [
      { id: "m1", fromName: "Ops", fromEmail: "ops@fwd.com", subject: "HBL SGNHPH2410023 + invoice", snippet: "", receivedAt: new Date("2026-10-21T01:00:00Z"),
        attachments: [{ id: "a1", fileName: "Invoice.pdf", mime: "application/pdf", size: 10 }, { id: "a2", fileName: "Packing.pdf", mime: "application/pdf", size: 10 }] },
      { id: "m2", fromName: "Newsletter", fromEmail: "news@x.com", subject: "Invoice reminder", snippet: "", receivedAt: new Date("2026-10-21T02:00:00Z"),
        attachments: [{ id: "a1", fileName: "inv.pdf", mime: "application/pdf", size: 10 }], files: { a1: pdf("news") } },
    ];
    await syncMailConnection(deps, { orgId: "org_a", connectionId: c.id });
    return unwrap(await listInbox(deps, ctx("VIEWER")));
  }

  it("liệt kê mới nhất trước, kèm gợi ý hồ sơ còn mở (số vận đơn trong tiêu đề)", async () => {
    const list = await seeded();
    expect(list.map((m) => m.subject)).toEqual(["Invoice reminder", "HBL SGNHPH2410023 + invoice"]);
    expect(list[1]).toMatchObject({ mailbox: "ops@anphat.vn", status: "NEW", suggestion: { dossierId: "dos_1", reason: "BILL_NO" } });
    expect(list[0]!.suggestion).toBeNull();
  });

  it("xếp file vào hồ sơ: file đi luồng tải chứng từ; hết file chờ → email Đã xếp; thêm lại bị chặn", async () => {
    const list = await seeded();
    const m = list[1]!;
    const r = unwrap(await addInboxToDossier(deps, ctx("DECLARANT"), { dossierId: "dos_1", attachmentIds: [m.attachments[0]!.id] }));
    expect(r).toEqual({ added: 1, dossierId: "dos_1" });
    expect(dossiers.added).toEqual([{ dossierId: "dos_1", names: ["Invoice.pdf"], by: "usr_DECLARANT" }]);
    let after = unwrap(await listInbox(deps, ctx("VIEWER"))).find((x) => x.id === m.id)!;
    expect(after.status).toBe("NEW");
    expect(after.attachments[0]).toMatchObject({ status: "ADDED", dossierCode: "HS-NK-2610-0001" });

    unwrap(await addInboxToDossier(deps, ctx("DECLARANT"), { dossierId: "dos_1", attachmentIds: [m.attachments[1]!.id] }));
    after = unwrap(await listInbox(deps, ctx("VIEWER"))).find((x) => x.id === m.id)!;
    expect(after).toMatchObject({ status: "DONE", suggestion: null });

    const again = await addInboxToDossier(deps, ctx("DECLARANT"), { dossierId: "dos_1", attachmentIds: [m.attachments[0]!.id] });
    expect(!again.ok && again.error).toMatchObject({ code: "CONFLICT", reason: "INBOX_ATTACHMENT_ADDED", params: { code: "HS-NK-2610-0001" } });
  });

  it("hồ sơ khóa → lỗi của hồ sơ, file vẫn chờ; Người xem không xếp được; file của org khác → không tìm thấy", async () => {
    const list = await seeded();
    const id = list[0]!.attachments[0]!.id;
    expect(errCode(await addInboxToDossier(deps, ctx("DECLARANT"), { dossierId: "dos_2", attachmentIds: [id] }))).toBe("DOSSIER_LOCKED");
    expect(uow.data.attachments.find((a) => a.id === id)!.status).toBe("PENDING");
    expect(errCode(await addInboxToDossier(deps, ctx("VIEWER"), { dossierId: "dos_1", attachmentIds: [id] }))).toBe("FORBIDDEN");
    expect(errCode(await addInboxToDossier(deps, ctx("DECLARANT", "usr_b", "org_b"), { dossierId: "dos_1", attachmentIds: [id] }))).toBe("NOT_FOUND");
  });

  it("xem file đính kèm: đúng nội dung đã lưu; org khác không xem được", async () => {
    const list = await seeded();
    const id = list[0]!.attachments[0]!.id;
    expect(unwrap(await getInboxAttachmentFile(deps, ctx("VIEWER"), id))).toMatchObject({ fileName: "inv.pdf", mime: "application/pdf", bytes: pdf("news") });
    expect(errCode(await getInboxAttachmentFile(deps, ctx("VIEWER", "usr_b", "org_b"), id))).toBe("NOT_FOUND");
  });

  it("bỏ qua / khôi phục email", async () => {
    const list = await seeded();
    expect(unwrap(await setInboxMessageStatus(deps, ctx("DECLARANT"), list[0]!.id, "IGNORED"))).toEqual({ id: list[0]!.id, status: "IGNORED" });
    expect(unwrap(await listInbox(deps, ctx("VIEWER")))[0]).toMatchObject({ status: "IGNORED", suggestion: null });
    unwrap(await setInboxMessageStatus(deps, ctx("DECLARANT"), list[0]!.id, "NEW"));
    expect(errCode(await setInboxMessageStatus(deps, ctx("DECLARANT"), "imsg_x", "IGNORED"))).toBe("NOT_FOUND");
  });
});
