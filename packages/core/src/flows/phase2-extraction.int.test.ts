// Luồng GĐ 2 (nhiều module) trên Postgres thật – đặt ngoài modules/ vì chạm hạ tầng của nhiều module: tạo hồ sơ → upload (storage in-memory) → processDocument với AI giả → trường/luật → sửa trường → xác nhận dữ liệu.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "../db/client.js";
import { runSeed } from "../db/seed/index.js";
import { startTestDb, type TestDb } from "../db/test-db.js";
import { fixedClock } from "../shared/clock.js";
import type { Ctx } from "../shared/ctx.js";
import { asOrgId, asUserId, ulidIdGen } from "../shared/ids.js";
import { InMemoryJobQueue } from "../shared/queue.js";
import { unwrap } from "../shared/result.js";
import { DrizzleUsageRecorder } from "../modules/billing/infrastructure/drizzle-usage.js";
import { createDossier, listDocuments, uploadDocuments, type DossierDeps } from "../modules/dossier/index.js";
import { FakePdfInspector, FakeUnzipper, InMemoryStorage, RecordingPublisher } from "../modules/dossier/application/test/fakes.js";
import { DrizzleDossierUow } from "../modules/dossier/infrastructure/drizzle-uow.js";
import { listChecks, runRules } from "../modules/validation/index.js";
import { createValidationInfrastructure } from "../modules/validation/infrastructure/index.js";
import { finishReading, getIssuedInvoices, getManualShipment, issueInvoiceAction, listInvoiceTemplates, saveInvoiceTemplate, listFields, processDocument, saveManualShipment, updateFieldValue, type ExtractionDeps } from "../modules/extraction/index.js";
import { DEFAULT_INVOICE_LAYOUT, ManualShipmentSchema } from "@kb/contracts";
import { createDocumentsAdapter, DrizzleExtractionUow, FakeAiProvider } from "../modules/extraction/infrastructure/index.js";
import { dec } from "../shared/decimal.js";
import { sql } from "drizzle-orm";
import { withCtx } from "../db/with-ctx.js";

let t: TestDb;
let db: Db;
let dossier: DossierDeps;
let extraction: ExtractionDeps;
const ctx: Ctx = { orgId: asOrgId("org_anphat"), userId: asUserId("usr_chau"), role: "ADMIN" };
const pdf = (name: string) => ({ name, mime: "application/pdf", bytes: Buffer.from(`%PDF-fake-${name}-1`) });

beforeAll(async () => {
  t = await startTestDb();
  await runSeed(t.adminUrl);
  db = createDb(t.appUrl, { max: 4 });
  const clock = fixedClock("2026-10-14T03:00:00.000Z");
  dossier = { uow: new DrizzleDossierUow(db), queue: new InMemoryJobQueue(), storage: new InMemoryStorage(), publisher: new RecordingPublisher(), pdf: new FakePdfInspector(), unzipper: new FakeUnzipper(), quota: { check: async () => true }, clock, idGen: ulidIdGen };
  const validationDeps = createValidationInfrastructure({ db });
  extraction = {
    uow: new DrizzleExtractionUow(db),
    documents: createDocumentsAdapter(dossier, async () => ({ taxCode: "0316789012", name: "CÔNG TY TNHH THIẾT BỊ CÔNG NGHIỆP AN PHÁT", suspectThreshold: "BALANCED" })),
    validation: { run: (orgId, dossierId, shipment, version, org) => runRules(validationDeps, orgId, dossierId, shipment, version, org) },
    ai: new FakeAiProvider(),
    usage: new DrizzleUsageRecorder(db, dec("25400")),
    skills: { resolve: async () => ({ skillVersionId: null, fieldHints: [], examples: [], customFields: [] }) },
    clock, idGen: ulidIdGen,
  };
});
afterAll(async () => {
  await db?.close();
  await t?.stop();
});

