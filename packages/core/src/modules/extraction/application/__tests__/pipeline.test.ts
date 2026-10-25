import { beforeEach, describe, expect, it } from "vitest";
import { fixedClock } from "../../../../shared/clock.js";
import { sequentialIdGen } from "../../../../shared/ids.js";
import { RecordingNotifier } from "../../../../shared/notifier.js";
import { unwrap } from "../../../../shared/result.js";
import { AiDataError, PROMPT_VERSION, type ExtractionDeps } from "../ports.js";
import { processDocument } from "../process-document.js";
import { FakeDocuments, FixedSkills, InMemoryExtractionUow, NoSkills, NoValidation, RecordingUsage, ScriptedAi } from "../test/fakes.js";

const INVOICE = {
  invoiceNo: "HSP-2610-0457", invoiceDate: "2026-10-02",
  seller: { name: "HANSOL PRECISION CO., LTD.", address: "Changwon, Korea", taxCode: null, country: "KR" },
  buyer: { name: "AN PHAT INDUSTRIAL EQUIPMENT CO., LTD", address: "Hai Phong", taxCode: "0316789012", country: "VN" },
  incoterm: "FCA", currency: "USD", totalAmount: 20850, paymentTerms: "T/T", poNo: null,
  items: [{ lineNo: 1, description: "Vòng bi cầu 6205-2RS", hsCodeOnInvoice: null, quantity: 2000, unit: "PCS", unitPrice: 1.85, amount: 3700, origin: "KR" }],
  grossWeightKg: 3860.5, packages: 48, uncertainties: [],
};
const PACKING = { invoiceNo: "HSP-2610-0457", date: "2026-10-02", packages: 48, packageUnit: "PALLET", grossWeightKg: 3842, netWeightKg: 3600, volumeCbm: null, marks: null, items: [], uncertainties: [] };

let uow: InMemoryExtractionUow;
let docs: FakeDocuments;
let ai: ScriptedAi;
let usage: RecordingUsage;
let validation: NoValidation;
let deps: ExtractionDeps;
const ORG = "org_a";
const addDoc = (id: string, kind: "INVOICE" | "PACKING_LIST" | "OTHER", kindSource: "AI" | "USER" | "FILENAME" = "FILENAME") => {
  docs.docs.push({ id, orgId: ORG, dossierId: "dos_1", kind, kindSource, fileName: `${id}.pdf`, mime: "application/pdf", pages: 1, status: "QUEUED", storageKey: `k/${id}`, sha256: `sha_${id}` });
  docs.files.set(`k/${id}`, Buffer.from("%PDF-fake"));
};

beforeEach(() => {
  uow = new InMemoryExtractionUow();
  docs = new FakeDocuments();
  ai = new ScriptedAi({ INVOICE, PACKING_LIST: PACKING }, { documents: [{ kind: "INVOICE", pages: [1], isDuplicateCopy: false, supplierHint: "HANSOL" }] }, { invoiceNo: { page: 1, x: 10, y: 10, w: 30, h: 3 } });
  usage = new RecordingUsage();
  validation = new NoValidation();
  deps = { uow, documents: docs, validation, ai, usage, skills: new NoSkills(), clock: fixedClock("2026-10-14T03:00:00.000Z"), idGen: sequentialIdGen() };
});

