// Luồng GĐ 5 trên Postgres thật: hồ sơ đã duyệt (từ pipeline GĐ2–4) → khai tạm IDA (outbox) → người khai bấm IDC, HYS → poll IID → CLEARED.
// Adapter thật sang declaration/dossier/validation/identity; FakeCustomsGateway; RLS thật.
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
import { runRules } from "../modules/validation/index.js";
import { createValidationInfrastructure } from "../modules/validation/infrastructure/index.js";
import { finishReading, processDocument, type ExtractionDeps } from "../modules/extraction/index.js";
import { createDocumentsAdapter, DrizzleExtractionUow, FakeAiProvider } from "../modules/extraction/infrastructure/index.js";
import { approveDeclaration, confirmHs, getDeclarationView, listLineItems, moveToReview, runAgent, startAgentRun, updateDeclarationField, type DeclarationDeps } from "../modules/declaration/index.js";
import { createAuditWriter, createDossierAdapter, createShipmentReader, createValidationReader, DrizzleDeclarationUow, FakeHsClassificationService } from "../modules/declaration/infrastructure/index.js";
import { addCertificate, listCertificates, type IdentityDeps } from "../modules/identity/index.js";
import { FakeHasher, FakeTaxRegistry, InMemoryRateLimiter, RecordingMailer } from "../modules/identity/application/test/fakes.js";
import { DrizzlePlansReader } from "../modules/identity/infrastructure/drizzle-plans-reader.js";
import { DrizzleIdentityUow } from "../modules/identity/infrastructure/drizzle-uow.js";
import { getSubmission, listCustomsDeclarations, performOperation, pollStatus, processOutbox, resendOperation, submitDeclaration, type CustomsDeps } from "../modules/integration/index.js";
import { createCertificateReader, createCustomsDossierPort, createCustomsValidationReader, createDeclarationReader, DrizzleCustomsUow, FakeCustomsGateway } from "../modules/integration/infrastructure/index.js";
import { dec } from "../shared/decimal.js";

let t: TestDb;
let db: Db;
let dossier: DossierDeps;
let extraction: ExtractionDeps;
let declaration: DeclarationDeps;
let identity: IdentityDeps;
let customs: CustomsDeps;
let queue: InMemoryJobQueue;
const chau: Ctx = { orgId: asOrgId("org_anphat"), userId: asUserId("usr_chau"), role: "DECLARANT" };
const tuan: Ctx = { orgId: asOrgId("org_anphat"), userId: asUserId("usr_tuan"), role: "APPROVER" };
const admin: Ctx = { orgId: asOrgId("org_anphat"), userId: asUserId("usr_chau"), role: "ADMIN" };
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
  const duow = new DrizzleDeclarationUow(db);
  declaration = {
    uow: duow, queue, hs: new FakeHsClassificationService(() => duow.asOrg({ orgId: asOrgId("org_anphat"), userId: asUserId("") }, (r) => r.catalogHs.all())),
    shipments: createShipmentReader(extraction, dossier), dossiers: createDossierAdapter(dossier), validation: createValidationReader(validation), org: { get: async () => ORG },
    audit: createAuditWriter(extraction), users: { names: async (_o, ids) => new Map(ids.map((id) => [id, id])) }, clock: systemClock, idGen: ulidIdGen,
  };
  identity = { uow: new DrizzleIdentityUow(db), plans: new DrizzlePlansReader(db), hasher: new FakeHasher(), rateLimiter: new InMemoryRateLimiter(systemClock), mailer: new RecordingMailer(), taxRegistry: new FakeTaxRegistry(), clock: systemClock, idGen: ulidIdGen, appUrl: "http://localhost:3100" };
  customs = {
    uow: new DrizzleCustomsUow(db), queue, gateway: new FakeCustomsGateway({ clearAfterPolls: 2, flakyHys: false }),
    declarations: createDeclarationReader(declaration), dossiers: createCustomsDossierPort(dossier), validation: createCustomsValidationReader(validation), certificates: createCertificateReader(identity),
    audit: declaration.audit, org: { fourEyes: async () => false }, pollDelayMs: 1, clock: systemClock, idGen: ulidIdGen,
  };
});
afterAll(async () => {
  await db?.close();
  await t?.stop();
});

/** Bộ HANSOL không có vận đơn/kho → người khai nhập tay các chỉ tiêu bắt buộc còn trống trước khi duyệt. */
const MANUAL_FIELDS: Record<string, string> = { SO_VD: "HSPL261014001", KHO: "03CCS01", CANG_DO: "VNHPH – Cảng Hải Phòng", CANG_XEP: "KRPUS – BUSAN", PTVC_TEN: "HANSOL VOY 2610", NGAY_DEN: "2026-10-20" };
async function fillManualFields(deps: DeclarationDeps, ctx: Parameters<typeof updateDeclarationField>[1], dossierId: string) {
  const fields = unwrap(await getDeclarationView(deps, ctx, dossierId)).declaration!.fields;
  for (const [code, value] of Object.entries(MANUAL_FIELDS)) if (!fields.find((f) => f.code === code)?.value.trim()) unwrap(await updateDeclarationField(deps, ctx, dossierId, code, value));
}

