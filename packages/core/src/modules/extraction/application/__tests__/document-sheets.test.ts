import { describe, expect, it } from "vitest";
import { fixedClock } from "../../../../shared/clock.js";
import type { Ctx } from "../../../../shared/ctx.js";
import { asOrgId, asUserId, sequentialIdGen } from "../../../../shared/ids.js";
import { unwrap } from "../../../../shared/result.js";
import { documentSheets } from "../document-sheets.js";
import { processDocument } from "../process-document.js";
import { FakeDocuments, FixedSkills, InMemoryExtractionUow, NoValidation, RecordingUsage, ScriptedAi } from "../test/fakes.js";

const INVOICE = {
  invoiceNo: "CIKA25041701", invoiceDate: "2025-04-17", seller: { name: "SHENZHEN APTUS TECHNOLOGY CO., LTD", address: "SHENZHEN, CHINA", taxCode: null, country: "CN" },
  buyer: { name: "KHOI MINH ENGINEERING", address: "HCMC", taxCode: null, country: "VN" }, incoterm: "EXW", currency: "USD", totalAmount: 12378, paymentTerms: null, poNo: null,
  items: [{ lineNo: 1, description: "Double-Sided LCD", hsCodeOnInvoice: null, quantity: 60, unit: "SET", unitPrice: 206.3, amount: 12378, origin: "CN", partNo: "APSX116D" }],
  grossWeightKg: null, packages: null, incotermPlace: "Shenzhen", originStatement: "Made In China", custom: { lc_no: "LC-1" }, uncertainties: [],
};
const ctx = (org = "org_a"): Ctx => ({ orgId: asOrgId(org), userId: asUserId("usr_v"), role: "VIEWER" });

async function setup() {
  const uow = new InMemoryExtractionUow();
  const docs = new FakeDocuments();
  const deps = {
    uow, documents: docs, validation: new NoValidation(), ai: new ScriptedAi({ INVOICE }), usage: new RecordingUsage(),
    skills: new FixedSkills([{ key: "lc_no", label: "Số L/C", aliases: [], type: "text" }]), clock: fixedClock("2026-10-15T03:00:00.000Z"), idGen: sequentialIdGen(),
  };
  docs.docs.push({ id: "doc_inv", orgId: "org_a", dossierId: "dos_1", kind: "INVOICE", kindSource: "USER", fileName: "Invoice_CIKA25041701.pdf", mime: "application/pdf", pages: 1, status: "QUEUED", storageKey: "k/inv", sha256: "s1" });
  docs.docs.push({ id: "doc_pending", orgId: "org_a", dossierId: "dos_1", kind: "PACKING_LIST", kindSource: "USER", fileName: "pl.pdf", mime: "application/pdf", pages: 1, status: "QUEUED", storageKey: "k/pl", sha256: "s2" });
  docs.files.set("k/inv", Buffer.from("%PDF"));
  unwrap(await processDocument(deps, { orgId: "org_a", dossierId: "dos_1", documentId: "doc_inv", mode: "FULL" }));
  return deps;
}

describe("documentSheets", () => {
  it("mỗi chứng từ đã đọc xong một bảng theo danh mục; trường bổ sung có nhãn của doanh nghiệp; chứng từ chưa đọc bỏ qua", async () => {
    const sheets = unwrap(await documentSheets(await setup(), ctx(), "dos_1"));
    expect(sheets).toHaveLength(1);
    expect(sheets[0]).toMatchObject({ documentId: "doc_inv", fileName: "Invoice_CIKA25041701.pdf", kind: "INVOICE" });
    const rows = sheets[0]!.rows;
    expect(rows[0]).toMatchObject({ stt: 1, label: "Số hóa đơn", value: "CIKA25041701" });
    expect(rows.find((r) => r.key === "items.0.partNo")?.value).toBe("APSX116D");
    expect(rows.at(-1)).toMatchObject({ label: "Số L/C (bổ sung)", value: "LC-1" });
  });
  it("org khác → rỗng (như listFields, RLS lọc theo org)", async () => {
    expect(unwrap(await documentSheets(await setup(), ctx("org_b"), "dos_1"))).toEqual([]);
  });
});
