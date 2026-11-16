import { describe, expect, it } from "vitest";
import { amaLineDelta, amaLineFrom, type CustomsInfo } from "@kb/contracts";
import { amaSourceLines, amendmentDeltaVnd, buildAmaRequest } from "../post-amendment.js";
import type { DeclarationPayload } from "../declaration-to-fpt.js";

const payload: DeclarationPayload = {
  kind: "IDA", direction: "NK", currency: "USD", containers: [], adjustments: [],
  fields: { MA_LH: { value: "A12" }, "HANG.li_1.HAG_RE": { value: "XN210" } },
  items: [{ id: "li_1", lineNo: 1, description: "Bột thạch anh", quantity: "17255", unit: "KGM", unitPrice: "1", amount: "1", origin: "CN", hsConfirmed: "2506.10.00", importDutyRate: "5", vatRate: "10", policyNote: null }],
};
const customs = { receivedAt: "2026-04-28T00:00:00Z", exchangeRates: [], taxes: [], directives: [], items: [{ lineNo: 1, hsCode: "25061000", customsValue: "78721520.22", taxRate: "5", taxAmountVnd: "3936076.011" }] } satisfies CustomsInfo;

describe("bản khai bổ sung AMA – domain", () => {
  it("dòng tờ khai gốc: số Hải quan tính + GTGT trước = (trị giá + thuế NK) × thuế suất; ô người khai theo id dòng", () => {
    const [l] = amaSourceLines(payload, customs);
    expect(l).toMatchObject({ lineNo: 1, values: { HAG_CMN: "Bột thạch anh", HAG_RE: "XN210" }, otherTaxes: [{ code: "VB901", rate: "10%", base: "82657596.231", amount: "8265759.6231" }] });
  });
  it("dòng cũ 8%/5% không mã HSCodePro → Trước theo mã phần mềm bản cũ đã gửi (VB903/VB905; 0% vatAutoFill đã điền mã V); người khai đã nhập mã GTGT → mã đó; không thuế suất → không có otherTaxes", () => {
    const line = (extra: Partial<DeclarationPayload["items"][number]>, fields = payload.fields) => amaSourceLines({ ...payload, fields, items: [{ ...payload.items[0]!, ...extra }] }, customs)[0]!;
    expect(line({ vatRate: "8" }).otherTaxes).toEqual([{ code: "VB903", rate: "8%", base: "82657596.231", amount: "6612607.6985" }]);
    expect(line({ vatRate: "5" }).otherTaxes?.[0]?.code).toBe("VB905");
    expect(line({ vatRate: "0" }).otherTaxes?.[0]?.code).toBe("V");
    expect(line({ vatRate: "8" }, { ...payload.fields, "HANG.li_1.HAG_TX5": { value: "VB245" } }).otherTaxes?.[0]?.code).toBe("VB245");
    expect(line({ vatRate: "8", vatCode: "VB245" }).otherTaxes?.[0]?.code).toBe("VB245");
    expect(line({ vatRate: null })).not.toHaveProperty("otherTaxes");
  });
  it("ama_carries_all_groups: TTĐB TB020 + GTGT VB901 → hai nhóm theo thứ tự nhóm, nhóm khác GTGT không tính tiền", () => {
    const p = { ...payload, fields: { ...payload.fields, "HANG.li_1.HAG_TX3": { value: "TB020" }, "HANG.li_1.HAG_TR3": { value: "TA520" } } };
    const [l] = amaSourceLines(p, customs);
    expect(l!.otherTaxes).toEqual([
      { code: "TB020", rate: null, base: null, amount: null },
      { code: "VB901", rate: "10%", base: "82657596.231", amount: "8265759.6231" },
    ]);
    const v = amaLineFrom(l!);
    expect(v).toMatchObject({ HAG_MK1: "TB020", HAG_AK1: "TB020", HAG_MK2: "VB901", HAG_MA2: "8265759.6231" });
    expect(v).not.toHaveProperty("HAG_MR1");
    expect(amaLineDelta({ ...v, HAG_AA2: "9000000" }).other).toEqual([{ slot: 2, amount: "734240.3769" }]);
  });
  it("payload AMA: ngày dd/MM/yyyy, số → number, ô APP_ không gửi; thiếu dòng / lý do → chặn gửi", () => {
    const b = buildAmaRequest({
      header: { TK_YNK: "I", TK_ICN: "108173826831", TK_ICB: "A12", TK_CHS: "10BB", TK_CHB: "00", TK_IDD: "2026-04-23", TK_IPD: "2026-04-28", TK_REC: "6", TK_TTC: "VND", APP_HD_GC: "HD-1" },
      lines: [{ id: "l1", ran: 1, manual: [], values: { HAG_RAN: "01", HAG_AKB: "78,721,520.22", APP_MA_HANG_SAU: "X" } }],
    });
    expect(b.blockers).toEqual([]);
    expect(b.issues).toEqual([]);
    expect(b.request.objVN_AMA).toMatchObject({ tK_ICN: 108173826831, tK_IDD: "23/04/2026" });
    expect(b.request.objVN_AMA).not.toHaveProperty("apP_HD_GC");
    expect(b.request.objVN_AMA_HANG[0]).toEqual({ haG_RAN: "01", haG_AKB: 78721520.22 });
    expect(buildAmaRequest({ header: {}, lines: [] }).blockers).toHaveLength(3);
  });
  it("AMA: trường Long Integer gửi dạng chuỗi (cổng FPT thật từ chối số), decimal vẫn là số", () => {
    const b = buildAmaRequest({
      header: { TK_YNK: "I", TK_ICN: "108173826831", TK_ICB: "A12", TK_CHS: "10BB", TK_CHB: "00", TK_IDD: "2026-04-23", TK_IPD: "2026-04-28", TK_REC: "6", TK_TTC: "VND", TK_BYA: "2026" },
      lines: [{ id: "l1", ran: 1, manual: [], values: { HAG_RAN: "01", HAG_AKB: "100" } }],
    });
    expect(b.issues).toEqual([]);
    expect(b.request.objVN_AMA).toMatchObject({ tK_BYA: "2026", tK_ICN: 108173826831 });
  });
  it("tổng tăng/giảm tiền thuế (VND, làm tròn)", () => {
    expect(amendmentDeltaVnd({ lines: [{ id: "l", ran: 1, manual: [], values: { HAG_MKA: "100", HAG_AKA: "150.6", HAG_MA1: "10", HAG_AA1: "5" } }] })).toBe("46");
  });
});
