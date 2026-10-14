import { beforeEach, describe, expect, it } from "vitest";
import { fixedClock } from "../../../../shared/clock.js";
import type { Ctx } from "../../../../shared/ctx.js";
import { asOrgId, asUserId, sequentialIdGen } from "../../../../shared/ids.js";
import { InMemoryJobQueue } from "../../../../shared/queue.js";
import { unwrap } from "../../../../shared/result.js";
import { cancelDossier } from "../cancel-dossier.js";
import { changeDocumentKind } from "../change-document-kind.js";
import { createDossier } from "../create-dossier.js";
import { deleteDocument } from "../delete-document.js";
import { getDossier } from "../get-dossier.js";
import { listDocuments } from "../list-documents.js";
import { listDossiers } from "../list-dossiers.js";
import type { DossierDeps } from "../ports.js";
import { retryDocument } from "../retry-document.js";
import { FakePdfInspector, FakeUnzipper, InMemoryStorage, RecordingPublisher } from "../test/fakes.js";
import { InMemoryDossierUow } from "../test/in-memory-uow.js";
import { updateDossier } from "../update-dossier.js";
import { uploadDocuments } from "../upload-documents.js";

const ctx = (role: Ctx["role"] = "DECLARANT", orgId = "org_a", userId = "usr_a"): Ctx => ({ orgId: asOrgId(orgId), userId: asUserId(userId), role });
const INPUT = { direction: "NK" as const, typeCode: "A11", partner: "HANSOL", customsOffice: "03CE – Chi cục HQ CK cảng Hải Phòng KV III", skillSetId: "default", dueDate: "2026-10-20", incoterm: "FCA", transportMode: "SEA" as const };
const pdf = (name: string, pages = 2) => ({ name, mime: "application/pdf", bytes: Buffer.from(`%PDF-fake-${name}-${pages}`) });

let uow: InMemoryDossierUow;
let queue: InMemoryJobQueue;
let storage: InMemoryStorage;
let publisher: RecordingPublisher;
let deps: DossierDeps;
let quota: { dossiers: number; pages: number };

beforeEach(() => {
  uow = new InMemoryDossierUow();
  queue = new InMemoryJobQueue();
  storage = new InMemoryStorage();
  publisher = new RecordingPublisher();
  quota = { dossiers: 10, pages: 20 };
  deps = {
    uow, queue, storage, publisher,
    pdf: new FakePdfInspector(),
    unzipper: new FakeUnzipper(),
    quota: { check: async (_orgId, kind, amount) => (kind === "DOSSIER" ? amount <= quota.dossiers : amount <= quota.pages) },
    clock: fixedClock("2026-10-14T03:00:00.000Z"),
    idGen: sequentialIdGen(),
  };
});

describe("createDossier / list / get", () => {
  it("tạo hồ sơ DRAFT bước upload, mã HS-NK-2610-001, chủ là người tạo", async () => {
    const d = unwrap(await createDossier(deps, ctx(), INPUT));
    expect(d).toMatchObject({ code: "HS-NK-2610-001", status: "DRAFT", step: "upload", ownerId: "usr_a", partner: "HANSOL", suspectFields: 0, invoiceValue: "0" });
    expect(unwrap(await listDossiers(deps, ctx(), {})).map((x) => x.id)).toEqual([d.id]);
    expect(unwrap(await getDossier(deps, ctx(), d.id)).code).toBe(d.code);
  });
  it("VIEWER không tạo được; hết hạn mức → QUOTA_EXCEEDED", async () => {
    expect((await createDossier(deps, ctx("VIEWER"), INPUT)).ok).toBe(false);
    quota.dossiers = 0;
    const r = await createDossier(deps, ctx(), INPUT);
    if (!r.ok) expect(r.error.code).toBe("QUOTA_EXCEEDED");
    else throw new Error("phải lỗi");
  });
  it("org B không thấy/lấy được hồ sơ của A", async () => {
    const d = unwrap(await createDossier(deps, ctx(), INPUT));
    expect(unwrap(await listDossiers(deps, ctx("OWNER", "org_b", "usr_b"), {}))).toEqual([]);
    expect((await getDossier(deps, ctx("OWNER", "org_b", "usr_b"), d.id)).ok).toBe(false);
  });
  it("lọc theo direction/status", async () => {
    unwrap(await createDossier(deps, ctx(), INPUT));
    unwrap(await createDossier(deps, ctx(), { ...INPUT, direction: "XK" }));
    expect(unwrap(await listDossiers(deps, ctx(), { direction: "XK" }))).toHaveLength(1);
    expect(unwrap(await listDossiers(deps, ctx(), { status: "CLEARED" }))).toHaveLength(0);
  });
});

describe("updateDossier / cancel", () => {
  it("đổi note; đổi step tới submit khi chưa APPROVED → INVALID_STATE; hủy hồ sơ DRAFT ok, đã truyền → DOSSIER_LOCKED", async () => {
    const d = unwrap(await createDossier(deps, ctx(), INPUT));
    expect(unwrap(await updateDossier(deps, ctx(), d.id, { note: "PO 114" })).note).toBe("PO 114");
    const r = await updateDossier(deps, ctx(), d.id, { step: "submit" });
    if (!r.ok) expect(r.error.code).toBe("INVALID_STATE");
    else throw new Error("phải lỗi");
    expect(unwrap(await cancelDossier(deps, ctx(), d.id)).status).toBe("CANCELLED");
    uow.data.dossiers[0]!.status = "SUBMITTED";
    const l = await cancelDossier(deps, ctx(), d.id);
    if (!l.ok) expect(l.error.code).toBe("DOSSIER_LOCKED");
    else throw new Error("phải lỗi");
  });
});

