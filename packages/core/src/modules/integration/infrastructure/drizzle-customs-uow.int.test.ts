import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "../../../db/client.js";
import { runSeed } from "../../../db/seed/index.js";
import { startTestDb, type TestDb } from "../../../db/test-db.js";
import { asOrgId, asUserId } from "../../../shared/ids.js";
import type { OutboxRow } from "../application/customs-ports.js";
import { DrizzleCustomsUow } from "./drizzle-customs-uow.js";

let t: TestDb;
let db: Db;
let uow: DrizzleCustomsUow;
const A = { orgId: asOrgId("org_anphat"), userId: asUserId("usr_chau") };
const B = { orgId: asOrgId("org_khac"), userId: asUserId("usr_khac") };
const now = new Date("2026-10-23T00:00:00Z");
const row = (id: string, orgId: string): OutboxRow => ({ id, orgId, dossierId: "dos_x", declarationId: "dec_x", operation: "IDA", idempotencyKey: `${id}:key`, payload: {}, status: "PENDING", attempts: 0, lastError: null, nextAttemptAt: null, createdAt: now, updatedAt: now });

beforeAll(async () => {
  t = await startTestDb();
  await runSeed(t.adminUrl);
  const admin = createDb(t.adminUrl, { max: 1 });
  // Doanh nghiệp thứ hai bằng SQL thô (module integration không import schema identity – depcruise).
  await admin.execute(sql`INSERT INTO organizations (id, tax_code, name, plan_code) VALUES ('org_khac', '0100000098', 'KHÁC', 'TRIAL')`);
  await admin.execute(sql`INSERT INTO users (id, email, password_hash, name) VALUES ('usr_khac', 'khac2@x.vn', 'x', 'Khác')`);
  await admin.execute(sql`INSERT INTO memberships (id, org_id, user_id, role) VALUES ('mem_khac2', 'org_khac', 'usr_khac', 'OWNER')`);
  await admin.close();
  db = createDb(t.appUrl, { max: 3 });
  uow = new DrizzleCustomsUow(db);
});
afterAll(async () => {
  await db?.close();
  await t?.stop();
});

describe("DrizzleCustomsUow – outbox cô lập theo doanh nghiệp", () => {
  it("org khác không đọc, không sửa được dòng outbox của A (RLS + lọc orgId); sửa với orgId đúng thì được", async () => {
    await uow.asOrg(A, (r) => r.outbox.insert(row("msg_a1", "org_anphat")));
    expect((await uow.asOrg(A, (r) => r.outbox.listForDossier("org_anphat", "dos_x"))).map((o) => o.id)).toEqual(["msg_a1"]);
    expect(await uow.asOrg(B, (r) => r.outbox.listForDossier("org_anphat", "dos_x"))).toEqual([]);
    expect(await uow.asOrg(B, (r) => r.outbox.get("org_anphat", "msg_a1"))).toBeNull();
    // Org B cố sửa dòng của A: RLS không thấy dòng → không có gì đổi.
    await uow.asOrg(B, (r) => r.outbox.update("org_anphat", "msg_a1", { status: "FAILED", updatedAt: now }));
    expect((await uow.asOrg(A, (r) => r.outbox.get("org_anphat", "msg_a1")))?.status).toBe("PENDING");
    // Cùng org nhưng truyền nhầm orgId → lọc orgId chặn (không đổi).
    await uow.asOrg(A, (r) => r.outbox.update("org_khac", "msg_a1", { status: "FAILED", updatedAt: now }));
    expect((await uow.asOrg(A, (r) => r.outbox.get("org_anphat", "msg_a1")))?.status).toBe("PENDING");
    await uow.asOrg(A, (r) => r.outbox.update("org_anphat", "msg_a1", { status: "SENT", updatedAt: now }));
    expect((await uow.asOrg(A, (r) => r.outbox.get("org_anphat", "msg_a1")))?.status).toBe("SENT");
    expect((await uow.asOrg(A, (r) => r.outbox.listUnsentBefore("org_anphat", new Date(now.getTime() + 1)))).length).toBe(0);
    await expect(uow.asOrg(B, (r) => r.outbox.insert(row("msg_b1", "org_anphat")))).rejects.toThrow();
  });
});
