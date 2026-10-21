import { describe, expect, it } from "vitest";
import { fptKey } from "@kb/contracts";
import { buildFptRequest, lawCodesByLine, parsePermits, type DeclarationPayload } from "../declaration-to-fpt.js";
import { maskPayload } from "../mask.js";
import { coarseState, rowState, stageOf } from "../state-machine.js";

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

describe("state-machine (giai đoạn lưu ở raw.stage)", () => {
  it("stageOf: ưu tiên raw.stage; dữ liệu cũ đọc từ progress/state; chưa có kết quả → NOT_SENT", () => {
    expect(stageOf(null)).toBe("NOT_SENT");
    expect(stageOf({ state: "DECLARED", raw: { stage: "AMEND_RECALLED" } })).toBe("AMEND_RECALLED");
    expect(stageOf({ state: "INSPECTION", raw: { progress: "DOCS_SENT" } })).toBe("DECLARED");
    expect(stageOf({ state: "CLEARED", raw: { progress: "DONE" } })).toBe("CLEARED");
  });
  it("coarseState: cột state thô theo giai đoạn; lỗi gửi → SEND_FAILED", () => {
    expect(coarseState("NOT_SENT")).toBe("APPROVED");
    expect(coarseState("RECALLED")).toBe("PRE_DECLARED");
    expect(coarseState("AMEND_PRE_DECLARED")).toBe("DECLARED");
    expect(coarseState("POST_RECALLED")).toBe("CLEARED");
    expect(coarseState("DECLARED", true)).toBe("SEND_FAILED");
  });
  it("rowState cho màn danh sách", () => {
    expect(rowState("NOT_SENT", false, false)).toBe("READY");
    expect(rowState("DECLARED", true, true)).toBe("SENDING");
    expect(rowState("PRE_DECLARED", true, false)).toBe("SENDING");
    expect(rowState("DECLARED", true, false)).toBe("INSPECTING");
    expect(rowState("POST_EDITING", true, false)).toBe("CLEARED");
  });
});

describe("declaration-to-fpt – chỉ tiêu bổ sung (1.38/2.33, 1.50, 2.40, 2.43, 2.80)", () => {
  const EDA = { ...PAYLOAD, kind: "EDA" as const, direction: "XK" as const, fields: { ...PAYLOAD.fields, NXK_MST: { value: "0316789012" }, NGAY_DI: { value: "2026-10-20" }, VBPQ: { value: "" } } };
  type Req = { objVN_IDA?: Record<string, unknown>; objVN_IDA_KTG?: Record<string, unknown>; objVN_EDA?: Record<string, unknown>; objVN_EDA_HANG?: Record<string, unknown>[] };

  it("parsePermits / lawCodesByLine", () => {
    expect(parsePermits("QPGP 06GPTC17032025; mttb 08TB 18062025;")).toEqual([{ code: "QPGP", no: "06GPTC17032025" }, { code: "MTTB", no: "08TB18062025" }]);
    expect(Object.fromEntries(lawCodesByLine("xk; 2: GP, KD; 2: XK", [1, 2, 3]))).toEqual({ 1: ["XK"], 2: ["XK", "GP", "KD"], 3: ["XK"] });
    expect(Object.fromEntries(lawCodesByLine("", [1]))).toEqual({ 1: [] });
  });

  it("IDA: 1.38 → TK_SS/TK_SN (tối đa 5, cảnh báo phần dư); 1.50 → KTG_VLD", () => {
    const gp = Array.from({ length: 6 }, (_, k) => `G${k} SO${k}`).join("; ");
    const b = buildFptRequest({ ...PAYLOAD, fields: { ...PAYLOAD.fields, GP: { value: gp }, CT_TG: { value: "05102026#&HĐ số 01/2026" } } });
    const r = b.request as Req;
    expect(r.objVN_IDA).toMatchObject({ tK_SS1: "G0", tK_SN1: "SO0", tK_SS5: "G4", tK_SN5: "SO4" });
    expect(r.objVN_IDA!["tK_SS6"]).toBeUndefined();
    expect(b.warnings.join(" ")).toMatch(/5 giấy phép đầu.*G5/);
    expect(r.objVN_IDA_KTG!["ktG_VLD"]).toBe("05102026#&HĐ số 01/2026");
  });

  it("EDA: 2.40 → TK_FKK/TK_FCD; trống (FOB) → không gửi; 2.43 → TK_TPM; 2.33 → TK_SS1; 2.80 → HAG_OL theo dòng", () => {
    const b = buildFptRequest({ ...EDA, fields: { ...EDA.fields, TG_TT: { value: "19660 USD" }, NGUOI_NT: { value: "1 – Người xuất khẩu" }, GP: { value: "XK 123/GP" }, VBPQ: { value: "XK; 2: KD" } } });
    const r = b.request as Req;
    expect(r.objVN_EDA).toMatchObject({ tK_FKK: 19660, tK_FCD: "USD", tK_TPM: "1", tK_SS1: "XK", tK_SN1: "123/GP" });
    expect(r.objVN_EDA_HANG![0]).toMatchObject({ haG_OL1: "XK" });
    expect(r.objVN_EDA_HANG![0]!["haG_OL2"]).toBeUndefined();
    expect(r.objVN_EDA_HANG![1]).toMatchObject({ haG_OL1: "XK", haG_OL2: "KD" });
    const fob = buildFptRequest(EDA).request as Req;
    expect(fob.objVN_EDA!["tK_FKK"]).toBeUndefined();
    expect(fob.objVN_EDA_HANG![0]!["haG_OL1"]).toBeUndefined();
  });
});

