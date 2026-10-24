// Luồng GĐ 4 trên Postgres thật: hồ sơ → đọc chứng từ (AI giả) → agent (HS giả theo biểu thuế seed) → tờ khai nháp → xác nhận HS → review → duyệt.
// Adapter thật sang dossier/extraction/validation; RLS thật.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "../db/client.js";
import { runSeed } from "../db/seed/index.js";
import { startTestDb, type TestDb } from "../db/test-db.js";
import { systemClock } from "../shared/clock.js";
import type { Ctx } from "../shared/ctx.js";
import { asOrgId, asUserId, ulidIdGen } from "../shared/ids.js";
import { InMemoryJobQueue } from "../shared/queue.js";
import { errCode, unwrap } from "../shared/result.js";
import { DrizzleUsageRecorder } from "../modules/billing/infrastructure/drizzle-usage.js";
import { createDossier, uploadDocuments, type DossierDeps } from "../modules/dossier/index.js";
import { FakePdfInspector, FakeUnzipper, InMemoryStorage, RecordingPublisher } from "../modules/dossier/application/test/fakes.js";
import { DrizzleDossierUow } from "../modules/dossier/infrastructure/drizzle-uow.js";
import { listChecks, runRules } from "../modules/validation/index.js";
import { createValidationInfrastructure } from "../modules/validation/infrastructure/index.js";
import { finishReading, processDocument, type ExtractionDeps } from "../modules/extraction/index.js";
import { createDocumentsAdapter, DrizzleExtractionUow, FakeAiProvider } from "../modules/extraction/infrastructure/index.js";
import { approveDeclaration, confirmHs, getAgentRun, getDeclarationView, listLineItems, moveToReview, runAgent, startAgentRun, updateDeclarationField, type DeclarationDeps } from "../modules/declaration/index.js";
import { createAuditWriter, createDossierAdapter, createShipmentReader, createValidationReader, DrizzleDeclarationUow, FakeHsClassificationService } from "../modules/declaration/infrastructure/index.js";
import { dec } from "../shared/decimal.js";
import { withCtx } from "../db/with-ctx.js";
import { sql } from "drizzle-orm";

let t: TestDb;
let db: Db;
let dossier: DossierDeps;
let extraction: ExtractionDeps;
let declaration: DeclarationDeps;
let queue: InMemoryJobQueue;
const chau: Ctx = { orgId: asOrgId("org_anphat"), userId: asUserId("usr_chau"), role: "DECLARANT" };
const tuan: Ctx = { orgId: asOrgId("org_anphat"), userId: asUserId("usr_tuan"), role: "APPROVER" };
const other: Ctx = { orgId: asOrgId("org_khac"), userId: asUserId("usr_x"), role: "OWNER" };
const pdf = (name: string) => ({ name, mime: "application/pdf", bytes: Buffer.from(`%PDF-fake-${name}-1`) });
const ORG = { taxCode: "0316789012", name: "CÔNG TY TNHH THIẾT BỊ CÔNG NGHIỆP AN PHÁT", address: "Lô B4, KCN Tràng Duệ, An Dương, Hải Phòng", phone: "0225 3 888 123", fourEyes: false };

beforeAll(async () => {
  t = await startTestDb();
  await runSeed(t.adminUrl);
  db = createDb(t.appUrl, { max: 4 });
  queue = new InMemoryJobQueue();
  dossier = { uow: new DrizzleDossierUow(db), queue, storage: new InMemoryStorage(), publisher: new RecordingPublisher(), pdf: new FakePdfInspector(), unzipper: new FakeUnzipper(), quota: { check: async () => true }, clock: systemClock, idGen: ulidIdGen };
  const validation = createValidationInfrastructure({ db });
  extraction = {
    uow: new DrizzleExtractionUow(db), documents: createDocumentsAdapter(dossier, async () => ({ ...ORG, suspectThreshold: "BALANCED" })),
    validation: { run: (orgId, dossierId, shipment, version, org) => runRules(validation, orgId, dossierId, shipment, version, org) },
    ai: new FakeAiProvider(), usage: new DrizzleUsageRecorder(db, dec("25400")), skills: { resolve: async () => ({ skillVersionId: null, fieldHints: [], examples: [], customFields: [] }) }, clock: systemClock, idGen: ulidIdGen,
  };
  const uow = new DrizzleDeclarationUow(db);
  declaration = {
    uow, queue, hs: new FakeHsClassificationService(() => uow.asOrg({ orgId: asOrgId("org_anphat"), userId: asUserId("") }, (r) => r.catalogHs.all())),
    shipments: createShipmentReader(extraction, dossier), dossiers: createDossierAdapter(dossier), validation: createValidationReader(validation), org: { get: async () => ORG },
    audit: createAuditWriter(extraction), users: { names: async (_o, ids) => new Map(ids.map((id) => [id, id === "usr_tuan" ? "Phạm Anh Tuấn" : id])) }, clock: systemClock, idGen: ulidIdGen,
  };
});
afterAll(async () => {
  await db?.close();
  await t?.stop();
});