async function approvedDossier() {
  const d = unwrap(await createDossier(dossier, chau, { direction: "NK", typeCode: "A11", partner: "HANSOL", customsOffice: "03CE – Chi cục HQ CK cảng Hải Phòng KV III", skillSetId: "default", dueDate: "2026-10-20", incoterm: "FCA", transportMode: "SEA_CONTAINER", partyClass: "4" }));
  const docs = unwrap(await uploadDocuments(dossier, chau, d.id, ["Commercial Invoice.pdf", "Packing List.pdf", "Hoa don cuoc GTGT.pdf"].map(pdf)));
  for (const doc of docs) unwrap(await processDocument(extraction, { orgId: chau.orgId, dossierId: d.id, documentId: doc.id, mode: "FULL" }));
  unwrap(await finishReading(extraction, chau, d.id));
  unwrap(await startAgentRun(declaration, chau, d.id, "DECLARATION"));
  const job = queue.jobs.filter((j) => j.name === "run-agent").at(-1)!.payload as { agentRunId: string };
  unwrap(await runAgent(declaration, { orgId: chau.orgId, userId: chau.userId, dossierId: d.id, agentRunId: job.agentRunId }));
  for (const it of unwrap(await listLineItems(declaration, chau, d.id))) unwrap(await confirmHs(declaration, chau, it.id, it.hsSuggested ?? "8482.10.00"));
  unwrap(await moveToReview(declaration, chau, d.id));
  unwrap(await updateDeclarationField(declaration, chau, d.id, "VBPQ", "MO")); // hàng chương 84 – CV 2061/TCHQ-GSQL
  await fillManualFields(declaration, chau, d.id);
  unwrap(await approveDeclaration(declaration, tuan, d.id));
  return d.id;
}
async function drain() {
  for (let i = 0; i < 30; i++) {
    const job = queue.jobs.filter((j) => j.name === "customs-send" || j.name === "customs-poll")[0];
    if (!job) return;
    queue.jobs.splice(queue.jobs.indexOf(job), 1);
    const p = job.payload as Record<string, string | number>;
    if (job.name === "customs-send") await processOutbox(customs, { orgId: String(p["orgId"]), userId: String(p["userId"]), outboxId: String(p["outboxId"]) });
    else await pollStatus(customs, { orgId: String(p["orgId"]), userId: String(p["userId"]), dossierId: String(p["dossierId"]), attempt: Number(p["attempt"]) });
  }
}

describe("luồng truyền Hải quan trên Postgres thật", () => {
  it("truyền hồ sơ đã duyệt: cần chứng thư; IDA → (người khai) IDC → HYS → hỏi IID; số tờ khai/phân luồng/thông quan; hồ sơ CLEARED; org khác không thấy; truyền lần 2 → ALREADY_SUBMITTED", async () => {
    const id = await approvedDossier();
    expect(errCode(await submitDeclaration(customs, chau, id, "cert_nope"))).toBe("NO_CERT");
    const cert = unwrap(await addCertificate(identity, admin, { issuer: "VNPT-CA", serial: "5404FFFEB7033FB3", validTo: "2027-12-31" }));
    expect(unwrap(await listCertificates(identity, chau)).some((c) => c.id === cert.id)).toBe(true);
    unwrap(await submitDeclaration(customs, chau, id, cert.id));
    expect(errCode(await submitDeclaration(customs, chau, id, cert.id))).toBe("ALREADY_SUBMITTED");
    await drain();
    expect(unwrap(await getSubmission(customs, chau, id))).toMatchObject({ stage: "PRE_DECLARED", nextOp: "IDC" });
    unwrap(await performOperation(customs, chau, id, "IDC"));
    unwrap(await performOperation(customs, chau, id, "HYS"));
    await drain();
    const v = unwrap(await getSubmission(customs, chau, id));
    expect(v.pipeline.filter((p) => p.status === "OK").map((p) => p.op)).toEqual(["IDA", "IDC", "HYS"]);
    expect(v.result?.declarationNo).toMatch(/^107\d{9}$/);
    expect(v.result?.clearanceStatus).toBe("CLEARED");
    expect(v.messages.every((m) => !m.payloadPreview.includes("0316789012"))).toBe(true);
    const row = await dossier.uow.asOrg(chau, (r) => r.dossiers.get(chau.orgId, id));
    expect(row).toMatchObject({ status: "CLEARED", declarationNo: v.result?.declarationNo });
    const rows = unwrap(await listCustomsDeclarations(customs, chau));
    expect(rows.find((r) => r.dossierId === id)?.state).toBe("CLEARED");
    expect(errCode(await getSubmission(customs, other, id))).toBe("NOT_FOUND");
    expect(unwrap(await listCustomsDeclarations(customs, other))).toEqual([]);
    const rs = unwrap(await resendOperation(customs, chau, id, "IEX"));
    expect(rs.resent).toBe(false);
  });
});