describe("declaration-to-fpt – chỉ tiêu theo tình huống", () => {
  type Req = { objVN_IDA?: Record<string, unknown>; objVN_IDA_VANDON?: Record<string, unknown>; objVN_EDA?: Record<string, unknown>; objVN_EDA_CON?: Record<string, unknown> | null };
  it("IDA: 1.3 → TK_TDN, 1.10 → TK_RED, hô hiệu → VD_VSC, 1.35 đã sửa → VD_COC", () => {
    const r = buildFptRequest({ ...PAYLOAD, fields: { ...PAYLOAD.fields, TNTX_TK: { value: "305123456780" }, HAN_TX: { value: "2027-01-31" }, HO_HIEU: { value: "3WAB9" }, SL_CONT: { value: "2" } } }).request as Req;
    expect(r.objVN_IDA).toMatchObject({ tK_TDN: 305123456780, tK_RED: "31/01/2027" });
    expect(r.objVN_IDA_VANDON).toMatchObject({ vD_VSC: "3WAB9", vD_COC: 2 });
    // Đổi sang đường hàng không sau khi dựng: hô hiệu cũ không gửi.
    const air = buildFptRequest({ ...PAYLOAD, fields: { ...PAYLOAD.fields, PTVC: { value: "1 – Đường hàng không" }, HO_HIEU: { value: "9999" } } }).request as Req;
    expect(air.objVN_IDA_VANDON!["vD_VSC"]).toBeUndefined();
    const plain = buildFptRequest(PAYLOAD).request as Req;
    expect(plain.objVN_IDA!["tK_TDN"]).toBeUndefined();
    expect(plain.objVN_IDA_VANDON!["vD_COC"]).toBe(1);
  });
  it("IDA 1.22: địa chỉ người khai chia dòng trên form (có xuống dòng) → gửi đúng ô TK_EPA..EP4", () => {
    const r = buildFptRequest({ ...PAYLOAD, fields: { ...PAYLOAD.fields, NXK_DC: { value: "51 CHANGI BUSINESS PARK\n\nSINGAPORE\n486066" } } }).request as Req;
    expect(r.objVN_IDA).toMatchObject({ tK_EPA: "51 CHANGI BUSINESS PARK", tK_EP3: "SINGAPORE", tK_EP4: "486066" });
    expect(r.objVN_IDA!["tK_EP2"] ?? "").toBe("");
  });
  it("EDA: 2.3 → TK_TDN, 2.7 → TK_RID, hô hiệu → TK_VSC, 2.60 đã sửa → CON_C01..", () => {
    const EDA = { ...PAYLOAD, kind: "EDA" as const, direction: "XK" as const, fields: { ...PAYLOAD.fields, NXK_MST: { value: "0316789012" }, NGAY_DI: { value: "2026-10-20" }, VBPQ: { value: "" } } };
    const r = buildFptRequest({ ...EDA, fields: { ...EDA.fields, TNTX_TK: { value: "105000000010" }, HAN_TN: { value: "2027-03-01" }, HO_HIEU: { value: "9999" }, SO_CONT: { value: "AAAU1234567, BBBU7654321" } } }).request as Req;
    expect(r.objVN_EDA).toMatchObject({ tK_TDN: 105000000010, tK_RID: "01/03/2027", tK_VSC: "9999" });
    expect(r.objVN_EDA_CON).toMatchObject({ coN_C01: "AAAU1234567", coN_C02: "BBBU7654321" });
  });
});

