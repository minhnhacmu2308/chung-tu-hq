import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "../../../db/client.js";
import { runSeed } from "../../../db/seed/index.js";
import { startTestDb, type TestDb } from "../../../db/test-db.js";
import { asOrgId, asUserId } from "../../../shared/ids.js";
import { DrizzlePlansReader } from "./drizzle-plans-reader.js";
import { DrizzleIdentityUow } from "./drizzle-uow.js";

let t: TestDb;
let db: Db;
let uow: DrizzleIdentityUow;
const ANPHAT = { orgId: asOrgId("org_anphat"), userId: asUserId("usr_chau") };
const OTHER = { orgId: asOrgId("org_khac"), userId: asUserId("usr_khac") };
const exp = new Date(Date.now() + 86_400_000);

beforeAll(async () => {
  t = await startTestDb();
  await runSeed(t.adminUrl);
  const admin = createDb(t.adminUrl, { max: 1 });
  const { organizations, users, memberships } = await import("../../../db/schema/identity.js");
  await admin.insert(organizations).values({ id: "org_khac", taxCode: "0100000099", name: "KHÁC", planCode: "TRIAL" });
  await admin.insert(users).values({ id: "usr_khac", email: "khac@x.vn", passwordHash: "x", name: "Khác" });
  await admin.insert(memberships).values({ id: "mem_khac", orgId: "org_khac", userId: "usr_khac", role: "OWNER" });
  await admin.close();
  db = createDb(t.appUrl, { max: 3 });
  uow = new DrizzleIdentityUow(db);
});
afterAll(async () => {
  await db?.close();
  await t?.stop();
});

