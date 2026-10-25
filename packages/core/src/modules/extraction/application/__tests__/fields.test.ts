import { beforeEach, describe, expect, it } from "vitest";
import type { CustomsStage } from "@kb/contracts";
import { fixedClock } from "../../../../shared/clock.js";
import type { Ctx } from "../../../../shared/ctx.js";
import { asOrgId, asUserId, sequentialIdGen } from "../../../../shared/ids.js";
import { unwrap } from "../../../../shared/result.js";
import { confirmField } from "../confirm-field.js";
import { finishReading } from "../finish-reading.js";
import { listFields } from "../list-fields.js";
import type { ExtractionDeps } from "../ports.js";
import { processDocument } from "../process-document.js";
import { revertField } from "../revert-field.js";
import { fieldSource, reviewedDocuments } from "../reviewed-documents.js";
import { FakeDocuments, InMemoryExtractionUow, NoSkills, NoValidation, RecordingUsage, ScriptedAi } from "../test/fakes.js";
import { updateFieldValue } from "../update-field-value.js";

const INVOICE = {
  invoiceNo: "HSP-2610-0457", invoiceDate: "2026-10-02",
  seller: { name: "HANSOL", address: null, taxCode: null, country: "KR" }, buyer: { name: "AN PHAT", address: null, taxCode: "031678901", country: "VN" },
  incoterm: "FCA", currency: "USD", totalAmount: 20850, paymentTerms: null, poNo: null, items: [], grossWeightKg: null, packages: null, uncertainties: ["invoiceDate"],
};
const ctx = (role: Ctx["role"] = "DECLARANT", orgId = "org_a", userId = "usr_a"): Ctx => ({ orgId: asOrgId(orgId), userId: asUserId(userId), role });

let uow: InMemoryExtractionUow;
let docs: FakeDocuments;
let validation: NoValidation;
let deps: ExtractionDeps;

beforeEach(async () => {
  uow = new InMemoryExtractionUow();
  docs = new FakeDocuments();
  validation = new NoValidation();
  deps = { uow, documents: docs, validation, ai: new ScriptedAi({ INVOICE }), usage: new RecordingUsage(), skills: new NoSkills(), clock: fixedClock("2026-10-14T03:00:00.000Z"), idGen: sequentialIdGen() };
  docs.docs.push({ id: "doc_inv", orgId: "org_a", dossierId: "dos_1", kind: "INVOICE", kindSource: "USER", fileName: "inv.pdf", mime: "application/pdf", pages: 1, status: "QUEUED", storageKey: "k", sha256: "s" });
  docs.files.set("k", Buffer.from("%PDF"));
  unwrap(await processDocument(deps, { orgId: "org_a", dossierId: "dos_1", documentId: "doc_inv", mode: "FULL" }));
});