describe("luồng đọc chứng từ trên Postgres", () => {
  it("upload 3 file → đọc 3 → trường + luật, sửa trường có audit, xác nhận dữ liệu", async () => {
    const d = unwrap(await createDossier(dossier, ctx, { direction: "NK", typeCode: "A11", partner: "HANSOL", customsOffice: "03CE – HP", skillSetId: "default", dueDate: "2026-10-20", incoterm: "FCA", transportMode: "SEA_CONTAINER", partyClass: "4" }));
    const docs = unwrap(await uploadDocuments(dossier, ctx, d.id, [pdf("Commercial Invoice.pdf"), pdf("Packing List.pdf"), pdf("HBL.pdf")]));
    for (const doc of docs) unwrap(await processDocument(extraction, { orgId: ctx.orgId, dossierId: d.id, documentId: doc.id, mode: "FULL" }));
    const after = unwrap(await listDocuments(dossier, ctx, d.id));
    expect(after.every((x) => x.status === "DONE")).toBe(true);
    const fields = unwrap(await listFields(extraction, ctx, d.id));
    expect(fields.length).toBeGreaterThan(20);
    const gw = fields.filter((f) => f.key === "gross_weight");
    expect(gw.map((f) => f.status)).toContain("CONFLICT");
    const checks = unwrap(await listChecks(validationDepsOf(), ctx, d.id));
    expect(checks.map((c) => c.ruleCode)).toContain("R-WEIGHT-PL-BL");
    expect(checks.find((c) => c.ruleCode === "R-WEIGHT-PL-BL")?.result).toBe("FAIL");
    expect(checks.find((c) => c.ruleCode === "R-AMOUNT-SUM")?.result).toBe("PASS");
    const inv = fields.find((f) => f.key === "invoice_no" && f.status === "CROSS_CHECKED")!;
    const edited = unwrap(await updateFieldValue(extraction, ctx, inv.id, "HSP-2610-0458"));
    expect(edited.status).toBe("USER_CONFIRMED");
    unwrap(await finishReading(extraction, ctx, d.id));
    const dossierRow = await dossier.uow.asOrg(ctx, (r) => r.dossiers.get(ctx.orgId, d.id));
    expect(dossierRow).toMatchObject({ status: "NEEDS_REVIEW", step: "ocr", invoiceValue: "20850.000000", currency: "USD", billNo: "HPSEL2610078" });
    // chạy lại không nhân đôi
    unwrap(await processDocument(extraction, { orgId: ctx.orgId, dossierId: d.id, documentId: docs[0]!.id, mode: "FULL" }));
    expect(unwrap(await listFields(extraction, ctx, d.id)).filter((f) => f.key === "invoice_no" && f.documentId === docs[0]!.id)).toHaveLength(1);
  });
  it("org khác không thấy trường/luật", async () => {
    const other: Ctx = { orgId: asOrgId("org_khac"), userId: asUserId("usr_x"), role: "OWNER" };
    const d = (await dossier.uow.asOrg(ctx, (r) => r.dossiers.list(ctx.orgId, {}, { limit: 1, offset: 0 })))[0]!;
    expect(unwrap(await listFields(extraction, other, d.id))).toEqual([]);
    expect(unwrap(await listChecks(validationDepsOf(), other, d.id))).toEqual([]);
  });
  it("nhập tay lô hàng khi chưa có chứng từ (ADR 0013): lưu jsonb, shipment có dòng hàng, audit; org khác không đọc/ghi được", async () => {
    const d = unwrap(await createDossier(dossier, ctx, { direction: "XK", typeCode: "B11", partner: "NORDIC", customsOffice: "03CE – HP", skillSetId: "default", dueDate: "2026-11-20", incoterm: "FOB", transportMode: "SEA_CONTAINER", partyClass: "4" }));
    const data = ManualShipmentSchema.parse({ buyer: { name: "NORDIC TOOLING GROUP AB" }, invoice: { currency: "USD" }, items: [{ description: "Drill bit", quantity: "1000", unit: "PCE", unitPrice: "1.25" }] });
    expect(unwrap(await saveManualShipment(extraction, ctx, d.id, data)).data).toEqual(data);
    const ship = await extraction.uow.asOrg(ctx, (r) => r.shipments.latest(ctx.orgId, d.id));
    expect(ship?.data.invoice.totalAmount.value).toBe("1250.00");
    expect(ship?.data.items).toHaveLength(1);
    const other: Ctx = { orgId: asOrgId("org_khac"), userId: asUserId("usr_x"), role: "OWNER" };
    expect((await getManualShipment(extraction, other, d.id)).ok).toBe(false);
    expect((await saveManualShipment(extraction, other, d.id, data)).ok).toBe(false);
    expect(await extraction.uow.asOrg(other, (r) => r.manual.get(other.orgId, d.id))).toBeNull();
  });
  it("cấp số hóa đơn (ADR 0013 mục 3): số tuần tự kể cả cấp song song, một số đang dùng mỗi hồ sơ, số duy nhất; hủy không tái dùng; org khác không thấy", async () => {
    const data = ManualShipmentSchema.parse({ buyer: { name: "NORDIC TOOLING GROUP AB" }, invoice: { currency: "USD" }, items: [{ description: "Drill bit", quantity: "10", unit: "PCE", unitPrice: "2" }] });
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const d = unwrap(await createDossier(dossier, ctx, { direction: "XK", typeCode: "B11", partner: `NORDIC ${i}`, customsOffice: "03CE – HP", skillSetId: "default", dueDate: "2026-11-20", incoterm: "FOB", transportMode: "SEA_CONTAINER", partyClass: "4", startMode: "DECLARE_FIRST" }));
      unwrap(await saveManualShipment(extraction, ctx, d.id, data));
      ids.push(d.id);
    }
    // Ba hồ sơ cấp số cùng lúc → ba số khác nhau, liên tục (bộ đếm khóa dòng).
    const nos = (await Promise.all(ids.map((id) => issueInvoiceAction(extraction, ctx, id, { action: "RESERVE" })))).map((v) => unwrap(v).current!.no);
    expect([...nos].sort()).toEqual(["INV2610-001", "INV2610-002", "INV2610-003"]);
    // Bấm cấp số hai lần cùng lúc trên một hồ sơ → chỉ một số đang dùng.
    const d0 = ids[0]!;
    unwrap(await issueInvoiceAction(extraction, ctx, d0, { action: "VOID", reason: "Sai người mua" }));
    const twice = await Promise.allSettled([issueInvoiceAction(extraction, ctx, d0, { action: "RESERVE" }), issueInvoiceAction(extraction, ctx, d0, { action: "RESERVE" })]);
    expect(twice.filter((x) => x.status === "fulfilled" && x.value.ok)).toHaveLength(1);
    const v = unwrap(await getIssuedInvoices(extraction, ctx, d0));
    expect(v.current?.no).toMatch(/^INV2610-00[45]$/);
    expect(v.history.map((h) => h.status).sort()).toEqual(["RESERVED", "VOID"]);
    const ship = await extraction.uow.asOrg(ctx, (r) => r.shipments.latest(ctx.orgId, d0));
    expect(ship?.data.invoice.no.value).toBe(v.current?.no);
    // Số duy nhất theo doanh nghiệp (index issued_documents_org_no_uq).
    await expect(extraction.uow.asOrg(ctx, (r) => r.issued.insert({ id: "isd_dup", orgId: ctx.orgId, dossierId: ids[1]!, kind: "INVOICE", no: nos[0]!, status: "VOID", snapshot: null, issuedBy: ctx.userId, issuedAt: new Date(), releasedBy: null, releasedAt: null, templateId: null, voidedBy: null, voidedAt: null, voidReason: null }))).rejects.toThrow();
    const other: Ctx = { orgId: asOrgId("org_khac"), userId: asUserId("usr_x"), role: "OWNER" };
    expect((await getIssuedInvoices(extraction, other, d0)).ok).toBe(false);
    expect(await extraction.uow.asOrg(other, (r) => r.issued.list(other.orgId, d0))).toEqual([]);
    expect(await extraction.uow.asOrg(other, (r) => r.issued.peekSeq(other.orgId, "INVOICE", "INV{YY}{MM}-{NNN}", "2610"))).toBe(1);
  });
  it("phát hành sau thông quan: snapshot jsonb (layout, số tờ khai, thông tin bổ sung) ghi và đọc lại được; chưa thông quan thì từ chối", async () => {
    const data = ManualShipmentSchema.parse({ buyer: { name: "NORDIC TOOLING GROUP AB" }, invoice: { currency: "USD" }, marks: "NTG", items: [{ description: "Drill bit", quantity: "10", unit: "PCE", unitPrice: "2" }] });
    const d = unwrap(await createDossier(dossier, ctx, { direction: "XK", typeCode: "B11", partner: "NORDIC REL", customsOffice: "03CE – HP", skillSetId: "default", dueDate: "2026-11-20", incoterm: "FOB", transportMode: "SEA_CONTAINER", partyClass: "4", startMode: "DECLARE_FIRST" }));
    unwrap(await saveManualShipment(extraction, ctx, d.id, data));
    const no = unwrap(await issueInvoiceAction(extraction, ctx, d.id, { action: "RESERVE" })).current!.no;
    const early = await issueInvoiceAction(extraction, ctx, d.id, { action: "RELEASE" });
    expect(!early.ok && early.error.reason).toBe("INVOICE_NOT_CLEARED");
    await withCtx(db, ctx, (tx) => tx.execute(sql`update dossiers set status = 'CLEARED', declaration_no = '306123456780' where id = ${d.id}`));
    const tpl = unwrap(await saveInvoiceTemplate(extraction, ctx, null, { name: "Mẫu phát hành", isDefault: false, layout: { ...DEFAULT_INVOICE_LAYOUT, title: "INVOICE" } }));
    unwrap(await issueInvoiceAction(extraction, ctx, d.id, { action: "RELEASE", templateId: tpl.id, extra: { lcNo: "LC-INT-9", blNo: "BL-9" } }));
    const v = unwrap(await getIssuedInvoices(extraction, ctx, d.id));
    expect(v.current).toMatchObject({ no, status: "ISSUED", templateId: tpl.id });
    expect(v.current?.releasedAt).not.toBeNull();
    expect(v.current?.snapshot).toMatchObject({ declarationNo: "306123456780", marks: "NTG", extra: { lcNo: "LC-INT-9", blNo: "BL-9" }, layout: { title: "INVOICE" }, invoice: { totalAmount: "20.00" } });
    // Phát hành không đổi tờ khai: số trên shipment giữ nguyên.
    const ship = await extraction.uow.asOrg(ctx, (r) => r.shipments.latest(ctx.orgId, d.id));
    expect(ship?.data.invoice.no.value).toBe(no);
  });
  it("mẫu in hóa đơn: lưu/đọc layout jsonb, một mẫu mặc định, RLS theo org", async () => {
    const a = unwrap(await saveInvoiceTemplate(extraction, ctx, null, { name: "Mẫu A", layout: DEFAULT_INVOICE_LAYOUT }));
    const b = unwrap(await saveInvoiceTemplate(extraction, ctx, null, { name: "Mẫu B", isDefault: true, layout: { ...DEFAULT_INVOICE_LAYOUT, title: "INVOICE" } }));
    const list = unwrap(await listInvoiceTemplates(extraction, ctx));
    expect(list[0]?.id).toBe(b.id); // mẫu mặc định đứng đầu
    expect(list.filter((t) => t.isDefault).map((t) => t.id)).toEqual([b.id]); // một mặc định duy nhất (index invoice_templates_one_default_uq)
    expect(list.find((t) => t.id === a.id)?.isDefault).toBe(false);
    expect(list[0]?.layout.title).toBe("INVOICE");
    const other: Ctx = { orgId: asOrgId("org_khac"), userId: asUserId("usr_x"), role: "OWNER" };
    expect(unwrap(await listInvoiceTemplates(extraction, other))).toEqual([]);
  });
});

function validationDepsOf() {
  return createValidationInfrastructure({ db });
}