describe("declaration-to-fpt – ô bổ sung người khai nhập trên form đầy đủ (mã = tên trường VNACCS)", () => {
  type Req = { objVN_IDA: Record<string, unknown>; objVN_IDA_VANDON: Record<string, unknown>; objVN_IDA_KTG: Record<string, unknown>; objVN_EDA?: Record<string, unknown>; objVN_EDA_CON?: Record<string, unknown> | null };
  it("IDA: vào đúng object, đổi kiểu theo đặc tả, ghi đè mặc định (TK_CHB, TK_IMY – bỏ cảnh báo); ô APP_* không gửi; vẫn hợp lệ Zod", () => {
    const b = buildFptRequest({ ...PAYLOAD, fields: { ...PAYLOAD.fields, TK_CCC: { value: "B" }, TK_CHB: { value: "01" }, TK_IMY: { value: "180000" }, TK_BYA: { value: "2026" }, VD_BL2: { value: "HAWB-2" }, VD_ISD: { value: "2026-10-16" }, KTG_IN4: { value: "BH-01" }, APP_HAWB1: { value: "H1" } } });
    const r = b.request as Req;
    expect(r.objVN_IDA).toMatchObject({ tK_CCC: "B", tK_CHB: "01", tK_IMY: "180000", tK_BYA: 2026 });
    expect(r.objVN_IDA_VANDON).toMatchObject({ vD_BL2: "HAWB-2", vD_ISD: "16/10/2026" });
    expect(r.objVN_IDA_KTG[fptKey("KTG_IN4")]).toBe("BH-01");
    expect(JSON.stringify(r)).not.toContain("H1\"");
    expect(b.warnings.some((w) => w.startsWith("TK_IMY"))).toBe(false);
    expect(b.issues).toEqual([]);
  });
  it("EDA: ô địa điểm xếp hàng lên container (2.60) gửi object CON kể cả khi chưa có số container", () => {
    const b = buildFptRequest({ ...PAYLOAD, kind: "EDA", direction: "XK", containers: [], fields: { ...PAYLOAD.fields, NXK_MST: { value: "0316789012" }, VBPQ: { value: "" }, TK_CGC: { value: "KR123" }, CON_VN: { value: "KHO A" } } });
    const r = b.request as Req;
    expect(r.objVN_EDA?.["tK_CGC"]).toBe("KR123");
    expect(r.objVN_EDA_CON?.[fptKey("CON_VN")]).toBe("KHO A");
  });
});