describe("trường trích xuất", () => {
  it("listFields trả DTO với id/documentId/group/key/value/status; org khác → []", async () => {
    const list = unwrap(await listFields(deps, ctx(), "dos_1"));
    expect(list.find((f) => f.key === "invoice_date")).toMatchObject({ documentId: "doc_inv", group: "GENERAL", value: "2026-10-02", originalValue: "2026-10-02", status: "MODEL_UNSURE" });
    expect(unwrap(await listFields(deps, ctx("OWNER", "org_b", "usr_b"), "dos_1"))).toEqual([]);
  });
  it("updateFieldValue: USER_CONFIRMED, giữ originalValue, ghi audit USER_EDIT, cập nhật shipment, chạy lại luật, cập nhật suspect", async () => {
    const f = unwrap(await listFields(deps, ctx(), "dos_1")).find((x) => x.key === "buyer_tax_code")!;
    expect(f.status).toBe("INVALID_FORMAT");
    const runs = validation.runs.length;
    const u = unwrap(await updateFieldValue(deps, ctx(), f.id, " 0316789012 "));
    expect(u).toMatchObject({ value: "0316789012", originalValue: "031678901", status: "USER_CONFIRMED" });
    expect(uow.data.audit.at(-1)).toMatchObject({ key: "buyer_tax_code", oldValue: "031678901", newValue: "0316789012", userId: "usr_a", source: "USER_EDIT" });
    expect(uow.data.shipments.at(-1)?.data.parties.buyer.taxCode).toMatchObject({ value: "0316789012", status: "USER_CONFIRMED" });
    expect(validation.runs.length).toBe(runs + 1);
    expect(docs.dossierUpdates.at(-1)).toMatchObject({ suspectFields: 1 }); // còn invoice_date MODEL_UNSURE
  });
  it("confirmField → USER_CONFIRMED + audit USER_CONFIRM; revertField → về giá trị gốc, MODEL_UNSURE, audit USER_REVERT", async () => {
    const f = unwrap(await listFields(deps, ctx(), "dos_1")).find((x) => x.key === "invoice_date")!;
    expect(unwrap(await confirmField(deps, ctx(), f.id)).status).toBe("USER_CONFIRMED");
    expect(uow.data.audit.at(-1)?.source).toBe("USER_CONFIRM");
    unwrap(await updateFieldValue(deps, ctx(), f.id, "2026-10-03"));
    const r = unwrap(await revertField(deps, ctx(), f.id));
    expect(r).toMatchObject({ value: "2026-10-02", status: "MODEL_UNSURE" });
    expect(uow.data.audit.at(-1)?.source).toBe("USER_REVERT");
  });
  it("sửa trường số/ngày được chuẩn hóa theo spec; giá trị không hợp lệ → VALIDATION (luật BLOCKER không bị SKIPPED vì dữ liệu rác)", async () => {
    const total = unwrap(await listFields(deps, ctx(), "dos_1")).find((x) => x.key === "total_amount")!;
    expect(unwrap(await updateFieldValue(deps, ctx(), total.id, "20,850.00")).value).toMatch(/^20850(\.00)?$/);
    const r = await updateFieldValue(deps, ctx(), total.id, "abc");
    expect(r.ok ? "ok" : r.error.code).toBe("VALIDATION");
    const date = unwrap(await listFields(deps, ctx(), "dos_1")).find((x) => x.key === "invoice_date")!;
    expect(unwrap(await updateFieldValue(deps, ctx(), date.id, "03/10/2026")).value).toBe("2026-10-03");
    const cur = unwrap(await listFields(deps, ctx(), "dos_1")).find((x) => x.key === "currency")!;
    expect(unwrap(await updateFieldValue(deps, ctx(), cur.id, "usd")).value).toBe("USD");
  });
  it("hồ sơ đã duyệt/truyền: không sửa trường, không xác nhận dữ liệu lại → DOSSIER_LOCKED", async () => {
    const f = unwrap(await listFields(deps, ctx(), "dos_1"))[0]!;
    for (const st of ["APPROVED", "SUBMITTED", "CLEARED", "CANCELLED"] as const) {
      docs.dossierStatusValue = st;
      const r = await updateFieldValue(deps, ctx(), f.id, "x");
      expect(r.ok ? "ok" : r.error.code).toBe("DOSSIER_LOCKED");
      const c = await confirmField(deps, ctx(), f.id);
      expect(c.ok ? "ok" : c.error.code).toBe("DOSSIER_LOCKED");
      const fin = await finishReading(deps, ctx(), "dos_1");
      expect(fin.ok ? "ok" : fin.error.code).toBe("DOSSIER_LOCKED");
    }
    docs.dossierStatusValue = "PROCESSING";
  });
  it("VIEWER không sửa; org khác → NOT_FOUND", async () => {
    const f = unwrap(await listFields(deps, ctx(), "dos_1"))[0]!;
    expect((await updateFieldValue(deps, ctx("VIEWER"), f.id, "x")).ok).toBe(false);
    const r = await updateFieldValue(deps, ctx("OWNER", "org_b", "usr_b"), f.id, "x");
    if (!r.ok) expect(r.error.code).toBe("NOT_FOUND");
    else throw new Error("phải lỗi");
  });
  it("finishReading: còn chứng từ đang đọc → NOT_READY; xong → cập nhật hồ sơ với số trường nghi ngờ", async () => {
    docs.docs.push({ id: "doc_2", orgId: "org_a", dossierId: "dos_1", kind: "OTHER", kindSource: "FILENAME", fileName: "x.pdf", mime: "application/pdf", pages: 1, status: "READING", storageKey: "k2", sha256: "s2" });
    const r = await finishReading(deps, ctx(), "dos_1");
    if (!r.ok) expect(r.error.code).toBe("NOT_READY");
    else throw new Error("phải lỗi");
    docs.docs[1]!.status = "ERROR";
    unwrap(await finishReading(deps, ctx(), "dos_1"));
    expect(docs.dossierUpdates.at(-1)).toMatchObject({ finished: true, suspectFields: 2 });
  });
});

