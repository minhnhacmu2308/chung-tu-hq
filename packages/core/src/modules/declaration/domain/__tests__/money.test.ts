import { describe, expect, it } from "vitest";
import { allocateCustomsValue } from "../valuation.js";
import { computeTaxes } from "../tax.js";
import { canApprove, canMoveToReview, canSubmit } from "../guards.js";
import { rankHs } from "../hs-rank.js";

// Hồ sơ HANSOL: 7 dòng tổng 20.850 USD, FCA + cước 1.150 USD, tỷ giá 25.400 → 558.800.000 VND.
const ITEMS = [
  { id: "li_1", amount: "3700" }, { id: "li_2", amount: "3360" }, { id: "li_3", amount: "2700" }, { id: "li_4", amount: "2760" },
  { id: "li_5", amount: "3900" }, { id: "li_6", amount: "2952" }, { id: "li_7", amount: "1478" },
];
const ADJ = [{ label: "Cước vận chuyển quốc tế", amount: "1150", currency: "USD", source: "FREIGHT_INVOICE" as const, kind: "ADD" as const }];

describe("valuation", () => {
  it("cộng khoản điều chỉnh cùng tiền tệ, quy đổi VND làm tròn 0 chữ số, phân bổ theo trị giá dòng, dòng cuối nhận phần dư", () => {
    const v = allocateCustomsValue({ items: ITEMS, adjustments: ADJ, currency: "USD", rates: { USD: "25400" } });
    expect(v.invoiceTotal).toBe("20850");
    expect(v.adjustmentsVnd).toBe("29210000");
    expect(v.adjustments[0]?.rate).toBe("25400");
    expect(v.customsValueVnd).toBe("558800000");
    expect(v.perItem.map((p) => p.customsValueVnd)).toEqual(["99163549", "90051223", "72362590", "73970647", "104523741", "79116432", "39611818"]);
  });
  it("khoản trừ (SUBTRACT); khoản VND quy đổi 1:1; tiền tệ chưa có tỷ giá bị bỏ qua kèm cảnh báo; không có dòng → 0", () => {
    const v = allocateCustomsValue({
      items: ITEMS.slice(0, 1), currency: "USD", rates: { USD: "25400" },
      adjustments: [
        { label: "Giảm giá", amount: "100", currency: "USD", source: "INVOICE", kind: "SUBTRACT" },
        { label: "Cước quốc tế", amount: "29200000", currency: "VND", source: "FREIGHT_INVOICE", kind: "ADD" },
        { label: "Phí EUR", amount: "10", currency: "EUR", source: "INVOICE", kind: "ADD" },
      ],
    });
    // 3700 × 25400 − 100 × 25400 + 29.200.000 = 120.640.000
    expect(v.customsValueVnd).toBe("120640000");
    expect(v.warnings).toEqual(["Khoản điều chỉnh “Phí EUR” (EUR) chưa có tỷ giá – chưa cộng vào trị giá"]);
    expect(allocateCustomsValue({ items: [], adjustments: [], currency: "USD", rates: { USD: "25400" } }).customsValueVnd).toBe("0");
  });
});

describe("tax", () => {
  it("thuế NK = trị giá × thuế suất, VAT = (trị giá + thuế NK) × VAT, làm tròn VND; dòng chưa có thuế suất → 0", () => {
    const t = computeTaxes([
      { id: "li_1", customsValueVnd: "99163549", importDutyRate: "3", vatRate: "8" },
      { id: "li_2", customsValueVnd: "90051223", importDutyRate: "0", vatRate: "8" },
      { id: "li_3", customsValueVnd: "72362590", importDutyRate: null, vatRate: null },
    ]);
    expect(t.perItem[0]).toEqual({ id: "li_1", importDutyVnd: "2974906", vatVnd: "8171076" });
    expect(t.perItem[1]).toEqual({ id: "li_2", importDutyVnd: "0", vatVnd: "7204098" });
    expect(t.perItem[2]).toEqual({ id: "li_3", importDutyVnd: "0", vatVnd: "0" });
    expect(t.importDutyVnd).toBe("2974906");
    expect(t.vatVnd).toBe("15375174");
  });
});

describe("guards", () => {
  const items = (confirmed: number, total = 3) => Array.from({ length: total }, (_, i) => ({ hsConfirmed: i < confirmed ? "8482.10.00" : null }));
  it("canMoveToReview: cần HS đủ và có tờ khai", () => {
    expect(canMoveToReview(items(3), true).ok).toBe(true);
    expect(canMoveToReview(items(2), true)).toMatchObject({ ok: false, error: { code: "HS_UNCONFIRMED" } });
    expect(canMoveToReview(items(3), false)).toMatchObject({ ok: false, error: { code: "NO_DECLARATION" } });
  });
  it("canApprove: vai trò APPROVER/OWNER, không BLOCKER FAIL, HS đủ, tờ khai DRAFT, 4 mắt khi bật", () => {
    const base = { role: "APPROVER" as const, userId: "u2", ownerId: "u1", fourEyes: false, blockerFails: 0, items: items(3), status: "DRAFT" as const };
    expect(canApprove(base).ok).toBe(true);
    expect(canApprove({ ...base, role: "DECLARANT" })).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(canApprove({ ...base, blockerFails: 2 })).toMatchObject({ ok: false, error: { code: "BLOCKER_FAILED" } });
    expect(canApprove({ ...base, items: items(1) })).toMatchObject({ ok: false, error: { code: "HS_UNCONFIRMED" } });
    expect(canApprove({ ...base, status: "APPROVED" })).toMatchObject({ ok: false, error: { code: "INVALID_STATE" } });
    expect(canApprove({ ...base, fourEyes: true, userId: "u1" })).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(canApprove({ ...base, fourEyes: true, userId: "u1", role: "OWNER" }).ok).toBe(true);
    expect(canApprove({ ...base, exchangeRate: "0" })).toMatchObject({ ok: false, error: { code: "INVALID_STATE" } });
    expect(canApprove({ ...base, exchangeRate: "26150" }).ok).toBe(true);
  });
  it("canSubmit: phải APPROVED, không BLOCKER, chưa SUBMITTED", () => {
    expect(canSubmit({ status: "APPROVED", blockerFails: 0 }).ok).toBe(true);
    expect(canSubmit({ status: "DRAFT", blockerFails: 0 })).toMatchObject({ ok: false, error: { code: "NOT_APPROVED" } });
    expect(canSubmit({ status: "APPROVED", blockerFails: 1 })).toMatchObject({ ok: false, error: { code: "BLOCKER_FAILED" } });
    expect(canSubmit({ status: "SUBMITTED", blockerFails: 0 })).toMatchObject({ ok: false, error: { code: "ALREADY_SUBMITTED" } });
  });
});

describe("hs-rank", () => {
  it("ứng viên khớp 6 số với HS trên invoice được cộng tin cậy (tối đa 0,99); không có ứng viên → không gợi ý", () => {
    const r = rankHs([{ code: "8466.93.90", confidence: 0.61 }, { code: "8482.80.00", confidence: 0.55 }], "8482.80.0000");
    expect(r.hsSuggested).toBe("8482.80.00");
    expect(r.hsConfidence).toBeCloseTo(0.7, 5);
    expect(r.ranked.map((x) => x.code)).toEqual(["8482.80.00", "8466.93.90"]);
    expect(rankHs([{ code: "8482.10.00", confidence: 0.95 }], "8482.10.1000").hsConfidence).toBe(0.99);
    expect(rankHs([], null)).toEqual({ hsSuggested: null, hsConfidence: null, ranked: [] });
  });
});