async function prepareDossier(files: string[]) {
  const d = unwrap(await createDossier(dossier, chau, { direction: "NK", typeCode: "A11", partner: "HANSOL", customsOffice: "03CE – Chi cục HQ CK cảng Hải Phòng KV III", skillSetId: "default", dueDate: "2026-10-20", incoterm: "FCA", transportMode: "SEA_CONTAINER", partyClass: "4" }));
  const docs = unwrap(await uploadDocuments(dossier, chau, d.id, files.map(pdf)));
  for (const doc of docs) unwrap(await processDocument(extraction, { orgId: chau.orgId, dossierId: d.id, documentId: doc.id, mode: "FULL" }));
  unwrap(await finishReading(extraction, chau, d.id));
  return d.id;
}
async function runAgentFor(dossierId: string) {
  unwrap(await startAgentRun(declaration, chau, dossierId, "BOTH"));
  const job = queue.jobs.filter((j) => j.name === "run-agent").at(-1)!.payload as { agentRunId: string };
  return unwrap(await runAgent(declaration, { orgId: chau.orgId, userId: chau.userId, dossierId, agentRunId: job.agentRunId }));
}

/** Bộ HANSOL không có vận đơn/kho → người khai nhập tay các chỉ tiêu bắt buộc còn trống trước khi duyệt. */
const MANUAL_FIELDS: Record<string, string> = { SO_VD: "HSPL261014001", KHO: "03CCS01", CANG_DO: "VNHPH – Cảng Hải Phòng", CANG_XEP: "KRPUS – BUSAN", PTVC_TEN: "HANSOL VOY 2610", NGAY_DEN: "2026-10-20" };
async function fillManualFields(deps: DeclarationDeps, ctx: Parameters<typeof updateDeclarationField>[1], dossierId: string) {
  const fields = unwrap(await getDeclarationView(deps, ctx, dossierId)).declaration!.fields;
  for (const [code, value] of Object.entries(MANUAL_FIELDS)) if (!fields.find((f) => f.code === code)?.value.trim()) unwrap(await updateDeclarationField(deps, ctx, dossierId, code, value));
}

