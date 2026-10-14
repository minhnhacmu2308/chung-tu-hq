import type { Sourced } from "@kb/contracts";
import { describe, expect, it } from "vitest";
import { planAdjustments } from "../adjustments.js";
import { hansol } from "../test/shipment.js";

const sourced = (value: string | null, kind?: "ARRIVAL_NOTICE" | "INVOICE" | "OTHER"): Sourced<string> => ({
  value, sources: kind && value !== null ? [{ documentId: `doc_${kind.toLowerCase()}`, kind, page: 1, raw: value, normalized: value }] : [], status: "SINGLE_SOURCE",
});

describe("planAdjustments", () => {
  it.each(["EXW", "FAS", "FOB", "fob"])("%s: cước chưa gồm trong giá → cộng cước, không ghi chú", (term) => {
    const plan = planAdjustments(hansol((s) => void (s.invoice.incoterm.value = term)));
    expect(plan.adjustments).toEqual([expect.objectContaining({ label: "Cước vận chuyển quốc tế", amount: "1150" })]);
    expect(plan.notes).toEqual([]);
  });

  it("cước lấy từ Arrival Notice → nguồn ARRIVAL_NOTICE; không có nguồn → SYSTEM; không có tiền tệ cước → theo tiền tệ hóa đơn", () => {
    const an = planAdjustments(hansol((s) => void (s.charges.freight = sourced("900", "ARRIVAL_NOTICE"))));
    expect(an.adjustments[0]).toEqual({ label: "Cước vận chuyển quốc tế", amount: "900", currency: "USD", source: "ARRIVAL_NOTICE", kind: "ADD" });
    const none = planAdjustments(hansol((s) => void (s.charges.freight = sourced("900"))));
    expect(none.adjustments[0]?.source).toBe("SYSTEM");
  });

  it("nguồn là loại chứng từ không có trong bảng (OTHER) → SYSTEM", () => {
    const plan = planAdjustments(hansol((s) => void (s.charges.freight = sourced("900", "OTHER"))));
    expect(plan.adjustments[0]?.source).toBe("SYSTEM");
  });

  it("không có incoterm và không có tiền tệ hóa đơn: không cộng cước, không ghi chú; tiền tệ khoản điều chỉnh rỗng", () => {
    const plan = planAdjustments(hansol((s) => {
      s.invoice.incoterm.value = null;
      s.invoice.currency.value = null;
      s.charges.insurance = sourced("40", "INVOICE");
    }));
    expect(plan.notes).toEqual([]);
    expect(plan.adjustments).toEqual([{ label: "Phí bảo hiểm", amount: "40", currency: "", source: "INVOICE", kind: "ADD" }]);
  });

  it("FOB + có phí bảo hiểm → cộng cả cước và bảo hiểm (tiền tệ bảo hiểm riêng nếu có)", () => {
    const plan = planAdjustments(hansol((s) => {
      s.invoice.incoterm.value = "FOB";
      s.charges.insurance = sourced("35.5", "INVOICE");
      s.charges.insuranceCurrency = sourced("EUR");
    }));
    expect(plan.adjustments.map((a) => a.label)).toEqual(["Cước vận chuyển quốc tế", "Phí bảo hiểm"]);
    expect(plan.adjustments[1]).toEqual({ label: "Phí bảo hiểm", amount: "35.5", currency: "EUR", source: "INVOICE", kind: "ADD" });
  });

  it.each(["CIF", "CIP", "DAP", "DPU", "DDP"])("%s: bảo hiểm đã gồm trong giá → không cộng phí bảo hiểm", (term) => {
    const plan = planAdjustments(hansol((s) => {
      s.invoice.incoterm.value = term;
      s.charges.insurance = sourced("35.5", "INVOICE");
    }));
    expect(plan.adjustments).toEqual([]);
  });

  it("CFR: cước đã gồm nhưng bảo hiểm chưa gồm → chỉ cộng bảo hiểm, ghi chú cước đã gồm", () => {
    const plan = planAdjustments(hansol((s) => {
      s.invoice.incoterm.value = "CFR";
      s.charges.insurance = sourced("35.5", "INVOICE");
    }));
    expect(plan.adjustments.map((a) => a.label)).toEqual(["Phí bảo hiểm"]);
    expect(plan.notes).toEqual(["CFR: cước vận chuyển đã gồm trong giá hóa đơn"]);
  });

  it.each(["THC", "D/O fee", "CFS charge", "Handling fee", "Local charge", "Phí lưu kho", "LUU KHO", "Storage", "Container cleaning", "Phí vệ sinh", "Seal fee", "CIC", "EBS"])(
    "phí nội địa “%s” không cộng vào trị giá",
    (label) => {
      const plan = planAdjustments(hansol((s) => void (s.charges.other = [{ label, amount: "100", currency: "USD", sourceKind: "ARRIVAL_NOTICE" }])));
      expect(plan.adjustments.map((a) => a.label)).toEqual(["Cước vận chuyển quốc tế"]);
    },
  );

  it("phí khác (không phải nội địa) → cộng với nguồn theo chứng từ; nguồn OTHER → SYSTEM", () => {
    const plan = planAdjustments(hansol((s) => void (s.charges.other = [
      { label: "Royalty", amount: "500", currency: "USD", sourceKind: "SALES_CONTRACT" },
      { label: "Packing cost", amount: "20", currency: "USD", sourceKind: "OTHER" },
    ])));
    expect(plan.adjustments.slice(1)).toEqual([
      { label: "Royalty", amount: "500", currency: "USD", source: "CONTRACT", kind: "ADD" },
      { label: "Packing cost", amount: "20", currency: "USD", source: "SYSTEM", kind: "ADD" },
    ]);
  });

  it("phí khác là cước (O/F, Ocean freight) khi đã cộng cước → bỏ qua để không cộng hai lần", () => {
    const plan = planAdjustments(hansol((s) => void (s.charges.other = [
      { label: "O/F", amount: "1150", currency: "USD", sourceKind: "ARRIVAL_NOTICE" },
      { label: "Ocean freight", amount: "1150", currency: "USD", sourceKind: "ARRIVAL_NOTICE" },
    ])));
    expect(plan.adjustments).toHaveLength(1);
    expect(plan.adjustments[0]?.label).toBe("Cước vận chuyển quốc tế");
  });

  it("phí khác là cước khi chưa có cước chính (FCA thiếu cước) → vẫn cộng dòng cước từ phí khác, kèm ghi chú thiếu cước", () => {
    const plan = planAdjustments(hansol((s) => {
      s.charges.freight = sourced(null);
      s.charges.other = [{ label: "Air freight", amount: "800", currency: "USD", sourceKind: "ARRIVAL_NOTICE" }];
    }));
    expect(plan.adjustments).toEqual([{ label: "Air freight", amount: "800", currency: "USD", source: "ARRIVAL_NOTICE", kind: "ADD" }]);
    expect(plan.notes[0]).toMatch(/^FCA: cần cước/);
  });

  // Nghi lỗi (báo cáo, chưa sửa): incoterm kèm địa danh ("FOB BUSAN") được trích xuất chấp nhận (/^(FOB|…)\b/)
  // và luật đối chiếu incoterm-freight cắt 3 ký tự đầu, nhưng planAdjustments so khớp nguyên chuỗi → không cộng cước.
  it("“FOB BUSAN” (incoterm kèm địa danh) → vẫn cộng cước vận chuyển quốc tế như FOB; “CIF HAI PHONG” → ghi chú đã gồm cước", () => {
    const fob = planAdjustments(hansol((s) => void (s.invoice.incoterm.value = "FOB BUSAN")));
    expect(fob.adjustments).toEqual([expect.objectContaining({ label: "Cước vận chuyển quốc tế", amount: "1150" })]);
    const cif = planAdjustments(hansol((s) => void (s.invoice.incoterm.value = "cif hai phong")));
    expect(cif.adjustments.some((a) => a.label.startsWith("Cước"))).toBe(false);
    expect(cif.notes).toEqual(["CIF: cước vận chuyển đã gồm trong giá hóa đơn"]);
  });
  // Nghi lỗi: CIF đã gồm cước, nhưng dòng “Ocean freight” trong phí khác vẫn bị cộng vào trị giá (chỉ bỏ khi đã có dòng “Cước”).
  it("CIF + phí khác “Ocean freight” → không cộng cước lần nữa; FOB không có hóa đơn cước mà phí khác có “Ocean freight” → vẫn cộng (là bằng chứng cước duy nhất)", () => {
    const other = [{ label: "Ocean freight", amount: "800", currency: "USD", sourceKind: "ARRIVAL_NOTICE" as const }];
    const cif = planAdjustments(hansol((s) => void Object.assign(s, { invoice: { ...s.invoice, incoterm: { ...s.invoice.incoterm, value: "CIF" } }, charges: { ...s.charges, other } })));
    expect(cif.adjustments).toEqual([]);
    const fob = planAdjustments(hansol((s) => void Object.assign(s, { invoice: { ...s.invoice, incoterm: { ...s.invoice.incoterm, value: "FOB" } }, charges: { ...s.charges, freight: { value: null, sources: [], status: "SINGLE_SOURCE" }, other } })));
    expect(fob.adjustments.map((a) => [a.label, a.amount])).toEqual([["Ocean freight", "800"]]);
  });
});