describe("declaration-to-fpt – Đợt 5: chỉ tiêu theo tình huống người khai nhập (ô bổ sung)", () => {
  type Obj = Record<string, unknown>;
  type Req = { objVN_IDA: Obj; objVN_IDA_VANDON: Obj; objVN_EDA?: Obj };
  const EDA: DeclarationPayload = { ...PAYLOAD, kind: "EDA", direction: "XK", fields: { ...PAYLOAD.fields, NXK_MST: { value: "0316789012" }, NXK_DT: { value: "0225 3 888 123" }, NGAY_DI: { value: "2026-10-20" }, VBPQ: { value: "" } } };
  const withFields = (p: DeclarationPayload, extra: Record<string, string>) => buildFptRequest({ ...p, fields: { ...p.fields, ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, { value: v }])) } });

  it.each([["IDA", PAYLOAD, "objVN_IDA"], ["EDA", EDA, "objVN_EDA"]] as const)("%s 1.40/2.35 → TK_IV2 (số) chỉ khi 1.39/2.34 = D; mã khác thì không gửi dù đã nhập", (_k, base, obj) => {
    const d = withFields(base, { HD_PL: "D – Hóa đơn điện tử (đăng ký trên VNACCS)", TK_IV2: "100000012345" });
    expect((d.request as unknown as Record<string, Obj>)[obj]).toMatchObject({ tK_IV1: "D", tK_IV2: 100000012345 });
    expect(d.issues).toEqual([]);
    const a = withFields(base, { HD_PL: "A – Hóa đơn thương mại", TK_IV2: "100000012345" });
    expect((a.request as unknown as Record<string, Obj>)[obj]!["tK_IV2"]).toBeUndefined();
  });

  it("IDA: ủy thác / tại chỗ (1.17–1.19, 1.24), nộp thuế – hạn mức – bảo lãnh (1.53–1.62), kho ngoại quan (1.64), vận chuyển kết hợp (1.65–1.67) → đúng trường FPT, đúng kiểu", () => {
    const b = withFields(PAYLOAD, {
      TK_NMC: "0101234567", TK_NMN: "CÔNG TY ỦY THÁC", TK_EPC: "0309876543", TK_ENM: "FOREIGN NOMINATOR LTD",
      TK_BP: "A", TK_BRC: "01201001", TK_BYA: "2026", TK_BCM: "HM", TK_BCN: "0001", TK_ENC: "C", TK_SBC: "79202001", TK_RYA: "2026", TK_SCM: "BL", TK_SCN: "0002",
      VD_ISD: "2026-10-16", TK_DPD: "2026-10-17", TK_ST1: "02CIS01", TK_AD1: "2026-10-18", TK_SD1: "2026-10-19", TK_ARP: "03CCS01", TK_ADT: "2026-10-20",
    });
    const r = b.request as Req;
    expect(r.objVN_IDA).toMatchObject({
      tK_NMC: "0101234567", tK_NMN: "CÔNG TY ỦY THÁC", tK_EPC: "0309876543", tK_ENM: "FOREIGN NOMINATOR LTD",
      tK_BP: "A", tK_BRC: "01201001", tK_BYA: 2026, tK_BCM: "HM", tK_BCN: "0001", tK_ENC: "C", tK_SBC: "79202001", tK_RYA: 2026, tK_SCM: "BL", tK_SCN: "0002",
      tK_DPD: "17/10/2026", tK_ST1: "02CIS01", tK_AD1: "18/10/2026", tK_SD1: "19/10/2026", tK_ARP: "03CCS01", tK_ADT: "20/10/2026",
    });
    expect(r.objVN_IDA_VANDON["vD_ISD"]).toBe("16/10/2026");
    expect(b.issues).toEqual([]);
  });

  it("EDA: ủy thác / tại chỗ (2.16–2.18), hạn mức – thời hạn nộp thuế – bảo lãnh (2.44–2.52), vận chuyển kết hợp (2.54–2.56)", () => {
    const b = withFields(EDA, {
      TK_EXC: "0101234567", TK_EXN: "CÔNG TY ỦY THÁC XK", TK_CGC: "0309876543",
      TK_BRC: "01201001", TK_BYA: "2026", TK_BCM: "HM", TK_BCN: "0001", TK_ENC: "D", TK_SBC: "79202001", TK_RYA: "2026", TK_SCM: "BL", TK_SCN: "0002",
      TK_DPD: "2026-10-17", TK_ST1: "02CIS01", TK_ARP: "03CCS01", TK_ADT: "2026-10-20",
    });
    expect((b.request as Req).objVN_EDA).toMatchObject({
      tK_EXC: "0101234567", tK_EXN: "CÔNG TY ỦY THÁC XK", tK_CGC: "0309876543",
      tK_BRC: "01201001", tK_BYA: 2026, tK_BCM: "HM", tK_BCN: "0001", tK_ENC: "D", tK_SBC: "79202001", tK_RYA: 2026, tK_SCM: "BL", tK_SCN: "0002",
      tK_DPD: "17/10/2026", tK_ST1: "02CIS01", tK_ARP: "03CCS01", tK_ADT: "20/10/2026",
    });
    expect(b.issues).toEqual([]);
  });

  it("chưa nhập (hoặc chỉ khoảng trắng) → không gửi trường nào", () => {
    const keys = ["TK_NMC", "TK_EPC", "TK_ENM", "TK_BP", "TK_BRC", "TK_BYA", "TK_ENC", "TK_SBC", "TK_DPD", "TK_ST1", "TK_ARP", "TK_IV2"];
    const r = withFields(PAYLOAD, { TK_ENC: " ", TK_BYA: "" }).request as Req;
    for (const k of keys) expect(r.objVN_IDA[fptKey(k)], k).toBeUndefined();
    expect(r.objVN_IDA_VANDON["vD_ISD"]).toBeUndefined();
  });
});

