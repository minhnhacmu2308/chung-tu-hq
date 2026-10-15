import { describe, expect, it } from "vitest";
import { buildFptRequest, type DeclarationPayload } from "../declaration-to-fpt.js";
import { maskPayload } from "../mask.js";
import { next, nextOperation, rowState } from "../state-machine.js";

const PAYLOAD: DeclarationPayload = {
  kind: "IDA", direction: "NK", currency: "USD", containers: ["SITU2246781"],
  fields: {
    MA_LH: { value: "A11" }, CQHQ: { value: "03CE – Chi cục HQ CK cảng Hải Phòng KV III" }, PTVC: { value: "2 – Đường biển (container)" }, PL_CN: { value: "4 – Tổ chức gửi tổ chức" }, NGAY_DK: { value: "2026-10-14" },
    NNK_MST: { value: "0316789012" }, NNK_TEN: { value: "CÔNG TY TNHH THIẾT BỊ CÔNG NGHIỆP AN PHÁT" }, NNK_DC: { value: "Lô B4, KCN Tràng Duệ, An Dương, Hải Phòng" }, NNK_DT: { value: "0225 3 888 123" },
    NXK_TEN: { value: "HANSOL PRECISION CO., LTD. – A VERY LONG COMPANY NAME THAT EXCEEDS SEVENTY CHARACTERS LIMIT" }, NXK_DC: { value: "45, Gongdan-ro 140beon-gil, Seongsan-gu, Changwon-si, Gyeongsangnam-do, KOREA" }, MA_NUOC: { value: "KR" },
    SO_VD: { value: "HPSEL2610078" }, SO_KIEN: { value: "48 PL" }, TRONG_LUONG: { value: "3860.5" }, KHO: { value: "03CCS01 – Kho CFS Tân Vũ" }, CANG_DO: { value: "VNHPH – Cảng Hải Phòng" }, CANG_XEP: { value: "KRPUS – Busan" },
    PTVC_TEN: { value: "SITC HAIPHONG V.2641S" }, NGAY_DEN: { value: "2026-10-15" }, HD_PL: { value: "A – Hóa đơn thương mại" }, SO_HD: { value: "HSP-2610-0457" }, NGAY_HD: { value: "2026-10-02" },
    PT_TT: { value: "TTR – Chuyển tiền điện (T/T)" }, GIA_PL: { value: "A – Giá hóa đơn cho hàng hóa phải trả tiền" }, DK_GIA: { value: "FCA" }, MA_TT: { value: "USD" }, TONG_TG: { value: "20850" }, KHAI_TG: { value: "6 – Áp dụng phương pháp trị giá giao dịch" },
    VBPQ: { value: "MO" }, SO_QLNB: { value: "HS-NK-2610-021" },
  },
  items: [
    { lineNo: 1, description: "Vòng bi cầu 6205-2RS", quantity: "2000", unit: "PCE", unitPrice: "1.85", amount: "3700", origin: "KR", hsConfirmed: "8482.10.00", importDutyRate: "0", vatRate: "8", policyNote: "Áp thuế suất ưu đãi đặc biệt AKFTA (C/O form AK)" },
    { lineNo: 2, description: "Thanh trượt HGR25", quantity: "120", unit: "PCE", unitPrice: "32.5", amount: "3900", origin: "KR", hsConfirmed: "8466.93.90", importDutyRate: "0", vatRate: "8", policyNote: null },
  ],
  adjustments: [{ label: "Cước vận chuyển quốc tế", amount: "29200000", currency: "VND" }],
};

