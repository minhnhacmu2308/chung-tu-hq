import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asOrgId, asUserId } from "../shared/ids.js";
import { createDb, type Db } from "./client.js";
import { authTokens, digitalCertificates, memberships, notifications, organizations, orgSecrets, plans, sessions, users } from "./schema/index.js";
import { startTestDb, type TestDb } from "./test-db.js";
import { withCtx, withSystem, withUser } from "./with-ctx.js";

let t: TestDb;
let admin: Db;
let app: Db;
const A = { orgId: asOrgId("org_a"), userId: asUserId("usr_a") };
const B = { orgId: asOrgId("org_b"), userId: asUserId("usr_b") };

beforeAll(async () => {
  t = await startTestDb();
  admin = createDb(t.adminUrl, { max: 2 });
  app = createDb(t.appUrl, { max: 2 });
  await admin.insert(plans).values({ code: "TRIAL", name: "Dùng thử", dossiersPerMonth: 10, pagesPerDossier: 20 });
  await admin.insert(organizations).values([
    { id: "org_a", taxCode: "0100000001", name: "A", planCode: "TRIAL" },
    { id: "org_b", taxCode: "0100000002", name: "B", planCode: "TRIAL" },
  ]);
  await admin.insert(users).values([
    { id: "usr_a", email: "a@x.vn", passwordHash: "x", name: "A" },
    { id: "usr_b", email: "b@x.vn", passwordHash: "x", name: "B" },
  ]);
  await admin.insert(memberships).values([
    { id: "mem_a", orgId: "org_a", userId: "usr_a", role: "OWNER" },
    { id: "mem_b", orgId: "org_b", userId: "usr_b", role: "OWNER" },
  ]);
  await admin.insert(digitalCertificates).values({ id: "cert_a", orgId: "org_a", subject: "A", issuer: "VNPT-CA", serial: "S1", validTo: "2027-01-01", isDefault: true });
  await admin.insert(notifications).values([
    { id: "ntf_a", orgId: "org_a", userId: "usr_a", title: "cho a", body: "" },
    { id: "ntf_b", orgId: "org_a", userId: "usr_b", title: "cho b (cũng org_a)", body: "" },
  ]);
  await admin.insert(orgSecrets).values({ id: "sec_b", orgId: "org_b", kind: "VNACCS", ciphertext: "xxx", keyVersion: 1 });
  const exp = new Date(Date.now() + 86_400_000);
  await admin.insert(sessions).values([
    { id: "ses_a", userId: "usr_a", orgId: "org_a", tokenHash: "hash_a", expiresAt: exp, lastSeenAt: new Date() },
    { id: "ses_b", userId: "usr_b", orgId: "org_b", tokenHash: "hash_b", expiresAt: exp, lastSeenAt: new Date() },
  ]);
  await admin.insert(authTokens).values({ id: "tok_a", userId: "usr_a", kind: "VERIFY_EMAIL", tokenHash: "th_a", expiresAt: exp });
});
afterAll(async () => {
  await app?.close();
  await admin?.close();
  await t?.stop();
});

describe("RLS bảng identity mới", () => {
  it("digital_certificates: org B không thấy chứng thư của org A", async () => {
    expect(await withCtx(app, B, (tx) => tx.select().from(digitalCertificates))).toEqual([]);
    expect((await withCtx(app, A, (tx) => tx.select().from(digitalCertificates))).map((c) => c.id)).toEqual(["cert_a"]);
  });
  it("notifications: user chỉ thấy thông báo của chính mình trong org", async () => {
    const rows = await withCtx(app, A, (tx) => tx.select().from(notifications));
    expect(rows.map((r) => r.id)).toEqual(["ntf_a"]);
  });
  it("sessions: withSystem tìm được theo token_hash; withUser chỉ thấy session của mình", async () => {
    const found = await withSystem(app, (tx) => tx.select().from(sessions).where(eq(sessions.tokenHash, "hash_b")));
    expect(found.map((s) => s.id)).toEqual(["ses_b"]);
    const mine = await withUser(app, asUserId("usr_a"), (tx) => tx.select().from(sessions));
    expect(mine.map((s) => s.id)).toEqual(["ses_a"]);
  });
  it("auth_tokens: withSystem đọc được; withUser(usr_b) không thấy token của usr_a", async () => {
    expect((await withSystem(app, (tx) => tx.select().from(authTokens))).length).toBe(1);
    expect(await withUser(app, asUserId("usr_b"), (tx) => tx.select().from(authTokens))).toEqual([]);
  });
  it("org_secrets: withCtx(org_a) không đọc được secret org_b", async () => {
    expect(await withCtx(app, A, (tx) => tx.select().from(orgSecrets))).toEqual([]);
  });
});
