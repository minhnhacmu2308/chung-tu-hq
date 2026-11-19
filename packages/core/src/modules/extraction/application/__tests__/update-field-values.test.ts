// Sửa nhiều trường một lần (áp xuất xứ cho các dòng đã chọn): trước đây giao diện gọi updateFieldValue song song cho từng dòng →
// mỗi lần đọc shipment cũ rồi ghi đè cả khối → shipment chỉ còn xuất xứ của lần ghi cuối. updateFieldValues ghi 1 transaction.
import { beforeEach, describe, expect, it } from "vitest";
import { fixedClock } from "../../../../shared/clock.js";
import type { Ctx } from "../../../../shared/ctx.js";
import { asOrgId, asUserId, sequentialIdGen } from "../../../../shared/ids.js";
import { unwrap } from "../../../../shared/result.js";
import type { ExtractionDeps } from "../ports.js";
import { processDocument } from "../process-document.js";
import { FakeDocuments, InMemoryExtractionUow, NoSkills, NoValidation, RecordingUsage, ScriptedAi } from "../test/fakes.js";
import { updateFieldValue } from "../update-field-value.js";
import { updateFieldValues } from "../update-field-values.js";

const item = (lineNo: number, description: string) => ({ lineNo, description, quantity: 1, unit: "KGM", unitPrice: 2, amount: 2, origin: null, hsCodeOnInvoice: null });
const INVOICE = {
  invoiceNo: "INV-1", invoiceDate: "2026-10-02", seller: { name: "S", address: null, taxCode: null, country: "ID" }, buyer: { name: "B", address: null, taxCode: null, country: "VN" },
  incoterm: "CIF", currency: "USD", totalAmount: 6, paymentTerms: null, poNo: null, grossWeightKg: null, packages: null, uncertainties: [],
  items: [item(1, "Fish"), item(2, "Squid"), item(3, "Shrimp")],
};
const ctx = (role: Ctx["role"] = "DECLARANT", orgId = "org_a"): Ctx => ({ orgId: asOrgId(orgId), userId: asUserId("usr_a"), role });

let uow: InMemoryExtractionUow;
let docs: FakeDocuments;
let validation: NoValidation;
let deps: ExtractionDeps;
const field = (key: string) => uow.data.fields.find((f) => f.key === key)!;
const shipmentOrigins = () => (uow.data.shipments.at(-1)!.data.items as { origin: { value: string | null } }[]).map((i) => i.origin.value);

beforeEach(async () => {
  uow = new InMemoryExtractionUow();
  docs = new FakeDocuments();
  validation = new NoValidation();
  deps = { uow, documents: docs, validation, ai: new ScriptedAi({ INVOICE }), usage: new RecordingUsage(), skills: new NoSkills(), clock: fixedClock("2026-10-14T03:00:00.000Z"), idGen: sequentialIdGen() };
  docs.docs.push({ id: "doc_inv", orgId: "org_a", dossierId: "dos_1", kind: "INVOICE", kindSource: "USER", fileName: "inv.pdf", mime: "application/pdf", pages: 1, status: "QUEUED", storageKey: "k", sha256: "s" });
  docs.files.set("k", Buffer.from("%PDF"));
  unwrap(await processDocument(deps, { orgId: "org_a", dossierId: "dos_1", documentId: "doc_inv", mode: "FULL" }));
});

describe("updateFieldValues – sửa nhiều trường một lần", () => {
  it("áp xuất xứ cho 3 dòng: shipment có đủ cả 3 (không mất dòng nào), audit từng ô, luật chạy 1 lần, publish 1 lần", async () => {
    const runs = validation.runs.length;
    const published = docs.events.length;
    const ids = [1, 2, 3].map((n) => field(`item.${n}.origin`).id);
    const saved = unwrap(await updateFieldValues(deps, ctx(), "dos_1", ids.map((id) => ({ id, value: " JP " }))));
    expect(saved.map((f) => [f.key, f.value, f.status])).toEqual([1, 2, 3].map((n) => [`item.${n}.origin`, "JP", "USER_CONFIRMED"]));
    expect(shipmentOrigins()).toEqual(["JP", "JP", "JP"]);
    expect(uow.data.audit.filter((a) => a.key.endsWith(".origin")).map((a) => a.newValue)).toEqual(["JP", "JP", "JP"]);
    expect(validation.runs.length).toBe(runs + 1);
    expect(docs.events.length).toBe(published + 1);
  });

  it("lỗi gốc: gọi updateFieldValue song song cho từng dòng thì shipment mất xuất xứ (chứng minh vì sao cần lưu hàng loạt)", async () => {
    const ids = [1, 2, 3].map((n) => field(`item.${n}.origin`).id);
    await Promise.all(ids.map((id) => updateFieldValue(deps, ctx(), id, "JP")));
    expect(shipmentOrigins().filter((o) => o === "JP").length).toBeLessThan(3);
  });

  it("có trường không thuộc hồ sơ / không tồn tại → NOT_FOUND, không sửa trường nào", async () => {
    const ok = field("item.1.origin").id;
    const r1 = await updateFieldValues(deps, ctx(), "dos_khac", [{ id: ok, value: "JP" }]);
    const r2 = await updateFieldValues(deps, ctx(), "dos_1", [{ id: ok, value: "JP" }, { id: "fld_khong_co", value: "JP" }]);
    expect(r1.ok || r2.ok).toBe(false);
    expect([r1, r2].map((r) => (r.ok ? null : r.error.code))).toEqual(["NOT_FOUND", "NOT_FOUND"]);
    expect(field("item.1.origin").value).not.toBe("JP");
  });

  it("giá trị không hợp lệ ở một ô → VALIDATION, các ô khác cũng không lưu (1 transaction)", async () => {
    const audits = uow.data.audit.length;
    const before = field("item.1.origin").value;
    const r = await updateFieldValues(deps, ctx(), "dos_1", [{ id: field("item.1.origin").id, value: "JP" }, { id: field("item.2.quantity").id, value: "abc" }]);
    expect(r.ok ? null : r.error.code).toBe("VALIDATION");
    // Ô hợp lệ đứng trước ô lỗi KHÔNG được ghi dở (bảng trường, audit, shipment đều giữ nguyên)
    expect(field("item.1.origin").value).toBe(before);
    expect(uow.data.audit.length).toBe(audits);
    expect(shipmentOrigins()[0]).not.toBe("JP");
  });

  it("VIEWER không sửa; org khác → NOT_FOUND", async () => {
    const id = field("item.1.origin").id;
    expect((await updateFieldValues(deps, ctx("VIEWER"), "dos_1", [{ id, value: "JP" }])).ok).toBe(false);
    const other = await updateFieldValues(deps, ctx("DECLARANT", "org_b"), "dos_1", [{ id, value: "JP" }]);
    expect(other.ok ? null : other.error.code).toBe("NOT_FOUND");
  });
});
