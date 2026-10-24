import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb, resetDb } from "@/mocks/db";
import { addInboxToDossier, disconnectMailbox, getMailboxOverview, listInbox, MOCK_SYNC_MS, requestMailSync, setInboxMessageStatus, startMailConnect } from "./mailbox";

const code = async (p: Promise<unknown>) => p.then(() => "OK", (e: { code?: string; reason?: string }) => e.reason ?? e.code);
const actAs = (id: string) => {
  getDb().currentUserId = id;
};
const actAsRole = (role: string) => {
  const m = getDb().members.find((x) => x.role === role);
  if (m) actAs(m.id);
};

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  resetDb();
});
afterEach(() => vi.useRealTimers());

describe("hộp thư chứng từ (mock)", { timeout: 20_000 }, () => {
  it("dữ liệu mẫu: một Gmail đã kết nối; email có gợi ý theo mã hồ sơ, số vận đơn, đối tác; email không khớp thì không gợi ý", async () => {
    const o = await getMailboxOverview();
    expect(o.providers.every((p) => p.configured)).toBe(true);
    expect(o.connections).toHaveLength(1);
    expect(o.connections[0]).toMatchObject({ provider: "GMAIL", status: "ACTIVE", connectedByName: "Nguyễn Thu Hà" });
    const inbox = await listInbox();
    const reasons = Object.fromEntries(inbox.map((m) => [m.id, m.suggestion?.reason ?? null]));
    expect(reasons).toMatchObject({ imsg_seed_1: "DOSSIER_CODE", imsg_seed_2: "BILL_NO", imsg_seed_3: "PARTNER", imsg_seed_4: null, imsg_seed_5: null, imsg_seed_6: null });
    expect(inbox.find((m) => m.id === "imsg_seed_1")?.suggestion?.dossierId).toBe("dos_027");
    expect(inbox.find((m) => m.id === "imsg_seed_4")?.attachments.every((a) => a.status === "ADDED" && a.dossierCode?.startsWith("HS-"))).toBe(true);
    // Mới nhất trước.
    expect(inbox.map((m) => m.receivedAt)).toEqual([...inbox.map((m) => m.receivedAt)].sort().reverse());
  });

  it("lấy thư: SYNCING một lúc rồi nhận lô email mẫu ở lần đầu, lần sau không có email mới", async () => {
    const before = (await listInbox()).length;
    expect(await requestMailSync()).toEqual({ queued: 1 });
    expect((await getMailboxOverview()).connections[0]?.status).toBe("SYNCING");
    // Đang lấy thư → bấm lại không xếp lịch thêm.
    expect(await requestMailSync()).toEqual({ queued: 0 });
    vi.advanceTimersByTime(MOCK_SYNC_MS + 10);
    const done = (await getMailboxOverview()).connections[0]!;
    expect(done).toMatchObject({ status: "ACTIVE", lastSyncCount: 2 });
    const after = await listInbox();
    expect(after).toHaveLength(before + 2);
    expect(after.find((m) => m.id === "imsg_demo_1")?.suggestion).toMatchObject({ dossierId: "dos_025", reason: "BILL_NO" });

    await requestMailSync(done.id);
    vi.advanceTimersByTime(MOCK_SYNC_MS + 10);
    expect((await getMailboxOverview()).connections[0]).toMatchObject({ status: "ACTIVE", lastSyncCount: 0 });
    expect(await listInbox()).toHaveLength(before + 2);
    expect(await code(requestMailSync("mcn_khong_co"))).toBe("MAILBOX_NOT_FOUND");
  });

  it("thêm vào hồ sơ: file vào chứng từ của hồ sơ, email chuyển Đã xếp; thêm lại báo INBOX_ATTACHMENT_ADDED", async () => {
    const msg = (await listInbox()).find((m) => m.id === "imsg_seed_1")!;
    const docsBefore = getDb().documents.filter((d) => d.dossierId === "dos_027").length;
    const ids = msg.attachments.map((a) => a.id);
    expect(await addInboxToDossier({ dossierId: "dos_027", attachmentIds: ids.slice(0, 1) })).toEqual({ added: 1, dossierId: "dos_027" });
    expect((await listInbox()).find((m) => m.id === msg.id)?.status).toBe("NEW");
    await addInboxToDossier({ dossierId: "dos_027", attachmentIds: ids.slice(1) });
    const after = (await listInbox()).find((m) => m.id === msg.id)!;
    expect(after.status).toBe("DONE");
    expect(after.suggestion).toBeNull();
    expect(after.attachments.every((a) => a.dossierId === "dos_027")).toBe(true);
    const docs = getDb().documents.filter((d) => d.dossierId === "dos_027");
    expect(docs).toHaveLength(docsBefore + 3);
    expect(docs.map((d) => d.kind).sort()).toEqual(["BILL_OF_LADING", "INVOICE", "PACKING_LIST"]);
    expect(getDb().dossiers.find((d) => d.id === "dos_027")?.status).toBe("PROCESSING");
    expect(await code(addInboxToDossier({ dossierId: "dos_027", attachmentIds: ids.slice(0, 1) }))).toBe("INBOX_ATTACHMENT_ADDED");
    expect(await code(addInboxToDossier({ dossierId: "dos_027", attachmentIds: ["iatt_khong_co"] }))).toBe("INBOX_MESSAGE_NOT_FOUND");
  });

  it("bỏ qua / khôi phục email; email đã xếp giữ nguyên", async () => {
    expect(await setInboxMessageStatus("imsg_seed_6", "IGNORED")).toEqual({ id: "imsg_seed_6", status: "IGNORED" });
    expect(await setInboxMessageStatus("imsg_seed_6", "NEW")).toEqual({ id: "imsg_seed_6", status: "NEW" });
    expect(await setInboxMessageStatus("imsg_seed_4", "IGNORED")).toEqual({ id: "imsg_seed_4", status: "DONE" });
    expect(await code(setInboxMessageStatus("imsg_khong_co", "IGNORED"))).toBe("INBOX_MESSAGE_NOT_FOUND");
  });

  it("kết nối (mock) thêm hộp thư mẫu và trả về trang cài đặt; gỡ kết nối chỉ người kết nối hoặc Quản trị / Chủ sở hữu", async () => {
    const { url } = await startMailConnect("OUTLOOK");
    expect(url).toBe("/settings?tab=integrations&mailbox=connected&email=demo%40outlook.com");
    const outlook = (await getMailboxOverview()).connections.find((c) => c.provider === "OUTLOOK")!;
    expect(outlook).toMatchObject({ email: "demo@outlook.com", status: "ACTIVE", connectedBy: "usr_chau" });
    // Kết nối lại hộp thư phải cấp quyền lại → về ACTIVE.
    getDb().mailConnections[0]!.status = "REAUTH";
    await startMailConnect("GMAIL");
    expect((await getMailboxOverview()).connections.filter((c) => c.provider === "GMAIL").map((c) => c.status)).toEqual(["ACTIVE"]);

    actAs("usr_tuan"); // Người duyệt, không phải người kết nối hộp thư Outlook
    expect(await code(disconnectMailbox(outlook.id))).toBe("MAILBOX_NOT_FOUND");
    actAs("usr_chau");
    expect(await disconnectMailbox(outlook.id)).toEqual({ removed: true });
    expect(await code(disconnectMailbox(outlook.id))).toBe("MAILBOX_NOT_FOUND");
  });

  it("Người xem chỉ xem: không kết nối, lấy thư, xếp file hay bỏ qua được", async () => {
    actAsRole("VIEWER");
    expect((await listInbox()).length).toBeGreaterThan(0);
    expect(await code(startMailConnect("GMAIL"))).toBe("FORBIDDEN");
    expect(await code(requestMailSync())).toBe("FORBIDDEN");
    expect(await code(addInboxToDossier({ dossierId: "dos_027", attachmentIds: ["imsg_seed_1_att1"] }))).toBe("FORBIDDEN");
    expect(await code(setInboxMessageStatus("imsg_seed_6", "IGNORED"))).toBe("FORBIDDEN");
    expect(await code(disconnectMailbox("mcn_seed_gmail"))).toBe("FORBIDDEN");
  });
});
