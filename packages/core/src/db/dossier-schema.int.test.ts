import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asOrgId, asUserId } from "../shared/ids.js";
import { createDb, type Db } from "./client.js";
import { documents, dossiers, extractedFields, fieldAudit, memberships, organizations, plans, usageEvents, users, validations } from "./schema/index.js";
import { startTestDb, type TestDb } from "./test-db.js";
import { withCtx } from "./with-ctx.js";

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
});
afterAll(async () => {
  await app?.close();
  await admin?.close();
  await t?.stop();
});

describe("RLS bảng hồ sơ/trích xuất", () => {
  it("org A tạo hồ sơ + chứng từ + trường; org B không thấy gì", async () => {
    await withCtx(app, A, async (tx) => {
      await tx.insert(dossiers).values({ id: "dos_1", orgId: "org_a", code: "HS-NK-2610-001", direction: "NK", typeCode: "A11", partner: "HANSOL", customsOfficeCode: "03CE", dueDate: "2026-10-20", ownerId: "usr_a" });
      await tx.insert(documents).values({ id: "doc_1", orgId: "org_a", dossierId: "dos_1", fileName: "inv.pdf", mime: "application/pdf", sizeBytes: 10, storageKey: "k", sha256: "h", uploadedBy: "usr_a" });
      await tx.insert(extractedFields).values({ id: "fld_1", orgId: "org_a", dossierId: "dos_1", documentId: "doc_1", group: "GENERAL", key: "invoice_no", label: "Số hóa đơn", value: "X", originalValue: "X", status: "SINGLE_SOURCE" });
      await tx.insert(validations).values({ id: "val_1", orgId: "org_a", dossierId: "dos_1", shipmentVersion: "1", ruleCode: "R-AMOUNT-SUM", title: "t", detail: "d", result: "PASS", severity: "BLOCKER" });
      await tx.insert(usageEvents).values({ id: "use_1", orgId: "org_a", dossierId: "dos_1", kind: "AI_EXTRACT", provider: "fake" });
    });
    expect(await withCtx(app, B, (tx) => tx.select().from(dossiers))).toEqual([]);
    expect(await withCtx(app, B, (tx) => tx.select().from(documents))).toEqual([]);
    expect(await withCtx(app, B, (tx) => tx.select().from(extractedFields))).toEqual([]);
    expect(await withCtx(app, B, (tx) => tx.select().from(validations))).toEqual([]);
    expect(await withCtx(app, B, (tx) => tx.select().from(usageEvents))).toEqual([]);
    expect((await withCtx(app, A, (tx) => tx.select().from(dossiers))).map((d) => d.code)).toEqual(["HS-NK-2610-001"]);
  });
  it("org B không sửa được hồ sơ của A (0 dòng), không chèn được dòng mang org_id A", async () => {
    const updated = await withCtx(app, B, (tx) => tx.update(dossiers).set({ note: "hack" }).where(eq(dossiers.id, "dos_1")).returning({ id: dossiers.id }));
    expect(updated).toEqual([]);
    await expect(withCtx(app, B, (tx) => tx.insert(documents).values({ id: "doc_x", orgId: "org_a", dossierId: "dos_1", fileName: "x", mime: "application/pdf", sizeBytes: 1, storageKey: "k", sha256: "h", uploadedBy: "usr_b" }))).rejects.toThrow();
  });
  it("field_audit: insert + select được, UPDATE/DELETE bị từ chối kể cả đúng org", async () => {
    await withCtx(app, A, (tx) => tx.insert(fieldAudit).values({ id: "aud_1", orgId: "org_a", dossierId: "dos_1", fieldId: "fld_1", key: "invoice_no", oldValue: "X", newValue: "Y", userId: "usr_a", source: "USER_EDIT" }));
    expect((await withCtx(app, A, (tx) => tx.select().from(fieldAudit))).length).toBe(1);
    const upd = await withCtx(app, A, (tx) => tx.update(fieldAudit).set({ newValue: "Z" }).where(eq(fieldAudit.id, "aud_1")).returning({ id: fieldAudit.id }));
    expect(upd).toEqual([]);
    const del = await withCtx(app, A, (tx) => tx.delete(fieldAudit).where(eq(fieldAudit.id, "aud_1")).returning({ id: fieldAudit.id }));
    expect(del).toEqual([]);
    expect((await withCtx(app, A, (tx) => tx.select().from(fieldAudit)))[0]?.newValue).toBe("Y");
  });
});