describe("declaration-to-fpt", () => {
  it("IDA: TK_IMC = MST, VD_BL1, HAG_CMD 8 số không dấu chấm, KTG_FR3 cước, TK_EPN cắt ≤ 70 kèm cảnh báo, địa chỉ chia 35 ký tự, ngày dd/MM/yyyy, hợp lệ theo Zod", () => {
    const b = buildFptRequest(PAYLOAD);
    const r = b.request as { objVN_IDA: Record<string, unknown>; objVN_IDA_HANG: Record<string, unknown>[]; objVN_IDA_VANDON: Record<string, unknown>; objVN_IDA_KTG: Record<string, unknown> };
    expect(r.objVN_IDA["tK_IMC"]).toBe("0316789012");
    expect(r.objVN_IDA["tK_ICB"]).toBe("A11");
    expect(r.objVN_IDA["tK_CH"]).toBe("03CE");
    expect(r.objVN_IDA["tK_MTC"]).toBe("2");
    expect(r.objVN_IDA["tK_ICD"]).toBe("14/10/2026");
    expect(r.objVN_IDA["tK_IVP"]).toBe("TTR");
    expect(r.objVN_IDA["tK_IP4"]).toBe(20850);
    expect(String(r.objVN_IDA["tK_EPN"]).length).toBe(70);
    expect(String(r.objVN_IDA["tK_EPA"]).length).toBeLessThanOrEqual(35);
    expect(r.objVN_IDA["tK_EPA"]).toMatch(/^45, Gongdan-ro/);
    expect(r.objVN_IDA["tK_EP2"]).toBeTruthy();
    expect(r.objVN_IDA_VANDON["vD_BL1"]).toBe("HPSEL2610078");
    expect(r.objVN_IDA_VANDON["vD_NO"]).toBe(48);
    expect(r.objVN_IDA_VANDON["vD_NOT"]).toBe("PL");
    expect(r.objVN_IDA_VANDON["vD_DST"]).toBe("VNHPH");
    expect(r.objVN_IDA_VANDON["vD_ST"]).toBe("03CCS01");
    expect(r.objVN_IDA_VANDON["vD_ARR"]).toBe("15/10/2026");
    expect(r.objVN_IDA_KTG["ktG_FR3"]).toBe(29200000);
    expect(r.objVN_IDA_KTG["ktG_FR2"]).toBe("VND");
    // AKFTA là B06 theo bảng mã biểu thuế Phụ lục II TT39 (B07 là AANZFTA).
    expect(r.objVN_IDA_HANG[0]).toMatchObject({ haG_B25: "01", haG_CMD: "84821000", haG_ORS: "B06", haG_QN1: 2000, haG_UPC: "USD" });
    expect(r.objVN_IDA_HANG[1]!["haG_ORS"]).toBe("B01");
    expect(r.objVN_IDA["tK_OL1"]).toBe("MO");
    expect(r.objVN_IDA_VANDON["vD_COC"]).toBe(1);
    expect(b.warnings.some((w) => w.startsWith("TK_EPN"))).toBe(true);
    expect(b.issues).toEqual([]);
    expect(b.blockers).toEqual([]);
  });

  it("1.37: nhiều mã → TK_OL1..5, bỏ trùng; hàng 84/85 mà ô 1 không phải MO/CU → chặn truyền (CV 2061)", () => {
    const multi = buildFptRequest({ ...PAYLOAD, fields: { ...PAYLOAD.fields, VBPQ: { value: "CU; KT, KT" } } });
    const r = multi.request as { objVN_IDA: Record<string, unknown> };
    expect([r.objVN_IDA["tK_OL1"], r.objVN_IDA["tK_OL2"], r.objVN_IDA["tK_OL3"]]).toEqual(["CU", "KT", undefined]);
    expect(multi.blockers).toEqual([]);
    expect(buildFptRequest({ ...PAYLOAD, fields: { ...PAYLOAD.fields, VBPQ: { value: "" } } }).blockers.join(" ")).toMatch(/MO hoặc CU/);
    expect(buildFptRequest({ ...PAYLOAD, fields: { ...PAYLOAD.fields, VBPQ: { value: "KT MO" } } }).blockers).toHaveLength(1);
  });

  it("mã biểu thuế: FTA chưa có mã trong văn bản (EVFTA) → không gửi B17 (Chương 98) mà chặn truyền", () => {
    const evfta = buildFptRequest({ ...PAYLOAD, items: [{ ...PAYLOAD.items[0]!, policyNote: "Áp thuế suất ưu đãi đặc biệt EVFTA (REX)" }] });
    expect((evfta.request as { objVN_IDA_HANG: Record<string, unknown>[] }).objVN_IDA_HANG[0]!["haG_ORS"]).toBeUndefined();
    expect(evfta.blockers.join(" ")).toMatch(/Dòng 1.*EVFTA.*1\.80/);
  });

  it("khoản điều chỉnh khác (1.49) chưa gửi được → chặn truyền nêu khoản; cước/bảo hiểm không chặn", () => {
    const b = buildFptRequest({ ...PAYLOAD, adjustments: [...PAYLOAD.adjustments, { label: "Royalty", amount: "500", currency: "USD" }] });
    expect(b.blockers.join(" ")).toMatch(/1\.49: Royalty 500 USD/);
  });

  it("1.35: đường hàng không hoặc hàng CFS khai mã 3 → không gửi số lượng container", () => {
    for (const ptvc of ["1 – Đường không", "3 – Đường biển (hàng rời)"]) {
      const b = buildFptRequest({ ...PAYLOAD, fields: { ...PAYLOAD.fields, PTVC: { value: ptvc } } });
      expect((b.request as { objVN_IDA_VANDON: Record<string, unknown> }).objVN_IDA_VANDON["vD_COC"], ptvc).toBeUndefined();
    }
  });
  it("thiếu mã địa điểm lưu kho (bắt buộc VD_ST) → issues; EDA dùng buyer + container CON_C01", () => {
    const noKho = buildFptRequest({ ...PAYLOAD, fields: { ...PAYLOAD.fields, KHO: { value: "" } } });
    expect(noKho.issues.join(" ")).toMatch(/vD_ST/);
    const eda = buildFptRequest({ ...PAYLOAD, kind: "EDA", direction: "XK", fields: { ...PAYLOAD.fields, NXK_MST: { value: "0316789012" }, NGAY_DI: { value: "2026-10-20" } } });
    const r = eda.request as { objVN_EDA: Record<string, unknown>; objVN_EDA_CON: Record<string, unknown> };
    expect(r.objVN_EDA["tK_EPC"]).toBe("0316789012");
    expect(String(r.objVN_EDA["tK_CGA"]).length).toBeLessThanOrEqual(35);
    expect(r.objVN_EDA["tK_CAT"]).toMatch(/Phòng/);
    expect(r.objVN_EDA["tK_SYM"]).toBe("20/10/2026");
    expect(r.objVN_EDA["tK_IV1"]).toBe("A");
    expect(r.objVN_EDA_CON["coN_C01"]).toBe("SITU2246781");
  });

  it("EDA dòng hàng: số dòng HAG_R01 (không phải HAG_B25 của IDA); mô tả kèm “#&mã nước xuất xứ” (TT121 2.69), không nhân đôi; thiếu xuất xứ → chặn", () => {
    const base = { ...PAYLOAD, kind: "EDA" as const, direction: "XK" as const, fields: { ...PAYLOAD.fields, NXK_MST: { value: "0316789012" }, HD_PL: { value: "B – Bảng kê" } } };
    const eda = buildFptRequest({ ...base, items: [{ ...PAYLOAD.items[0]!, origin: "VN" }, { ...PAYLOAD.items[1]!, origin: "VN", description: "Thanh trượt#&VN" }] });
    const r = eda.request as { objVN_EDA: Record<string, unknown>; objVN_EDA_HANG: Record<string, unknown>[] };
    expect(r.objVN_EDA_HANG[0]).toMatchObject({ haG_R01: "01", haG_CMN: "Vòng bi cầu 6205-2RS#&VN" });
    expect(r.objVN_EDA_HANG[0]!["haG_B25"]).toBeUndefined();
    expect(r.objVN_EDA_HANG[1]!["haG_CMN"]).toBe("Thanh trượt#&VN");
    expect(r.objVN_EDA["tK_IV1"]).toBe("B");
    expect(eda.blockers).toEqual([]);
    expect(buildFptRequest({ ...base, items: [{ ...PAYLOAD.items[0]!, origin: "" }] }).blockers.join(" ")).toMatch(/Dòng 1.*2\.69/);
  });
});