describe("luồng tờ khai trên Postgres thật", () => {
  it("agent: 7 dòng hàng, HS gợi ý từ biểu thuế seed, tờ khai nháp IDA với tỷ giá seed, số hóa 3 file; org khác không thấy", async () => {
    const id = await prepareDossier(["Commercial Invoice.pdf", "Packing List.pdf", "HBL.pdf"]);
    const v = await runAgentFor(id);
    expect(v.finished).toBe(true);
    const items = unwrap(await listLineItems(declaration, chau, id));
    expect(items).toHaveLength(7);
    expect(items[0]).toMatchObject({ description: "Deep groove ball bearing 6205-2RS, bore 25 mm", hsSuggested: "8482.10.00", invoiceHsCode: "8482.10.1000" });
    expect(items[2]!.hsSuggested).toBe("8482.20.00");
    expect(items[4]!.hsSuggested).toBe("8466.93.90");
    const view = unwrap(await getDeclarationView(declaration, chau, id));
    expect(view.declaration).toMatchObject({ kind: "IDA", status: "DRAFT", exchangeRate: "26150.000000" });
    expect(view.declaration!.customsValueVnd).toBe("545227500.000000"); // 20.850 USD × 26.150 – FCA chưa có hóa đơn cước
    expect(view.declaration!.fields.find((f) => f.code === "PHI_VC")).toMatchObject({ suspect: true });
    expect(view.declaration!.fields.find((f) => f.code === "CANG_XEP")?.value).toBe("KRPUS – Busan");
    expect(view.declaration!.fields.find((f) => f.code === "NNK_TEN")?.value).toBe(ORG.name);
    expect(view.declaration!.fields.find((f) => f.code === "TRONG_LUONG")).toMatchObject({ suspect: true }); // PL ≠ B/L
    expect((dossier.storage as InMemoryStorage).keys().filter((k) => k.includes("/digitized/"))).toHaveLength(3);
    expect(unwrap(await getAgentRun(declaration, chau, id))?.logs.length).toBeGreaterThan(5);
    expect(errCode(await listLineItems(declaration, other, id))).toBe("NOT_FOUND");
    expect(errCode(await getDeclarationView(declaration, other, id))).toBe("NOT_FOUND");
  });

  it("xác nhận HS (thuế suất, field_audit) → review → duyệt bị chặn vì BLOCKER FAIL (trọng lượng PL ≠ B/L); sửa chỉ tiêu tay giữ qua dựng lại", async () => {
    const id = (await dossier.uow.asOrg(chau, (r) => r.dossiers.list(chau.orgId, {}, { limit: 1, offset: 0 })))[0]!.id;
    const items = unwrap(await listLineItems(declaration, chau, id));
    for (const it of items) unwrap(await confirmHs(declaration, chau, it.id, it.hsSuggested ?? "8482.10.00"));
    const audits = await withCtx(db, chau, (tx) => tx.execute(sql`select key, new_value, source from field_audit where dossier_id = ${id} and source = 'HS_CONFIRM' order by at`));
    expect(audits).toHaveLength(7);
    unwrap(await updateDeclarationField(declaration, chau, id, "KHO", "03CCS01"));
    unwrap(await moveToReview(declaration, chau, id));
    const view = unwrap(await getDeclarationView(declaration, chau, id));
    expect(view.unconfirmedHs).toBe(0);
    expect(view.items[0]!.importDutyVnd).not.toBe("0"); // MFN 3% vì không có C/O trong bộ 3 file
    expect(view.declaration!.fields.find((f) => f.code === "KHO")).toMatchObject({ value: "03CCS01", source: "USER" });
    const checks = unwrap(await listChecks(createValidationInfrastructure({ db }), chau, id));
    expect(checks.some((c) => c.ruleCode === "R-WEIGHT-PL-BL" && c.result === "FAIL")).toBe(true);
    expect(errCode(await approveDeclaration(declaration, tuan, id))).toBe("BLOCKER_FAILED");
    expect(errCode(await approveDeclaration(declaration, chau, id))).toBe("FORBIDDEN");
  });

  it("bộ chứng từ không mâu thuẫn (Invoice + PL + hóa đơn cước): duyệt thành công, hồ sơ APPROVED/step submit", async () => {
    const id = await prepareDossier(["Commercial Invoice.pdf", "Packing List.pdf", "Hoa don cuoc GTGT.pdf"]);
    await runAgentFor(id);
    for (const it of unwrap(await listLineItems(declaration, chau, id))) unwrap(await confirmHs(declaration, chau, it.id, it.hsSuggested ?? "8482.10.00"));
    unwrap(await moveToReview(declaration, chau, id));
    expect(errCode(await approveDeclaration(declaration, tuan, id))).toBe("BLOCKER_FAILED"); // hàng chương 84 chưa chọn MO/CU (CV 2061)
    unwrap(await updateDeclarationField(declaration, chau, id, "VBPQ", "MO"));
    expect(errCode(await approveDeclaration(declaration, tuan, id))).toBe("VALIDATION"); // chỉ tiêu bắt buộc (kho, vận đơn) còn trống
    await fillManualFields(declaration, chau, id);
    const a = unwrap(await approveDeclaration(declaration, tuan, id));
    expect(a).toMatchObject({ status: "APPROVED", approvedBy: "Phạm Anh Tuấn" });
    const row = await dossier.uow.asOrg(chau, (r) => r.dossiers.get(chau.orgId, id));
    expect(row).toMatchObject({ status: "APPROVED", step: "submit" });
  });
});
