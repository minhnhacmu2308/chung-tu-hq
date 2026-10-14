import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asOrgId, asUserId } from "../shared/ids.js";
import { createDb, type Db } from "./client.js";
import { memberships, organizations, plans, users } from "./schema/index.js";
import { startTestDb, type TestDb } from "./test-db.js";
import { withCtx, withSystem, withUser } from "./with-ctx.js";

let t: TestDb;
let admin: Db;
let app: Db;

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
    // usr_b cũng là thành viên org_a (một người thuộc hai doanh nghiệp).
    { id: "mem_ba", orgId: "org_a", userId: "usr_b", role: "VIEWER" },
  ]);
});
afterAll(async () => {
  await app?.close();
  await admin?.close();
  await t?.stop();
});

describe("RLS qua withCtx", () => {
  it("org B không thấy membership của org A dù truy vấn không có where", async () => {
    const rows = await withCtx(app, { orgId: asOrgId("org_b") }, (tx) => tx.select().from(memberships));
    expect(rows.map((r) => r.id)).toEqual(["mem_b"]);
  });
  it("org A thấy đúng dòng của mình", async () => {
    const rows = await withCtx(app, { orgId: asOrgId("org_a") }, (tx) => tx.select().from(memberships));
    expect(rows.map((r) => r.id).sort()).toEqual(["mem_a", "mem_ba"]);
  });
  it("ghi dòng mang org_id khác org đang đặt bị Postgres từ chối", async () => {
    // Drizzle bọc lỗi Postgres trong `cause`; thông điệp gốc là "new row violates row-level security policy".
    const run = withCtx(app, { orgId: asOrgId("org_a") }, (tx) =>
      tx.insert(memberships).values({ id: "mem_x", orgId: "org_b", userId: "usr_a", role: "VIEWER" }),
    );
    await expect(run).rejects.toSatisfy((e: unknown) => {
      const cause = (e as { cause?: { message?: string } }).cause;
      return /row-level security/.test(cause?.message ?? (e as Error).message);
    });
  });
  it("withUser: user thấy membership của chính mình ở mọi org", async () => {
    const rows = await withUser(app, asUserId("usr_b"), (tx) => tx.select().from(memberships));
    expect(rows.map((r) => r.id).sort()).toEqual(["mem_b", "mem_ba"]);
  });
  it("withCtx(org A, usr_b): chỉ thấy membership trong org A, không lẫn dòng org B của chính mình", async () => {
    const rows = await withCtx(app, { orgId: asOrgId("org_a"), userId: asUserId("usr_b") }, (tx) => tx.select().from(memberships));
    expect(rows.map((r) => r.id).sort()).toEqual(["mem_a", "mem_ba"]);
  });
  it("withCtx với orgId rỗng ném lỗi lập trình, không chạy truy vấn", async () => {
    await expect(withCtx(app, { orgId: asOrgId("") }, async () => 1)).rejects.toThrow(/orgId bắt buộc/);
  });
});

describe("RLS bảng users và organizations", () => {
  it("withCtx(org A, usr_a) chỉ thấy user của org A, không thấy usr_b-only org B? (usr_b là thành viên A nên thấy; usr_c không)", async () => {
    await admin.insert(users).values({ id: "usr_c", email: "c@x.vn", passwordHash: "x", name: "C" });
    await admin.insert(memberships).values({ id: "mem_c", orgId: "org_b", userId: "usr_c", role: "VIEWER" });
    const rows = await withCtx(app, { orgId: asOrgId("org_a"), userId: asUserId("usr_a") }, (tx) => tx.select().from(users));
    expect(rows.map((r) => r.id).sort()).toEqual(["usr_a", "usr_b"]);
  });
  it("withCtx(org A) không thấy organizations khác và không sửa được org B", async () => {
    const orgs = await withCtx(app, { orgId: asOrgId("org_a"), userId: asUserId("usr_a") }, (tx) => tx.select().from(organizations));
    expect(orgs.map((o) => o.id)).toEqual(["org_a"]);
    const updated = await withCtx(app, { orgId: asOrgId("org_a"), userId: asUserId("usr_a") }, (tx) =>
      tx.update(organizations).set({ name: "HACK" }).where(eq(organizations.id, "org_b")).returning({ id: organizations.id }),
    );
    expect(updated).toEqual([]);
  });
  it("withUser(usr_b) thấy mọi org mình là thành viên", async () => {
    const orgs = await withUser(app, asUserId("usr_b"), (tx) => tx.select().from(organizations));
    expect(orgs.map((o) => o.id).sort()).toEqual(["org_a", "org_b"]);
  });
  it("withSystem (chỉ identity dùng cho đăng nhập/đăng ký): tìm được user theo email và org theo MST", async () => {
    const u = await withSystem(app, (tx) => tx.select().from(users).where(eq(users.email, "b@x.vn")));
    expect(u.map((x) => x.id)).toEqual(["usr_b"]);
    const o = await withSystem(app, (tx) => tx.select().from(organizations).where(eq(organizations.taxCode, "0100000002")));
    expect(o.map((x) => x.id)).toEqual(["org_b"]);
  });
  it("withUser(usr_a) chỉ tự sửa được mình, không sửa được usr_b", async () => {
    const r = await withUser(app, asUserId("usr_a"), (tx) =>
      tx.update(users).set({ name: "X" }).where(eq(users.id, "usr_b")).returning({ id: users.id }),
    );
    expect(r).toEqual([]);
  });
});