describe("DrizzleIdentityUow", () => {
  it("system: tìm user theo email, org theo MST, gói theo mã", async () => {
    const u = await uow.system((r) => r.users.findByEmail("chau.le@anphat-demo.vn"));
    expect(u?.id).toBe("usr_chau");
    const o = await uow.system((r) => r.orgs.findByTaxCode("0316789012"));
    expect(o?.id).toBe("org_anphat");
    expect((await new DrizzlePlansReader(db).get("PRO"))?.dossiersPerMonth).toBe(150);
  });
  it("asOrg: liệt kê 6 membership của AN PHÁT; org khác không thấy (RLS)", async () => {
    expect(await uow.asOrg(ANPHAT, (r) => r.memberships.listByOrg("org_anphat"))).toHaveLength(6);
    expect(await uow.asOrg(OTHER, (r) => r.memberships.listByOrg("org_anphat"))).toEqual([]);
    expect(await uow.asOrg(OTHER, (r) => r.users.findByIds(["usr_chau"]))).toEqual([]);
  });
  it("certificates: ghi/đọc theo org, org khác không thấy, setDefault/delete", async () => {
    await uow.asOrg(ANPHAT, (r) => r.certificates.insert({ id: "cert_1", orgId: "org_anphat", subject: "AN PHÁT", issuer: "VNPT-CA", serial: "S1", validTo: "2027-12-18", isDefault: true }));
    await uow.asOrg(ANPHAT, (r) => r.certificates.insert({ id: "cert_2", orgId: "org_anphat", subject: "AN PHÁT", issuer: "Viettel-CA", serial: "S2", validTo: "2027-01-01", isDefault: false }));
    expect((await uow.asOrg(ANPHAT, (r) => r.certificates.list("org_anphat"))).map((c) => c.id)).toEqual(["cert_1", "cert_2"]);
    expect(await uow.asOrg(OTHER, (r) => r.certificates.list("org_anphat"))).toEqual([]);
    await uow.asOrg(ANPHAT, (r) => r.certificates.setDefault("org_anphat", "cert_2"));
    expect((await uow.asOrg(ANPHAT, (r) => r.certificates.list("org_anphat"))).find((c) => c.isDefault)?.id).toBe("cert_2");
    await uow.asOrg(ANPHAT, (r) => r.certificates.delete("org_anphat", "cert_1"));
    expect(await uow.asOrg(ANPHAT, (r) => r.certificates.list("org_anphat"))).toHaveLength(1);
  });
  it("sessions: insert qua system, tìm theo hash, asUser chỉ thấy của mình, touch, lastSeenByUsers, delete", async () => {
    const now = new Date();
    await uow.system((r) => r.sessions.insert({ id: "ses_1", userId: "usr_chau", orgId: "org_anphat", tokenHash: "h1", expiresAt: exp, lastSeenAt: now }));
    await uow.system((r) => r.sessions.insert({ id: "ses_2", userId: "usr_ha", orgId: "org_anphat", tokenHash: "h2", expiresAt: exp, lastSeenAt: now }));
    expect((await uow.system((r) => r.sessions.findByTokenHash("h1")))?.id).toBe("ses_1");
    expect((await uow.asUser(asUserId("usr_chau"), (r) => r.sessions.findByTokenHash("h2")))).toBeNull();
    const later = new Date(now.getTime() + 60_000);
    await uow.system((r) => r.sessions.touch("ses_1", later, exp));
    const seen = await uow.asOrg(ANPHAT, (r) => r.sessions.lastSeenByUsers(["usr_chau", "usr_ha"]));
    expect(seen.usr_chau?.getTime()).toBe(later.getTime());
    await uow.system((r) => r.sessions.delete("ses_1"));
    expect(await uow.system((r) => r.sessions.findByTokenHash("h1"))).toBeNull();
  });
  it("authTokens: findValid bỏ qua token hết hạn hoặc đã dùng", async () => {
    const past = new Date(Date.now() - 1000);
    await uow.system((r) => r.authTokens.insert({ id: "tok_ok", userId: "usr_chau", orgId: null, kind: "VERIFY_EMAIL", tokenHash: "ok", expiresAt: exp, usedAt: null }));
    await uow.system((r) => r.authTokens.insert({ id: "tok_old", userId: "usr_chau", orgId: null, kind: "VERIFY_EMAIL", tokenHash: "old", expiresAt: past, usedAt: null }));
    expect((await uow.system((r) => r.authTokens.findValid("VERIFY_EMAIL", "ok", new Date())))?.id).toBe("tok_ok");
    expect(await uow.system((r) => r.authTokens.findValid("VERIFY_EMAIL", "old", new Date()))).toBeNull();
    await uow.system((r) => r.authTokens.markUsed("tok_ok", new Date()));
    expect(await uow.system((r) => r.authTokens.findValid("VERIFY_EMAIL", "ok", new Date()))).toBeNull();
  });
  it("notifications: list theo user, markAllRead chỉ ảnh hưởng user đó", async () => {
    const now = new Date();
    await uow.asOrg(ANPHAT, (r) => r.notifications.insert({ id: "n1", orgId: "org_anphat", userId: "usr_chau", title: "a", body: "", href: null, readAt: null, createdAt: now }));
    await uow.asOrg(ANPHAT, (r) => r.notifications.insert({ id: "n2", orgId: "org_anphat", userId: "usr_ha", title: "b", body: "", href: null, readAt: null, createdAt: now }));
    await uow.asOrg(ANPHAT, (r) => r.notifications.markAllRead("org_anphat", "usr_chau", now));
    expect((await uow.asOrg(ANPHAT, (r) => r.notifications.list("org_anphat", "usr_chau")))[0]?.readAt).not.toBeNull();
    expect((await uow.asOrg({ orgId: asOrgId("org_anphat"), userId: asUserId("usr_ha") }, (r) => r.notifications.list("org_anphat", "usr_ha")))[0]?.readAt).toBeNull();
  });
  it("joinRequests: insert (system) → listPending (org) → decide", async () => {
    await uow.system((r) => r.joinRequests.insert({ id: "jr_1", orgId: "org_anphat", userId: "usr_khac", status: "PENDING", createdAt: new Date() }));
    expect((await uow.asOrg(ANPHAT, (r) => r.joinRequests.listPending("org_anphat"))).map((j) => j.id)).toEqual(["jr_1"]);
    expect((await uow.system((r) => r.joinRequests.findPendingByUser("usr_khac"))).length).toBe(1);
    await uow.asOrg(ANPHAT, (r) => r.joinRequests.decide("jr_1", "APPROVED", "usr_chau", new Date()));
    expect(await uow.asOrg(ANPHAT, (r) => r.joinRequests.listPending("org_anphat"))).toEqual([]);
  });
});
