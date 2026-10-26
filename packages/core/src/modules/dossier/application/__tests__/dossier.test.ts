import { beforeEach, describe, expect, it } from "vitest";
import type { CustomsStage } from "@kb/contracts";
import { fixedClock } from "../../../../shared/clock.js";
import type { Ctx } from "../../../../shared/ctx.js";
import { asOrgId, asUserId, sequentialIdGen } from "../../../../shared/ids.js";
import { InMemoryJobQueue } from "../../../../shared/queue.js";
import { errCode, unwrap } from "../../../../shared/result.js";
import { cancelDossier } from "../cancel-dossier.js";
import { changeDocumentKind } from "../change-document-kind.js";
import { createDossier } from "../create-dossier.js";
import { deleteDossier } from "../delete-dossier.js";
import { deleteDocument } from "../delete-document.js";
import { getDossier } from "../get-dossier.js";
import { listDocuments } from "../list-documents.js";
import { listDossiers, listDossiersPage } from "../list-dossiers.js";
import type { DossierDeps } from "../ports.js";
import { requeueStuckDocuments } from "../requeue-stuck-documents.js";
import { listOpenDocuments, rereadDocuments } from "../reread-documents.js";
import { retryDocument } from "../retry-document.js";
import { FakePdfInspector, FakeUnzipper, InMemoryStorage, RecordingPublisher } from "../test/fakes.js";
import { InMemoryDossierUow } from "../test/in-memory-uow.js";
import { updateDossier } from "../update-dossier.js";
import { uploadDocuments } from "../upload-documents.js";

const ctx = (role: Ctx["role"] = "DECLARANT", orgId = "org_a", userId = "usr_a"): Ctx => ({ orgId: asOrgId(orgId), userId: asUserId(userId), role });
const INPUT = { direction: "NK" as const, typeCode: "A11", partner: "HANSOL", customsOffice: "03CE – Chi cục HQ CK cảng Hải Phòng KV III", skillSetId: "default", dueDate: "2026-10-20", incoterm: "FCA", transportMode: "SEA_CONTAINER" as const, partyClass: "4" as const };
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
  it("lọc theo direction/status; tìm q theo mã / đối tác / số vận đơn không phân biệt hoa thường", async () => {
    unwrap(await createDossier(deps, ctx(), INPUT));
    unwrap(await createDossier(deps, ctx(), { ...INPUT, direction: "XK", partner: "SAMSUNG" }));
    expect(unwrap(await listDossiers(deps, ctx(), { direction: "XK" }))).toHaveLength(1);
    expect(unwrap(await listDossiers(deps, ctx(), { status: "CLEARED" }))).toHaveLength(0);
    expect(unwrap(await listDossiers(deps, ctx(), { q: "samsung" })).map((d) => d.partner)).toEqual(["SAMSUNG"]);
    expect(unwrap(await listDossiers(deps, ctx(), { q: "hs-xk" }))).toHaveLength(1);
    expect(unwrap(await listDossiers(deps, ctx(), { q: "khong-co" }))).toEqual([]);
  });
  it("listDossiersPage: đúng trang + tổng khớp bộ lọc; org khác tổng 0", async () => {
    for (let i = 0; i < 5; i++) unwrap(await createDossier(deps, ctx(), INPUT));
    const p1 = unwrap(await listDossiersPage(deps, ctx(), {}, { limit: 2, offset: 0 }));
    const p3 = unwrap(await listDossiersPage(deps, ctx(), {}, { limit: 2, offset: 4 }));
    expect(p1).toMatchObject({ total: 5, limit: 2, offset: 0 });
    expect(p1.items).toHaveLength(2);
    expect(p3.items).toHaveLength(1);
    expect(new Set([...p1.items, ...p3.items].map((d) => d.id)).size).toBe(3);
    expect(unwrap(await listDossiersPage(deps, ctx("OWNER", "org_b", "usr_b"), {}, { limit: 2, offset: 0 }))).toEqual({ items: [], total: 0, limit: 2, offset: 0 });
  });
});

