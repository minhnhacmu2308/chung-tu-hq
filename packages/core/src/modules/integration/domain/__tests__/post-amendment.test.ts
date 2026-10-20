import { describe, expect, it } from "vitest";
import type { CustomsInfo } from "@kb/contracts";
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
  it("tổng tăng/giảm tiền thuế (VND, làm tròn)", () => {
    expect(amendmentDeltaVnd({ lines: [{ id: "l", ran: 1, manual: [], values: { HAG_MKA: "100", HAG_AKA: "150.6", HAG_MA1: "10", HAG_AA1: "5" } }] })).toBe("46");
  });
});