describe("uploadDocuments", () => {
  it("3 PDF → 3 chứng từ QUEUED, loại theo tên file, file lên storage, job extract-document mỗi file, hồ sơ PROCESSING, sự kiện tiến trình", async () => {
    const d = unwrap(await createDossier(deps, ctx(), INPUT));
    const docs = unwrap(await uploadDocuments(deps, ctx(), d.id, [pdf("Commercial Invoice.pdf"), pdf("Packing List.pdf"), pdf("HBL.pdf")]));
    expect(docs.map((x) => x.kind)).toEqual(["INVOICE", "PACKING_LIST", "BILL_OF_LADING"]);
    expect(docs.every((x) => x.status === "QUEUED" && x.pages === 2)).toBe(true);
    expect(storage.keys().every((k) => k.startsWith(`orgs/org_a/dossiers/${d.id}/`))).toBe(true);
    expect(queue.jobs.filter((j) => j.name === "extract-document")).toHaveLength(3);
    expect(queue.jobs[0]?.jobId).toMatch(/^extract:doc_/);
    expect(unwrap(await getDossier(deps, ctx(), d.id)).status).toBe("PROCESSING");
    expect(publisher.events.some((e) => e.type === "document.status")).toBe(true);
    expect(unwrap(await listDocuments(deps, ctx(), d.id))).toHaveLength(3);
  });
  it("PDF có mật khẩu → FILE_INVALID (không tạo chứng từ); vượt trang gói → QUOTA_EXCEEDED; hồ sơ đã truyền → DOSSIER_LOCKED", async () => {
    const d = unwrap(await createDossier(deps, ctx(), INPUT));
    const enc = await uploadDocuments(deps, ctx(), d.id, [{ name: "locked.pdf", mime: "application/pdf", bytes: Buffer.from("%PDF-encrypted") }]);
    if (!enc.ok) expect(enc.error.code).toBe("FILE_INVALID");
    else throw new Error("phải lỗi");
    expect(uow.data.documents).toHaveLength(0);
    quota.pages = 3;
    const big = await uploadDocuments(deps, ctx(), d.id, [pdf("a.pdf", 2), pdf("b.pdf", 2)]);
    if (!big.ok) expect(big.error.code).toBe("QUOTA_EXCEEDED");
    else throw new Error("phải lỗi");
    uow.data.dossiers[0]!.status = "SUBMITTED";
    expect((await uploadDocuments(deps, ctx(), d.id, [pdf("c.pdf")])).ok).toBe(false);
  });
  it("zip được bung thành các file bên trong", async () => {
    const d = unwrap(await createDossier(deps, ctx(), INPUT));
    const docs = unwrap(await uploadDocuments(deps, ctx(), d.id, [{ name: "bo-chung-tu.zip", mime: "application/zip", bytes: InMemoryStorage.fakeZip(["INV.pdf", "PL.pdf"]) }]));
    expect(docs.map((x) => x.fileName)).toEqual(["INV.pdf", "PL.pdf"]);
  });
  it("org B không upload vào hồ sơ của A", async () => {
    const d = unwrap(await createDossier(deps, ctx(), INPUT));
    expect((await uploadDocuments(deps, ctx("OWNER", "org_b", "usr_b"), d.id, [pdf("x.pdf")])).ok).toBe(false);
  });
});

describe("changeDocumentKind / delete / retry", () => {
  it("đổi loại → kind_source USER, QUEUED, job mới có hậu tố loại; xóa → mất storage + job MERGE_ONLY; retry chỉ khi ERROR", async () => {
    const d = unwrap(await createDossier(deps, ctx(), INPUT));
    const [doc] = unwrap(await uploadDocuments(deps, ctx(), d.id, [pdf("scan.pdf")]));
    queue.jobs.length = 0;
    const changed = unwrap(await changeDocumentKind(deps, ctx(), doc!.id, "CERT_OF_ORIGIN"));
    expect(changed.kind).toBe("CERT_OF_ORIGIN");
    expect(uow.data.documents[0]?.kindSource).toBe("USER");
    expect(queue.jobs[0]?.jobId).toContain("CERT_OF_ORIGIN");
    const r = await retryDocument(deps, ctx(), doc!.id);
    if (!r.ok) expect(r.error.code).toBe("INVALID_STATE");
    else throw new Error("phải lỗi");
    uow.data.documents[0]!.status = "ERROR";
    unwrap(await retryDocument(deps, ctx(), doc!.id));
    expect(uow.data.documents[0]?.status).toBe("QUEUED");
    unwrap(await deleteDocument(deps, ctx(), doc!.id));
    expect(storage.keys()).toEqual([]);
    expect(queue.jobs.at(-1)?.payload).toMatchObject({ mode: "MERGE_ONLY" });
    expect(unwrap(await listDocuments(deps, ctx(), d.id))).toEqual([]);
  });
});