describe("mask", () => {
  it("che PASSWORD/TERMINAL_ACCESS_KEY, MST giữ 4 đầu 2 cuối, điện thoại; không đổi dữ liệu khác", () => {
    const m = maskPayload({ useR_ID: "acc", pASSWORD: "s3cret", tERMINAL_ACCESS_KEY: "k", objVN_IDA: { tK_IMC: "0316789012", tK_IMT: "0225 3 888 123", tK_IMN: "AN PHÁT" }, list: [{ tK_EPC: "4100811111001" }] });
    expect(m).toEqual({ useR_ID: "acc", pASSWORD: "***", tERMINAL_ACCESS_KEY: "***", objVN_IDA: { tK_IMC: "0316****12", tK_IMT: "022***23", tK_IMN: "AN PHÁT" }, list: [{ tK_EPC: "4100****01" }] });
    expect(JSON.stringify(m)).not.toContain("s3cret");
  });
});

describe("state-machine", () => {
  it("đi đủ IDA → IDC → HYS → thông quan; lỗi giữ bước; RETRY về bước đã đạt; cạnh sai → null", () => {
    let s = next("APPROVED", "APPROVED", { type: "PRE_DECLARE_OK" })!;
    expect(s).toEqual({ state: "PRE_DECLARED", progress: "PRE_DECLARED" });
    expect(nextOperation("NK", s.progress)).toBe("IDC");
    expect(next(s.state, s.progress, { type: "DOCS_OK" })).toBeNull();
    s = next(s.state, s.progress, { type: "DECLARE_OK", channel: "YELLOW" })!;
    expect(nextOperation("NK", s.progress)).toBe("HYS");
    const failed = next(s.state, s.progress, { type: "DOCS_FAIL" })!;
    expect(failed).toEqual({ state: "SEND_FAILED", progress: "DECLARED" });
    expect(nextOperation("NK", failed.progress)).toBe("HYS");
    expect(next(failed.state, failed.progress, { type: "RETRY" })).toEqual({ state: "DECLARED", progress: "DECLARED" });
    s = next(s.state, s.progress, { type: "DOCS_OK" })!;
    expect(s).toEqual({ state: "DOCS_SENT", progress: "DOCS_SENT" });
    expect(nextOperation("NK", s.progress)).toBeNull();
    expect(next(s.state, s.progress, { type: "STATUS", cleared: false })).toEqual({ state: "INSPECTION", progress: "DOCS_SENT" });
    expect(next("INSPECTION", "DOCS_SENT", { type: "STATUS", cleared: true })).toEqual({ state: "CLEARED", progress: "DONE" });
    expect(next("CLEARED", "DONE", { type: "RETRY" })).toBeNull();
    expect(next("APPROVED", "APPROVED", { type: "STATUS", cleared: true })).toBeNull();
    expect(nextOperation("XK", "APPROVED")).toBe("EDA");
    expect(rowState("APPROVED", false, false)).toBe("READY");
    expect(rowState("DECLARED", true, true)).toBe("SENDING");
    expect(rowState("INSPECTION", true, false)).toBe("INSPECTING");
    expect(rowState("CLEARED", true, false)).toBe("CLEARED");
  });
});
