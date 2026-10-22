import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "../../../db/client.js";
import { runSeed } from "../../../db/seed/index.js";
import { startTestDb, type TestDb } from "../../../db/test-db.js";
import { asOrgId, asUserId } from "../../../shared/ids.js";
import type { InboxAttachmentRow, InboxMessageRow, MailConnectionRow } from "../application/ports.js";
import { DrizzleMailboxUow } from "./drizzle-uow.js";

let t: TestDb;
let db: Db;
let uow: DrizzleMailboxUow;
const A = { orgId: asOrgId("org_anphat"), userId: asUserId("usr_chau") };
const B = { orgId: asOrgId("org_khac"), userId: asUserId("usr_khac") };
const at = new Date("2026-10-22T03:00:00Z");
const conn = (orgId: string, id: string, v: Partial<MailConnectionRow> = {}): MailConnectionRow => ({
  id, orgId, provider: "GMAIL", email: "chungtu@anphat.vn", ciphertext: "enc", keyVersion: 1, status: "ACTIVE", lastSyncedAt: null, lastSyncCount: 0, lastError: null,
  connectedBy: "usr_chau", createdAt: at, updatedAt: at, ...v,
});
const msg = (orgId: string, id: string, providerMessageId: string, receivedAt: Date): InboxMessageRow => ({
  id, orgId, connectionId: "mcn_1", provider: "GMAIL", mailbox: "chungtu@anphat.vn", providerMessageId, fromName: "Forwarder", fromEmail: "ops@fwd.vn",
  subject: "Invoice + Packing list", snippet: "Gửi bộ chứng từ", receivedAt, status: "NEW", createdAt: at, updatedAt: at,
});
const att = (orgId: string, id: string, messageId: string): InboxAttachmentRow => ({
  id, orgId, messageId, fileName: `${id}.pdf`, mime: "application/pdf", size: 1234, sha256: "abc", storageKey: `orgs/${orgId}/inbox/${id}/abc.pdf`, kindGuess: "INVOICE",
  status: "PENDING", dossierId: null, addedBy: null, addedAt: null, createdAt: at,
});

beforeAll(async () => {
  t = await startTestDb();
  await runSeed(t.adminUrl);
  db = createDb(t.appUrl, { max: 2 });
  uow = new DrizzleMailboxUow(db);
});
afterAll(async () => {
  await db?.close();
  await t?.stop();
});

describe("mail_connections / inbox (RLS)", () => {
  it("kết nối: thêm, tìm theo email, sửa, gỡ; trùng (org, nhà cung cấp, email) bị chặn; org khác không thấy", async () => {
    await uow.asOrg(A, (r) => r.connections.insert(conn("org_anphat", "mcn_1")));
    await expect(uow.asOrg(A, (r) => r.connections.insert(conn("org_anphat", "mcn_dup")))).rejects.toThrow();
    // Cùng email nhưng Outlook là kết nối khác
    await uow.asOrg(A, (r) => r.connections.insert(conn("org_anphat", "mcn_2", { provider: "OUTLOOK", createdAt: new Date(at.getTime() + 1000) })));
    const found = await uow.asOrg(A, (r) => r.connections.find("org_anphat", "GMAIL", "chungtu@anphat.vn"));
    expect(found).toMatchObject({ id: "mcn_1", provider: "GMAIL" });
    await uow.asOrg(A, (r) => r.connections.update({ ...found!, status: "SYNCING", lastSyncCount: 3 }));
    expect(await uow.asOrg(A, (r) => r.connections.get("org_anphat", "mcn_1"))).toMatchObject({ status: "SYNCING", lastSyncCount: 3 });
    expect((await uow.asOrg(A, (r) => r.connections.list("org_anphat"))).map((c) => c.id)).toEqual(["mcn_1", "mcn_2"]);

    expect(await uow.asOrg(B, (r) => r.connections.list("org_anphat"))).toEqual([]);
    expect(await uow.asOrg(B, (r) => r.connections.get("org_anphat", "mcn_1"))).toBeNull();
    await expect(uow.asOrg(B, (r) => r.connections.insert(conn("org_anphat", "mcn_x")))).rejects.toThrow();
    await uow.asOrg(B, (r) => r.connections.remove("org_anphat", "mcn_2"));
    expect(await uow.asOrg(A, (r) => r.connections.get("org_anphat", "mcn_2"))).not.toBeNull();
    await uow.asOrg(A, (r) => r.connections.remove("org_anphat", "mcn_2"));
    expect(await uow.asOrg(A, (r) => r.connections.get("org_anphat", "mcn_2"))).toBeNull();
  });

  it("email + file đính kèm: chống trùng theo mã email, mới nhất trước, org khác không đọc được", async () => {
    await uow.asOrg(A, async (r) => {
      await r.messages.insert(msg("org_anphat", "imsg_1", "g-1", new Date("2026-10-20T01:00:00Z")));
      await r.messages.insert(msg("org_anphat", "imsg_2", "g-2", new Date("2026-10-21T01:00:00Z")));
      await r.attachments.insert([att("org_anphat", "iatt_1", "imsg_1"), att("org_anphat", "iatt_2", "imsg_1"), att("org_anphat", "iatt_3", "imsg_2")]);
    });
    await expect(uow.asOrg(A, (r) => r.messages.insert(msg("org_anphat", "imsg_dup", "g-1", at)))).rejects.toThrow();
    expect([...(await uow.asOrg(A, (r) => r.messages.existingProviderIds("org_anphat", "mcn_1", ["g-1", "g-3"])))]).toEqual(["g-1"]);
    expect(await uow.asOrg(A, (r) => r.messages.existingProviderIds("org_anphat", "mcn_other", ["g-1"]))).toEqual(new Set());
    expect((await uow.asOrg(A, (r) => r.messages.list("org_anphat"))).map((m) => m.id)).toEqual(["imsg_2", "imsg_1"]);
    expect(await uow.asOrg(A, (r) => r.attachments.listByMessages("org_anphat", ["imsg_1"]))).toHaveLength(2);

    const [a] = await uow.asOrg(A, (r) => r.attachments.byIds("org_anphat", ["iatt_3"]));
    await uow.asOrg(A, (r) => r.attachments.update({ ...a!, status: "ADDED", dossierId: "dos_1", addedBy: "usr_chau", addedAt: at }));
    const m2 = await uow.asOrg(A, (r) => r.messages.get("org_anphat", "imsg_2"));
    await uow.asOrg(A, (r) => r.messages.update({ ...m2!, status: "DONE" }));
    expect(await uow.asOrg(A, (r) => r.attachments.byIds("org_anphat", ["iatt_3"]))).toMatchObject([{ status: "ADDED", dossierId: "dos_1", addedAt: at }]);
    expect(await uow.asOrg(A, (r) => r.messages.get("org_anphat", "imsg_2"))).toMatchObject({ status: "DONE" });

    expect(await uow.asOrg(B, (r) => r.messages.list("org_anphat"))).toEqual([]);
    expect(await uow.asOrg(B, (r) => r.attachments.byIds("org_anphat", ["iatt_1"]))).toEqual([]);
    expect(await uow.asOrg(B, (r) => r.messages.existingProviderIds("org_anphat", "mcn_1", ["g-1"]))).toEqual(new Set());
    await expect(uow.asOrg(B, (r) => r.messages.insert(msg("org_anphat", "imsg_x", "g-9", at)))).rejects.toThrow();
  });
});
