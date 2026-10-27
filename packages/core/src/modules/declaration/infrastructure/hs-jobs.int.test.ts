// hs_jobs + cột trạng thái HS trên line_items: đọc/ghi jsonb, RLS theo org.
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "../../../db/client.js";
import { runSeed } from "../../../db/seed/index.js";
import { startTestDb, type TestDb } from "../../../db/test-db.js";
import { asOrgId, asUserId } from "../../../shared/ids.js";
import type { LineItemRow } from "../application/ports.js";
import { DrizzleDeclarationUow } from "./drizzle-uow.js";

let t: TestDb;
let db: Db;
let admin: Db;
let uow: DrizzleDeclarationUow;
const A = { orgId: asOrgId("org_anphat"), userId: asUserId("usr_chau") };
const B = { orgId: asOrgId("org_khac"), userId: asUserId("usr_khac") };
const NOW = new Date("2026-10-15T01:00:00Z");
const item = (lineNo: number): LineItemRow => ({
  id: `itm_hs_${lineNo}`, orgId: "org_anphat", dossierId: "dos_hs", lineNo, description: "Vít me bi SFU1605", quantity: "40", unit: "PCE", unitPrice: "54.5", amount: "2180", origin: "TW",
  invoiceHsCode: "8483.40", hsSuggested: null, hsConfidence: null, hsConfirmed: null, hsConfirmedBy: null, hsConfirmedAt: null, importDutyRate: null, vatRate: null, policyNote: null, taxDetail: null,
  hsJobId: null, hsItemId: null, hsStatus: "idle", hsQuestion: null, hsError: null, hsDetail: null, createdAt: NOW, updatedAt: NOW,
});

beforeAll(async () => {
  t = await startTestDb();
  await runSeed(t.adminUrl);
  admin = createDb(t.adminUrl, { max: 1 });
  await admin.execute(sql`INSERT INTO dossiers (id, org_id, code, direction, type_code, partner, customs_office_code, due_date, owner_id) VALUES ('dos_hs', 'org_anphat', 'HS-1', 'NK', 'A11', 'X', '02CI', '2026-10-20', 'usr_chau')`);
  db = createDb(t.appUrl, { max: 2 });
  uow = new DrizzleDeclarationUow(db);
  await uow.asOrg(A, (r) => r.lineItems.upsertForDossier("org_anphat", "dos_hs", [item(1), item(2)]));
});
afterAll(async () => {
  await db?.close();
  await admin?.close();
  await t?.stop();
});

describe("hs_jobs + trạng thái HS dòng hàng", () => {
  it("ghi lượt + trạng thái need_info kèm câu hỏi; đọc lại đúng; tìm dòng theo hs_item_id", async () => {
    await uow.asOrg(A, async (r) => {
      await r.hsJobs.insert({ id: "hsj_1", orgId: "org_anphat", dossierId: "dos_hs", externalId: "ext-1", status: "processing", polls: 0, createdAt: NOW, updatedAt: NOW });
      await r.lineItems.update("org_anphat", "itm_hs_1", { hsJobId: "hsj_1", hsItemId: "ext-it-1", hsStatus: "need_info", hsQuestion: { id: "q1", questions: [{ id: "use", question: "Dùng cho máy nào?" }] }, updatedAt: NOW });
      await r.hsJobs.update("org_anphat", "hsj_1", { status: "need_info", polls: 3, updatedAt: NOW });
    });
    const got = await uow.asOrg(A, async (r) => ({ job: await r.hsJobs.get("org_anphat", "hsj_1"), open: await r.hsJobs.openForDossier("org_anphat", "dos_hs"), it: await r.lineItems.get("org_anphat", "itm_hs_1"), byExt: (await r.lineItems.listByHsItem("org_anphat", "ext-it-1"))[0] ?? null }));
    expect(got.job).toMatchObject({ externalId: "ext-1", status: "need_info", polls: 3 });
    expect(got.open.map((j) => j.id)).toEqual(["hsj_1"]);
    expect(got.it).toMatchObject({ hsStatus: "need_info", hsQuestion: { id: "q1" }, hsJobId: "hsj_1" });
    expect(got.byExt?.id).toBe("itm_hs_1");
  });
  it("gợi ý lưu why_not + thuế trong rates", async () => {
    await uow.asOrg(A, (r) => r.suggestions.replaceForItem("org_anphat", "itm_hs_2", [{ id: "sug_1", orgId: "org_anphat", lineItemId: "itm_hs_2", code: "8466.93.90", description: "Loại khác", confidence: 0.12, rates: { importRate: "0", basis: "MFN", agreement: null, vatRate: "10" }, whyNot: "Chỉ đúng khi…", source: "hscodepro", createdAt: NOW }]));
    expect((await uow.asOrg(A, (r) => r.suggestions.listForItems("org_anphat", ["itm_hs_2"])))[0]).toMatchObject({ whyNot: "Chỉ đúng khi…", rates: { importRate: "0", vatRate: "10" } });
  });
  it("tax_detail (jsonb): ghi mã VAT VNACCS + cờ cần kiểm tra lại, đọc lại đúng; null giữ null", async () => {
    const detail = { vatCode: "VK010", vatNote: "Không chịu thuế GTGT", vatCertain: false, normalImportRate: "45", needsReview: true };
    await uow.asOrg(A, (r) => r.lineItems.update("org_anphat", "itm_hs_1", { hsConfirmed: "0808.10.00", vatRate: null, taxDetail: detail, updatedAt: NOW }));
    expect((await uow.asOrg(A, (r) => r.lineItems.get("org_anphat", "itm_hs_1")))?.taxDetail).toEqual(detail);
    expect((await uow.asOrg(A, (r) => r.lineItems.get("org_anphat", "itm_hs_2")))?.taxDetail).toBeNull();
  });
  it("org khác không thấy lượt, không ghi hộ được", async () => {
    expect(await uow.asOrg(B, (r) => r.hsJobs.get("org_anphat", "hsj_1"))).toBeNull();
    await expect(uow.asOrg(B, (r) => r.hsJobs.insert({ id: "hsj_x", orgId: "org_anphat", dossierId: "dos_hs", externalId: "x", status: "processing", polls: 0, createdAt: NOW, updatedAt: NOW }))).rejects.toThrow();
  });
});
