import { describe, expect, it } from "vitest";
import { EMPTY_VALUE_CHARGES, type ValueChargesView } from "@kb/contracts";
import { formFromView, kindOfCode, summarize, suggestAdjustments, toValueCharges } from "./value-charges-form";

const VIEW: ValueChargesView = {
  charges: EMPTY_VALUE_CHARGES, direction: "NK", incoterm: "FOB", freightRequired: true, insuranceIncluded: false, locked: false, updatedAt: null, updatedBy: null,
  fromDocuments: { freight: null, insurance: null, other: [{ label: "Packing charge", amount: "50", currency: "USD", kind: "INVOICE" }] },
};

describe("form chi phí → ValueCharges", () => {
  it("mặc định theo chứng từ → mọi phần null", () => {
    expect(toValueCharges(formFromView(VIEW, "USD"))).toEqual({ ok: true, value: EMPTY_VALUE_CHARGES });
  });

  it("cước nhập tay: có số (bỏ dấu phẩy nghìn) hoặc chỉ lý do; thiếu lý do / lý do Khác thiếu ghi chú → lỗi theo ô", () => {
    const f = { ...formFromView(VIEW, "USD"), freightMode: "MANUAL" as const };
    expect(toValueCharges({ ...f, freightAmount: "1,150.5", freightReason: "FORWARDER_NOTICE" })).toEqual({ ok: true, value: { ...EMPTY_VALUE_CHARGES, freight: { amount: "1150.5", currency: "USD", reason: "FORWARDER_NOTICE", note: "" } } });
    expect(toValueCharges({ ...f, freightReason: "INVOICE_LATER" })).toMatchObject({ ok: true, value: { freight: { amount: null, currency: null } } });
    expect(toValueCharges({ ...f, freightAmount: "900" })).toMatchObject({ ok: false, errors: { freightReason: "Chọn lý do" } });
    expect(toValueCharges({ ...f, freightReason: "OTHER" })).toMatchObject({ ok: false, errors: { freightNote: "Ghi rõ lý do khác" } });
    expect(toValueCharges({ ...f, freightAmount: "abc", freightReason: "CONTRACT" })).toMatchObject({ ok: false, errors: { freightAmount: expect.any(String) } });
  });

  it("bảo hiểm: không mua; nhập số; khoản điều chỉnh thiếu mã → lỗi đúng dòng", () => {
    const f = formFromView(VIEW, "USD");
    expect(toValueCharges({ ...f, insuranceMode: "NONE" })).toMatchObject({ ok: true, value: { insurance: { mode: "NONE" } } });
    expect(toValueCharges({ ...f, insuranceMode: "AMOUNT", insuranceAmount: "25" })).toMatchObject({ ok: true, value: { insurance: { mode: "AMOUNT", amount: "25", currency: "USD" } } });
    const r = toValueCharges({ ...f, adjustmentsMode: "MANUAL", adjustments: [{ code: "C", kind: "AD", amount: "50", currency: "usd", note: "", allocate: true }, { code: "", kind: "AD", amount: "1", currency: "USD", note: "", allocate: true }] });
    expect(r).toMatchObject({ ok: false, errors: { "adjustments.1.code": "Chọn mã tên khoản điều chỉnh" } });
  });

  it("gợi ý khoản điều chỉnh từ phí khác của chứng từ; chiều mặc định theo mã tên", () => {
    expect(suggestAdjustments(VIEW)).toEqual([{ code: "", kind: "AD", amount: "50", currency: "USD", note: "Packing charge", allocate: true }]);
    expect([kindOfCode("A", "AD"), kindOfCode("G", "AD"), kindOfCode("N", "SB")]).toEqual(["AD", "SB", "SB"]);
  });
});

describe("tóm tắt từng khoản", () => {
  it("FOB thiếu cước, không lý do → chặn duyệt; phí khác chưa có mã → cảnh báo; bảo hiểm chưa xác nhận", () => {
    const rows = summarize(VIEW);
    expect(rows.map((r) => [r.key, r.tone])).toEqual([["freight", "danger"], ["insurance", "neutral"], ["adjustments", "warning"]]);
    expect(rows[0]).toMatchObject({ no: "1.47", source: "Chặn duyệt" });
  });

  it("có lý do chưa có số → cảnh báo; nhập tay lệch chứng từ → cảnh báo kèm số chứng từ; CIF → không cần cước/bảo hiểm", () => {
    const reason = summarize({ ...VIEW, charges: { ...EMPTY_VALUE_CHARGES, freight: { amount: null, currency: null, reason: "INVOICE_LATER", note: "" } } });
    expect(reason[0]).toMatchObject({ tone: "warning", value: "Chưa có số cước" });
    const differs = summarize({ ...VIEW, fromDocuments: { ...VIEW.fromDocuments, freight: { amount: "1150.00", currency: "USD", kind: "FREIGHT_INVOICE" } }, charges: { ...EMPTY_VALUE_CHARGES, freight: { amount: "1300", currency: "USD", reason: "CONTRACT", note: "" } } });
    expect(differs[0]).toMatchObject({ tone: "warning", source: "Người khai nhập", hint: expect.stringMatching(/Khác số trên chứng từ/) });
    const cif = summarize({ ...VIEW, incoterm: "CIF", freightRequired: false, insuranceIncluded: true });
    expect(cif.slice(0, 2).map((r) => r.tone)).toEqual(["neutral", "neutral"]);
  });

  it("xuất khẩu: không có dòng 1.49; cước / bảo hiểm theo chỉ tiêu 2.40", () => {
    const rows = summarize({ ...VIEW, direction: "XK", incoterm: "CIF", freightRequired: true, insuranceIncluded: true });
    expect(rows.map((r) => `${r.key}:${r.no}`)).toEqual(["freight:2.40", "insurance:2.40"]);
  });
});

describe("phân bổ phí (1.88)", () => {
  it("tóm tắt nêu khoản được phân bổ cho mọi dòng; bỏ chọn khoản → gửi allocate false", () => {
    const rows = [{ code: "A", kind: "AD" as const, amount: "100", currency: "USD", note: "", allocate: true }, { code: "G", kind: "SB" as const, amount: "20", currency: "USD", note: "", allocate: false }];
    expect(summarize({ ...VIEW, charges: { ...EMPTY_VALUE_CHARGES, adjustments: rows } })[2]?.hint).toMatch(/1\.88 mỗi dòng tự điền khoản 1/);
    const r = toValueCharges({ ...formFromView(VIEW, "USD"), adjustmentsMode: "MANUAL", adjustments: rows });
    expect(r).toMatchObject({ ok: true, value: { adjustments: [{ allocate: true }, { allocate: false }] } });
  });
});