describe("tóm tắt Hải quan theo tờ khai nhánh (Thông quan k/N)", () => {
  it("list / page / get điền customs từ cổng (một lần gọi cho cả trang, đúng org); hồ sơ chưa truyền vắng; không nối cổng → vắng", async () => {
    const a = unwrap(await createDossier(deps, ctx(), INPUT));
    const b = unwrap(await createDossier(deps, ctx(), INPUT));
    const calls: { orgId: string; ids: string[] }[] = [];
    const summary = { of: 3, cleared: 1, problems: [{ no: 2, kind: "REJECTED" as const }] };
    deps.customs = { summaries: async (c, ids) => { calls.push({ orgId: c.orgId, ids }); return new Map(ids.filter((id) => id === a.id).map((id) => [id, summary])); } };
    const list = unwrap(await listDossiers(deps, ctx(), {}));
    expect(list.find((d) => d.id === a.id)?.customs).toEqual(summary);
    expect(list.find((d) => d.id === b.id)).not.toHaveProperty("customs");
    expect(calls).toEqual([{ orgId: "org_a", ids: list.map((d) => d.id) }]);
    expect(unwrap(await listDossiersPage(deps, ctx(), {}, { limit: 10, offset: 0 })).items.find((d) => d.id === a.id)?.customs).toEqual(summary);
    expect(unwrap(await getDossier(deps, ctx(), a.id)).customs).toEqual(summary);
    calls.length = 0;
    expect(unwrap(await listDossiers(deps, ctx("OWNER", "org_b", "usr_b"), {}))).toEqual([]);
    expect(calls).toEqual([]);
    delete deps.customs;
    expect(unwrap(await getDossier(deps, ctx(), a.id))).not.toHaveProperty("customs");
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
  it("không tin Content-Type trình duyệt: nội dung không phải PDF/ảnh → FILE_INVALID; mime và đuôi lưu trữ lấy theo byte đầu", async () => {
    const d = unwrap(await createDossier(deps, ctx(), INPUT));
    const exe = await uploadDocuments(deps, ctx(), d.id, [{ name: "virus.pdf", mime: "application/pdf", bytes: Buffer.from("MZ\u0090\u0000\u0003 not a pdf at all") }]);
    expect(errCode(exe)).toBe("FILE_INVALID");
    expect(uow.data.documents).toHaveLength(0);
    // Khai là ảnh, tên có "../" nhưng nội dung là PDF → lưu như PDF, key không chứa phần tên người dùng gửi.
    unwrap(await uploadDocuments(deps, ctx(), d.id, [{ name: "../../x.png", mime: "image/png", bytes: Buffer.from("%PDF-fake-inv-1") }]));
    expect(uow.data.documents[0]!.mime).toBe("application/pdf");
    expect(uow.data.documents[0]!.storageKey).toMatch(/\/[0-9a-f]{64}\.pdf$/);
    expect(uow.data.documents[0]!.storageKey).not.toContain("..");
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

describe("đọc lại chứng từ bằng cấu hình skill mới", () => {
  it("chỉ hồ sơ còn ở bước tải lên/kiểm tra: liệt kê chứng từ đã đọc, đọc lại → QUEUED + job FULL; hồ sơ đã qua bước kiểm tra giữ nguyên", async () => {
    const d = unwrap(await createDossier(deps, ctx(), INPUT));
    const past = unwrap(await createDossier(deps, ctx(), INPUT));
    unwrap(await uploadDocuments(deps, ctx(), d.id, [pdf("a.pdf")]));
    unwrap(await uploadDocuments(deps, ctx(), past.id, [pdf("b.pdf")]));
    for (const doc of uow.data.documents) doc.status = "DONE";
    const dd = uow.data.dossiers.find((x) => x.id === d.id)!;
    dd.step = "ocr";
    dd.status = "NEEDS_REVIEW";
    const pd = uow.data.dossiers.find((x) => x.id === past.id)!;
    pd.step = "agent";
    pd.status = "NEEDS_REVIEW";
    queue.jobs.length = 0;
    const open = await listOpenDocuments(deps, "org_a");
    expect(open).toEqual([expect.objectContaining({ dossierId: d.id, dossierCode: d.code, fileName: "a.pdf" })]);
    expect(await listOpenDocuments(deps, "org_b")).toEqual([]);
    const all = uow.data.documents.map((x) => x.id);
    expect(unwrap(await rereadDocuments(deps, ctx(), all))).toBe(1);
    expect(uow.data.documents.find((x) => x.dossierId === d.id)?.status).toBe("QUEUED");
    expect(uow.data.documents.find((x) => x.dossierId === past.id)?.status).toBe("DONE");
    expect(dd.status).toBe("PROCESSING");
    expect(queue.jobs).toEqual([expect.objectContaining({ name: "extract-document", payload: expect.objectContaining({ mode: "FULL" }) })]);
    expect(unwrap(await rereadDocuments(deps, ctx("DECLARANT", "org_b"), all))).toBe(0);
    expect((await rereadDocuments(deps, ctx("VIEWER"), all)).ok).toBe(false);
  });
});

describe("bộ chứng từ khi lô nhiều tờ chỉ gọi về một phần (port customsSheets)", () => {
  it("tải lên / đổi loại / đọc lại / xóa chứng từ (đổi dòng hàng và chỉ tiêu chung) → COMMON_LOCKED_SHEETS; gọi về hết → như cũ", async () => {
    const d = unwrap(await createDossier(deps, ctx(), INPUT));
    const [doc] = unwrap(await uploadDocuments(deps, ctx(), d.id, [pdf("scan.pdf")]));
    uow.data.documents[0]!.status = "ERROR";
    let stages: CustomsStage[] = ["PRE_DECLARED", "RECALLED", "PRE_DECLARED"];
    deps.customsSheets = async () => stages.map((stage, i) => ({ no: i + 1, stage, declarationNo: `10400000000${i + 1}` }));
    const locked = { ok: false, error: { code: "INVALID_STATE", reason: "COMMON_LOCKED_SHEETS", params: { sheets: "1, 3" } } };
    expect(await uploadDocuments(deps, ctx(), d.id, [pdf("more.pdf")])).toMatchObject(locked);
    expect(await changeDocumentKind(deps, ctx(), doc!.id, "CERT_OF_ORIGIN")).toMatchObject(locked);
    expect(await retryDocument(deps, ctx(), doc!.id)).toMatchObject(locked);
    expect(await deleteDocument(deps, ctx(), doc!.id)).toMatchObject(locked);
    expect(uow.data.documents).toHaveLength(1);
    stages = ["RECALLED", "RECALLED", "RECALLED"];
    unwrap(await retryDocument(deps, ctx(), doc!.id));
    unwrap(await changeDocumentKind(deps, ctx(), doc!.id, "CERT_OF_ORIGIN"));
    unwrap(await uploadDocuments(deps, ctx(), d.id, [pdf("more.pdf")]));
    unwrap(await deleteDocument(deps, ctx(), doc!.id));
  });
  it("hồ sơ đã truyền / đã hủy (tờ chưa từng gọi về) → lỗi cũ của hồ sơ (DOSSIER_LOCKED / Hồ sơ đã hủy), không phải lý do phạm vi sửa; đã duyệt còn tờ hiệu lực → COMMON_LOCKED_SHEETS", async () => {
    const d = unwrap(await createDossier(deps, ctx(), INPUT));
    const [doc] = unwrap(await uploadDocuments(deps, ctx(), d.id, [pdf("scan.pdf")]));
    uow.data.documents[0]!.status = "ERROR";
    deps.customsSheets = async () => [1, 2, 3].map((no) => ({ no, stage: "PRE_DECLARED" as const, declarationNo: `10400000000${no}` }));
    uow.data.dossiers[0]!.status = "SUBMITTED";
    const locked = { ok: false, error: { code: "DOSSIER_LOCKED", message: "Hồ sơ đã truyền, không sửa được" } };
    expect(await uploadDocuments(deps, ctx(), d.id, [pdf("more.pdf")])).toMatchObject(locked);
    expect(await changeDocumentKind(deps, ctx(), doc!.id, "CERT_OF_ORIGIN")).toMatchObject(locked);
    expect(await deleteDocument(deps, ctx(), doc!.id)).toMatchObject(locked);
    // Đọc lại chứng từ lỗi vốn không kiểm khóa hồ sơ – giữ nguyên hành vi cũ (không thành lý do phạm vi sửa).
    unwrap(await retryDocument(deps, ctx(), doc!.id));
    uow.data.dossiers[0]!.status = "CANCELLED";
    const cancelled = { ok: false, error: { code: "INVALID_STATE", message: "Hồ sơ đã hủy" } };
    expect(await uploadDocuments(deps, ctx(), d.id, [pdf("more.pdf")])).toMatchObject(cancelled);
    expect(await deleteDocument(deps, ctx(), doc!.id)).toMatchObject(cancelled);
    expect(await changeDocumentKind(deps, ctx(), doc!.id, "CERT_OF_ORIGIN")).toMatchObject(cancelled);
    uow.data.dossiers[0]!.status = "APPROVED";
    expect(await uploadDocuments(deps, ctx(), d.id, [pdf("more.pdf")])).toMatchObject({ ok: false, error: { reason: "COMMON_LOCKED_SHEETS", params: { sheets: "1, 2, 3" } } });
  });
});

describe("requeueStuckDocuments – job quét chứng từ kẹt QUEUED", () => {
  it("QUEUED quá 10 phút → đẩy lại job (jobId theo mốc kẹt), làm mới mốc; QUEUED mới / đang đọc / org khác không đụng", async () => {
    const d = unwrap(await createDossier(deps, ctx(), INPUT));
    unwrap(await uploadDocuments(deps, ctx(), d.id, [pdf("a.pdf"), pdf("b.pdf")]));
    queue.jobs.length = 0;
    const [a, b] = uow.data.documents;
    const old = new Date(deps.clock.now().getTime() - 15 * 60_000);
    a!.updatedAt = old;
    b!.updatedAt = old;
    b!.status = "READING";
    const r = await requeueStuckDocuments(deps, { orgId: "org_a" });
    expect(r.requeued).toEqual([a!.id]);
    expect(queue.jobs).toEqual([expect.objectContaining({ name: "extract-document", jobId: `extract:${a!.id}:${a!.sha256}:sweep:${old.getTime()}`, payload: expect.objectContaining({ documentId: a!.id, mode: "FULL" }) })]);
    // Quét lại ngay → mốc đã làm mới, chưa tới hạn → không đẩy trùng.
    expect((await requeueStuckDocuments(deps, { orgId: "org_a" })).requeued).toEqual([]);
    expect((await requeueStuckDocuments(deps, { orgId: "org_b" })).requeued).toEqual([]);
  });
});

describe("deleteDossier", () => {
  it("xóa hẳn hồ sơ chưa truyền: chứng từ, file, tiến trình; báo onDeleted; chỉ người duyệt / quản trị; org khác không thấy", async () => {
    const released: string[] = [];
    deps.onDeleted = async (_c, id) => void released.push(id);
    const d = unwrap(await createDossier(deps, ctx(), INPUT));
    const keep = unwrap(await createDossier(deps, ctx(), INPUT));
    unwrap(await uploadDocuments(deps, ctx(), d.id, [pdf("a.pdf"), pdf("b.pdf")]));
    unwrap(await uploadDocuments(deps, ctx(), keep.id, [pdf("c.pdf")]));
    const keys = uow.data.documents.filter((x) => x.dossierId === d.id).map((x) => x.storageKey);
    await uow.asOrg(ctx(), (r) => r.progress.upsert({ id: "p1", orgId: "org_a", dossierId: d.id, jobKind: "extract", jobId: "j1", status: "DONE", progress: 100, message: "", updatedAt: new Date() }));
    expect(errCode(await deleteDossier(deps, ctx("DECLARANT"), d.id))).toBe("FORBIDDEN");
    expect(errCode(await deleteDossier(deps, ctx("ADMIN", "org_b"), d.id))).toBe("NOT_FOUND");
    expect(unwrap(await deleteDossier(deps, ctx("APPROVER"), d.id))).toEqual({ id: d.id, code: d.code });
    expect(uow.data.dossiers.map((x) => x.id)).toEqual([keep.id]);
    expect(uow.data.documents.map((x) => x.dossierId)).toEqual([keep.id]);
    expect(uow.data.progress).toEqual([]);
    for (const k of keys) expect(await storage.exists(k)).toBe(false);
    expect(released).toEqual([d.id]);
  });

  it("hồ sơ đã truyền Hải quan (trạng thái / số tờ khai / có kết quả Hải quan) → DOSSIER_SENT_TO_CUSTOMS, giữ nguyên", async () => {
    const d = unwrap(await createDossier(deps, ctx(), INPUT));
    const row = uow.data.dossiers[0]!;
    const blocked = { ok: false, error: { code: "INVALID_STATE", reason: "DOSSIER_SENT_TO_CUSTOMS" } };
    row.status = "SUBMITTED";
    expect(await deleteDossier(deps, ctx("ADMIN"), d.id)).toMatchObject(blocked);
    row.status = "CANCELLED";
    row.declarationNo = "104000000001";
    expect(await deleteDossier(deps, ctx("ADMIN"), d.id)).toMatchObject(blocked);
    row.declarationNo = null;
    deps.customs = { summaries: async (_c, ids) => new Map(ids.map((id) => [id, { total: 1, cleared: 0 } as never])) };
    expect(await deleteDossier(deps, ctx("ADMIN"), d.id)).toMatchObject(blocked);
    delete deps.customs;
    unwrap(await deleteDossier(deps, ctx("ADMIN"), d.id));
    expect(uow.data.dossiers).toEqual([]);
  });
});