describe("tự học từ bước kiểm tra", () => {
  it("reviewedDocuments: bản đọc đã ghi đè giá trị người dùng sửa + danh sách sửa + nhà cung cấp; org khác không thấy", async () => {
    const no = unwrap(await listFields(deps, ctx(), "dos_1")).find((x) => x.key === "invoice_no")!;
    unwrap(await updateFieldValue(deps, ctx(), no.id, "HSP-2610-0458"));
    const [d] = unwrap(await reviewedDocuments(deps, ctx(), "dos_1"));
    expect(d).toMatchObject({ documentId: "doc_inv", kind: "INVOICE", storageKey: "k", supplier: "HANSOL", corrections: [{ key: "invoice_no", rawPath: "invoiceNo", from: "HSP-2610-0457", to: "HSP-2610-0458" }] });
    expect(d!.data["invoiceNo"]).toBe("HSP-2610-0458");
    expect(d!.data["totalAmount"]).toBe(20850);
    const src = unwrap(await fieldSource(deps, ctx(), no.id));
    expect(src).toEqual({ documentId: "doc_inv", kind: "INVOICE", rawPath: "invoiceNo", supplier: "HANSOL" });
    expect(unwrap(await reviewedDocuments(deps, ctx("DECLARANT", "org_b"), "dos_1"))).toEqual([]);
    expect((await fieldSource(deps, ctx("DECLARANT", "org_b"), no.id)).ok).toBe(false);
  });

  it("đọc lại không phân loại lại → nhà cung cấp lấy từ lần đọc trước để chọn skill riêng", async () => {
    const hints: (string | null)[] = [];
    deps.skills = { resolve: async (_o, _k, hint) => (hints.push(hint), { skillVersionId: "skv_2", fieldHints: [], examples: [], customFields: [] }) };
    unwrap(await processDocument(deps, { orgId: "org_a", dossierId: "dos_1", documentId: "doc_inv", mode: "FULL" }));
    expect(hints).toEqual(["HANSOL"]);
  });
});

describe("phạm vi sửa theo tờ đã gọi về (lô nhiều tờ – port customsSheets)", () => {
  const ITEMS = Array.from({ length: 120 }, (_, i) => ({ lineNo: i + 1, description: `Item ${i + 1}`, hsCodeOnInvoice: null, quantity: 1, unit: "PCE", unitPrice: 10, amount: 10, origin: "KR" }));
  let stages: CustomsStage[];
  beforeEach(async () => {
    uow = new InMemoryExtractionUow();
    docs = new FakeDocuments();
    stages = ["PRE_DECLARED", "RECALLED", "PRE_DECLARED"];
    deps = {
      uow, documents: docs, validation: new NoValidation(), ai: new ScriptedAi({ INVOICE: { ...INVOICE, items: ITEMS } }), usage: new RecordingUsage(), skills: new NoSkills(),
      clock: fixedClock("2026-10-14T03:00:00.000Z"), idGen: sequentialIdGen(),
      customsSheets: async () => stages.map((stage, i) => ({ no: i + 1, stage, declarationNo: `10400000000${i + 1}` })),
    };
    docs.docs.push({ id: "doc_inv", orgId: "org_a", dossierId: "dos_1", kind: "INVOICE", kindSource: "USER", fileName: "inv.pdf", mime: "application/pdf", pages: 1, status: "QUEUED", storageKey: "k", sha256: "s" });
    docs.files.set("k", Buffer.from("%PDF"));
    unwrap(await processDocument(deps, { orgId: "org_a", dossierId: "dos_1", documentId: "doc_inv", mode: "FULL" }));
  });
  const field = async (key: string) => unwrap(await listFields(deps, ctx(), "dos_1")).find((x) => x.key === key)!;

  it("chỉ tờ 2 gọi về: trường header → COMMON_LOCKED_SHEETS; ô dòng 60 (tờ 2) sửa được; dòng 10 (tờ 1) → LINE_SHEET_LOCKED; xác nhận dữ liệu → khóa", async () => {
    const common = { ok: false, error: { code: "INVALID_STATE", reason: "COMMON_LOCKED_SHEETS", params: { sheets: "1, 3" } } };
    const date = await field("invoice_date");
    expect(await updateFieldValue(deps, ctx(), date.id, "2026-10-03")).toMatchObject(common);
    expect(await confirmField(deps, ctx(), date.id)).toMatchObject(common);
    expect(await revertField(deps, ctx(), date.id)).toMatchObject(common);
    expect(unwrap(await updateFieldValue(deps, ctx(), (await field("item.60.description")).id, "Item 60 sửa")).value).toBe("Item 60 sửa");
    expect(await updateFieldValue(deps, ctx(), (await field("item.10.description")).id, "x")).toMatchObject({ ok: false, error: { code: "INVALID_STATE", reason: "LINE_SHEET_LOCKED", params: { sheet: 1 } } });
    expect(await finishReading(deps, ctx(), "dos_1")).toMatchObject(common);
  });

  it("gọi về tất cả → sửa như cũ", async () => {
    stages = ["RECALLED", "RECALLED", "RECALLED"];
    unwrap(await updateFieldValue(deps, ctx(), (await field("invoice_date")).id, "2026-10-03"));
    unwrap(await updateFieldValue(deps, ctx(), (await field("item.10.description")).id, "x"));
    unwrap(await finishReading(deps, ctx(), "dos_1"));
  });
});
