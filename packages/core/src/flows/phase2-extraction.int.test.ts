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
import { finishReading, listFields, processDocument, updateFieldValue, type ExtractionDeps } from "../modules/extraction/index.js";
import { createDocumentsAdapter, DrizzleExtractionUow, FakeAiProvider } from "../modules/extraction/infrastructure/index.js";
import { dec } from "../shared/decimal.js";

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
});

function validationDepsOf() {
  return createValidationInfrastructure({ db });
}