describe("declaration-to-fpt – ô dòng hàng người khai nhập (HANG.<id dòng>.<ô>)", () => {
  type Req = { objVN_IDA_HANG: Record<string, unknown>[] };
  const withIds = { ...PAYLOAD, items: PAYLOAD.items.map((it, i) => ({ ...it, id: `li${i + 1}` })) };
  it("ghi đè giá trị tự điền đúng dòng (theo id), đổi kiểu số; ô người khai nhập thêm được gửi", () => {
    const b = buildFptRequest({ ...withIds, fields: { ...withIds.fields, "HANG.li2.HAG_QN2": { value: "12.5" }, "HANG.li2.HAG_RE": { value: "XN210" }, "HANG.li1.HAG_TX5": { value: "VB905" } } });
    const r = b.request as Req;
    expect(r.objVN_IDA_HANG[1]?.[fptKey("HAG_QN2")]).toBe(12.5);
    expect(r.objVN_IDA_HANG[1]?.[fptKey("HAG_RE")]).toBe("XN210");
    expect(r.objVN_IDA_HANG[0]?.[fptKey("HAG_QN2")]).toBe(2000);
    expect(r.objVN_IDA_HANG[0]?.[fptKey("HAG_TX5")]).toBe("VB905");
    expect(b.issues).toEqual([]);
  });
  it("FTA chưa có mã biểu thuế: chặn truyền, trừ khi người khai nhập 1.80 cho dòng", () => {
    const evfta = { ...withIds, items: withIds.items.map((it) => ({ ...it, policyNote: "EVFTA" })) };
    expect(buildFptRequest(evfta).blockers.filter((x) => x.includes("1.80"))).toHaveLength(2);
    const fixed = buildFptRequest({ ...evfta, fields: { ...evfta.fields, "HANG.li1.HAG_ORS": { value: "B30" }, "HANG.li2.HAG_ORS": { value: "B30" } } });
    expect(fixed.blockers.filter((x) => x.includes("1.80"))).toEqual([]);
    expect((fixed.request as Req).objVN_IDA_HANG[0]?.[fptKey("HAG_ORS")]).toBe("B30");
  });
});