describe("processDocument", () => {
  it("FULL: phân loại (AI quyết định loại) → trích xuất → extraction + usage → shipment v1 → trường → luật → chứng từ DONE, hồ sơ cập nhật", async () => {
    addDoc("doc_inv", "OTHER");
    unwrap(await processDocument(deps, { orgId: ORG, dossierId: "dos_1", documentId: "doc_inv", mode: "FULL" }));
    expect(ai.calls).toEqual({ classify: 1, extract: 1 });
    expect(docs.docs[0]).toMatchObject({ status: "DONE", kind: "INVOICE", kindSource: "AI" });
    expect(uow.data.extractions).toHaveLength(1);
    expect(uow.data.extractions[0]).toMatchObject({ kind: "INVOICE", status: "DONE", promptVersion: PROMPT_VERSION, usageEventId: "use_2" });
    expect(usage.events).toHaveLength(2); // classify + extract
    expect(uow.data.shipments[0]?.version).toBe(1);
    expect(uow.data.shipments[0]?.data.invoice.no.value).toBe("HSP-2610-0457");
    expect(uow.data.fields.some((f) => f.key === "invoice_no" && f.documentId === "doc_inv" && f.region?.x === 10)).toBe(true);
    expect(validation.runs).toHaveLength(1);
    expect(docs.dossierUpdates.at(-1)).toMatchObject({ dossierId: "dos_1", allDone: true, invoiceValue: "20850", currency: "USD" });
    expect(docs.events.map((e) => e.type)).toContain("document.status");
    expect(docs.events.map((e) => e.type)).toContain("fields.updated");
  });
  it("skill có trường bổ sung → schema gửi AI có custom; kết quả vào shipment.custom; AI trả custom sai kiểu → chứng từ ERROR, không hỏng trường chuẩn đã có", async () => {
    deps = { ...deps, skills: new FixedSkills([{ key: "lc_no", label: "Số L/C", aliases: ["L/C No"], type: "text" }]) };
    addDoc("doc_inv", "INVOICE", "USER");
    ai = new ScriptedAi({ INVOICE: { ...INVOICE, custom: { lc_no: "LC-2026-01" } } });
    deps = { ...deps, ai };
    unwrap(await processDocument(deps, { orgId: ORG, dossierId: "dos_1", documentId: "doc_inv", mode: "FULL" }));
    const shape = (ai.lastSchema as unknown as { shape: Record<string, unknown> }).shape;
    expect(Object.keys(shape)).toContain("custom");
    expect(uow.data.shipments.at(-1)?.data.custom["INVOICE"]?.["lc_no"]?.value).toBe("LC-2026-01");

    addDoc("doc_bad", "INVOICE", "USER");
    deps = { ...deps, ai: new ScriptedAi({ INVOICE: { ...INVOICE, custom: { lc_no: 123 } } }) };
    unwrap(await processDocument(deps, { orgId: ORG, dossierId: "dos_1", documentId: "doc_bad", mode: "FULL" }));
    expect(docs.docs.find((d) => d.id === "doc_bad")).toMatchObject({ status: "ERROR" });
    expect(docs.docs.find((d) => d.id === "doc_inv")).toMatchObject({ status: "DONE" });
  });
  it("kind do người dùng đặt hoặc AI đã phân loại → không gọi phân loại", async () => {
    addDoc("doc_inv", "INVOICE", "USER");
    addDoc("doc_ai", "INVOICE", "AI");
    unwrap(await processDocument(deps, { orgId: ORG, dossierId: "dos_1", documentId: "doc_inv", mode: "FULL" }));
    unwrap(await processDocument(deps, { orgId: ORG, dossierId: "dos_1", documentId: "doc_ai", mode: "FULL" }));
    expect(ai.calls.classify).toBe(0);
    expect(ai.calls.extract).toBe(2);
  });
  it("chạy lại cùng job → không gọi AI lần nữa, không trùng extraction, shipment version tăng, trường không nhân đôi; thông báo 'đọc xong' chỉ một lần", async () => {
    const notifier = new RecordingNotifier();
    deps.notify = notifier;
    addDoc("doc_inv", "INVOICE", "USER");
    unwrap(await processDocument(deps, { orgId: ORG, dossierId: "dos_1", documentId: "doc_inv", mode: "FULL" }));
    unwrap(await processDocument(deps, { orgId: ORG, dossierId: "dos_1", documentId: "doc_inv", mode: "FULL" }));
    unwrap(await processDocument(deps, { orgId: ORG, dossierId: "dos_1", documentId: "doc_inv", mode: "MERGE_ONLY" }));
    expect(notifier.sent.filter((n) => n.draft.title === "Đã đọc xong bộ chứng từ")).toHaveLength(1);
    expect(ai.calls.extract).toBe(1);
    expect(uow.data.extractions).toHaveLength(1);
    // Mỗi lần gộp (kể cả MERGE_ONLY) là một phiên bản lô hàng mới.
    expect(uow.data.shipments.map((s) => s.version)).toEqual([1, 2, 3]);
    expect(uow.data.fields.filter((f) => f.key === "invoice_no")).toHaveLength(1);
  });
  it("hai chứng từ: trọng lượng lệch → CONFLICT; trường USER_CONFIRMED được giữ khi gộp lại", async () => {
    addDoc("doc_inv", "INVOICE", "USER");
    addDoc("doc_pl", "PACKING_LIST", "USER");
    unwrap(await processDocument(deps, { orgId: ORG, dossierId: "dos_1", documentId: "doc_inv", mode: "FULL" }));
    expect(docs.dossierUpdates.at(-1)).toMatchObject({ allDone: false });
    // người dùng xác nhận trọng lượng của invoice trước khi PL đọc xong
    const gw = uow.data.fields.find((f) => f.key === "gross_weight" && f.documentId === "doc_inv")!;
    gw.status = "USER_CONFIRMED";
    gw.value = "3860.50";
    unwrap(await processDocument(deps, { orgId: ORG, dossierId: "dos_1", documentId: "doc_pl", mode: "FULL" }));
    const after = uow.data.fields.filter((f) => f.key === "gross_weight");
    expect(after.find((f) => f.documentId === "doc_inv")).toMatchObject({ status: "USER_CONFIRMED", value: "3860.50" });
    expect(after.find((f) => f.documentId === "doc_pl")?.status).toBe("CONFLICT");
    expect(docs.dossierUpdates.at(-1)).toMatchObject({ allDone: true });
    expect((docs.dossierUpdates.at(-1) as { suspectFields: number }).suspectFields).toBeGreaterThan(0);
  });
  it("lỗi dữ liệu (AiDataError) → chứng từ ERROR kèm lý do, không ném; lỗi tạm (429) → ném để retry, chứng từ vẫn READING/QUEUED", async () => {
    addDoc("doc_inv", "INVOICE", "USER");
    ai.failWith = new AiDataError("PDF không có nội dung đọc được");
    unwrap(await processDocument(deps, { orgId: ORG, dossierId: "dos_1", documentId: "doc_inv", mode: "FULL" }));
    expect(docs.docs[0]).toMatchObject({ status: "ERROR", error: "PDF không có nội dung đọc được" });
    addDoc("doc_2", "INVOICE", "USER");
    ai.failWith = new Error("429 rate limited");
    await expect(processDocument(deps, { orgId: ORG, dossierId: "dos_1", documentId: "doc_2", mode: "FULL" })).rejects.toThrow(/429/);
    expect(docs.docs[1]?.status).not.toBe("ERROR");
  });
  it("MERGE_ONLY: không gọi AI, gộp lại từ extraction đã có (sau khi xóa một chứng từ)", async () => {
    addDoc("doc_inv", "INVOICE", "USER");
    addDoc("doc_pl", "PACKING_LIST", "USER");
    unwrap(await processDocument(deps, { orgId: ORG, dossierId: "dos_1", documentId: "doc_inv", mode: "FULL" }));
    unwrap(await processDocument(deps, { orgId: ORG, dossierId: "dos_1", documentId: "doc_pl", mode: "FULL" }));
    docs.docs = docs.docs.filter((d) => d.id !== "doc_pl");
    const calls = ai.calls.extract;
    unwrap(await processDocument(deps, { orgId: ORG, dossierId: "dos_1", documentId: "doc_pl", mode: "MERGE_ONLY" }));
    expect(ai.calls.extract).toBe(calls);
    expect(uow.data.shipments.at(-1)?.data.documents.map((d) => d.id)).toEqual(["doc_inv"]);
    expect(uow.data.fields.every((f) => f.documentId === "doc_inv")).toBe(true);
  });
  it("chứng từ của org khác → NOT_FOUND", async () => {
    addDoc("doc_inv", "INVOICE", "USER");
    const r = await processDocument(deps, { orgId: "org_b", dossierId: "dos_1", documentId: "doc_inv", mode: "FULL" });
    expect(r.ok).toBe(false);
  });
});
