import { describe, expect, it } from "vitest";
import { allocatedAdjustmentNos, NO_INSURANCE_VALUE } from "../dto/value-charges.js";
import { itemFormValues, appFieldMeta, declarationEditMode, declarationEditScope, declarationFormValues, editableFormKeys, editBlockFor, extraFieldFpt, extraFieldIssue, extraFieldMeta, fieldEditBlock, formKeyLock, isExtraFieldKey, pendingFormEdits, sheetOfLine, splitAddressLines } from "./index.js";
import type { CustomsStage } from "../customs-flow.js";

const f = (code: string, value: string) => ({ code, value });
const FIELDS = [f("MA_LH", "A11"), f("PTVC", "1"), f("CQHQ", "02B1"), f("NNK_MST", "0101234567"), f("NNK_TEN", "CONG TY A"), f("NXK_TEN", "SAMSUNG"), f("SO_HD", "INV-1"), f("SO_VD", "MAWB1"), f("CANG_DO", "VNHPH – CANG HAI PHONG"), f("GHI_CHU", "")];

describe("declarationEditMode – sửa theo giai đoạn tờ khai", () => {
  it("chưa khai báo (chưa khai tạm / khai tạm gọi về sửa IDB) → sửa mọi ô người khai", () => {
    expect(declarationEditMode("DRAFT", "NOT_SENT")).toBe("FULL");
    expect(declarationEditMode("DRAFT", "RECALLED")).toBe("FULL");
  });
  it("đã phân luồng, gọi về sửa đổi bổ sung (IDD) → khóa theo Phụ lục II", () => {
    expect(declarationEditMode("DRAFT", "AMEND_RECALLED")).toBe("AMEND");
  });
  it("đã thông quan (kể cả đang khai AMA) / bị từ chối / chưa phải nháp → khóa toàn bộ", () => {
    for (const s of ["CLEARED", "POST_EDITING", "POST_PRE_DECLARED", "POST_RECALLED", "REJECTED"] as const) expect(declarationEditMode("DRAFT", s)).toBe("LOCKED");
    expect(declarationEditMode("APPROVED", "NOT_SENT")).toBe("LOCKED");
    expect(declarationEditMode("SUBMITTED", "DECLARED")).toBe("LOCKED");
  });
});

describe("ô bổ sung – ô người khai nhập chưa có mã app, lưu theo tên trường VNACCS", () => {
  it("có nhãn, số chỉ tiêu, nhóm; ô Hải quan trả về / ô có mã app / ô tính từ chứng từ không phải ô bổ sung", () => {
    expect(extraFieldMeta("IDA", "TK_CCC")).toMatchObject({ no: "1.5", section: "GENERAL" });
    expect(extraFieldMeta("IDA", "TK_NMC")).toMatchObject({ no: "1.17", section: "PARTIES" });
    expect(extraFieldMeta("EDA", "TK_CGC")).toMatchObject({ no: "2.18" });
    for (const k of ["TK_IMC", "TK_ICB", "VD_GWT", "KTG_FR3", "KTG_VP1", "APP_NHOM_LH", "TK_ICN"]) expect(isExtraFieldKey("IDA", k)).toBe(false);
  });
  it("ô bổ sung đọc lên form nguyên giá trị", () => {
    expect(declarationFormValues("IDA", [...FIELDS, f("TK_CCC", "B")])).toMatchObject({ TK_CCC: "B", TK_IMC: "0101234567" });
  });
});

describe("editableFormKeys / formKeyLock", () => {
  const values = declarationFormValues("IDA", FIELDS);
  it("FULL: mọi ô người khai (cả ô bổ sung chưa có giá trị) trừ ô tính từ chứng từ", () => {
    const keys = editableFormKeys("IDA", "FULL", values);
    for (const [k, code] of [["TK_MTC", "PTVC"], ["TK_IMC", "NNK_MST"], ["TK_IMN", "NNK_TEN"], ["TK_CCC", "TK_CCC"], ["TK_ICC", "TK_ICC"], ["VD_BL2", "VD_BL2"]]) expect(keys.get(k!)).toBe(code);
    for (const k of ["TK_ICB", "TK_IP4", "VD_GWT", "KTG_FR3"]) expect(keys.has(k)).toBe(false);
    // Chỉ tiêu app chưa có trên tờ khai (số điện thoại NK) vẫn nhập được – lưu thì thêm vào tờ khai.
    expect(keys.get("TK_IMT")).toBe("NNK_DT");
  });
  it("AMEND: khóa mục 3.1 (loại hình, PLHH, PTVC, CQHQ, MST NK, đại lý), mục 4 (tên NK, kho), ô phần mềm khóa (người XK); còn lại sửa được", () => {
    const keys = editableFormKeys("IDA", "AMEND", values);
    for (const k of ["TK_CCC", "TK_MTC", "TK_CH", "TK_IMC", "TK_ICC", "TK_IMN", "TK_EPN", "VD_ST"]) expect(keys.has(k)).toBe(false);
    for (const k of ["TK_IV3", "VD_BL1", "VD_DST", "TK_NMC", "TK_NT2"]) expect(keys.has(k)).toBe(true);
    expect(formKeyLock("IDA", "TK_MTC", "AMEND", values)?.basis).toBe("LAW");
    expect(formKeyLock("IDA", "TK_IMN", "AMEND", values)?.basis).toBe("SYSTEM");
    expect(formKeyLock("IDA", "TK_MTC", "FULL", values)).toBeNull();
  });
  it("AMEND + đã đề nghị giải phóng hàng (1.53): khóa thêm vận đơn, cảng, ngày đến… (mục 3.2); tên cảng khóa theo mã cảng", () => {
    const bp = { ...values, TK_BP: "A" };
    const keys = editableFormKeys("IDA", "AMEND", bp);
    for (const k of ["VD_BL1", "VD_BL2", "VD_DST", "VD_DSN", "TK_IV1", "TK_SBC"]) expect(keys.has(k)).toBe(false);
    expect(formKeyLock("IDA", "VD_DSN", "AMEND", bp)?.reason).toMatch(/3\.2/);
    expect(keys.has("TK_IV3")).toBe(true);
  });
  it("LOCKED: không ô nào", () => {
    expect(editableFormKeys("IDA", "LOCKED", values).size).toBe(0);
  });
});

describe("fieldEditBlock – backend chặn lần nữa khi lưu", () => {
  it("LOCKED chặn mọi chỉ tiêu; FULL không chặn", () => {
    expect(fieldEditBlock("IDA", "SO_HD", "LOCKED", FIELDS)).toMatch(/AMA/);
    expect(fieldEditBlock("IDA", "PTVC", "FULL", FIELDS)).toBeNull();
  });
  it("AMEND: chặn chỉ tiêu có ô bị khóa theo Phụ lục II, kể cả ô bổ sung; cho chỉ tiêu được khai bổ sung", () => {
    expect(fieldEditBlock("IDA", "PTVC", "AMEND", FIELDS)).toMatch(/3\.1/);
    expect(fieldEditBlock("IDA", "TK_CCC", "AMEND", FIELDS)).toMatch(/3\.1/);
    expect(fieldEditBlock("EDA", "NNK_TEN", "AMEND", [f("NNK_TEN", "X")])).toMatch(/Phần mềm/);
    expect(fieldEditBlock("IDA", "SO_HD", "AMEND", FIELDS)).toBeNull();
    expect(fieldEditBlock("IDA", "SO_VD", "AMEND", [...FIELDS, f("TK_BP", "A")])).toMatch(/3\.2/);
  });
});

describe("pendingFormEdits – ô bổ sung lưu theo tên trường, bỏ khoảng trắng thừa", () => {
  it("chỉ gửi ô đã đổi", () => {
    const original = declarationFormValues("IDA", FIELDS);
    const keys = editableFormKeys("IDA", "FULL", original);
    expect(pendingFormEdits("IDA", original, { ...original, TK_CCC: " B ", TK_IV3: "INV-2" }, keys)).toEqual(expect.arrayContaining([{ code: "TK_CCC", value: "B" }, { code: "SO_HD", value: "INV-2" }]));
    expect(pendingFormEdits("IDA", original, original, keys)).toEqual([]);
  });
});

describe("địa chỉ 4 dòng (1.22 TK_EPA..EP4) – giữ đúng dòng người khai nhập", () => {
  const ADDR = [f("NXK_DC", "51 CHANGI BUSINESS PARK CENTRAL 2")];
  const edit = (draft: Record<string, string>) => {
    const original = declarationFormValues("IDA", ADDR);
    return pendingFormEdits("IDA", original, { ...original, ...draft }, editableFormKeys("IDA", "FULL", original));
  };
  const lines = (v: Record<string, string>) => [v["TK_EPA"], v["TK_EP2"], v["TK_EP3"], v["TK_EP4"]];

  it("nhập dòng 3, dòng 4 → lưu xong vẫn ở dòng 3, dòng 4", () => {
    const [saved] = edit({ TK_EP3: "SINGAPORE", TK_EP4: "486066" });
    expect(saved?.code).toBe("NXK_DC");
    expect(lines(declarationFormValues("IDA", [saved!]))).toEqual(["51 CHANGI BUSINESS PARK CENTRAL 2", undefined, "SINGAPORE", "486066"]);
  });

  it("địa chỉ không tách dòng riêng vẫn lưu một chuỗi (cắt tự động 35 ký tự như cũ)", () => {
    expect(edit({ TK_EPA: "51 CHANGI BUSINESS PARK CENTRAL 3" })).toEqual([{ code: "NXK_DC", value: "51 CHANGI BUSINESS PARK CENTRAL 3" }]);
    expect(lines(declarationFormValues("IDA", [f("NXK_DC", "123 SAMSUNG-RO, YEONGTONG-GU, SUWON-SI, GYEONGGI-DO")]))).toEqual(["123 SAMSUNG-RO, YEONGTONG-GU,", "SUWON-SI, GYEONGGI-DO", undefined, undefined]);
  });

  it("splitAddressLines: chuỗi có xuống dòng → đúng dòng; quá số ô → dồn vào ô cuối", () => {
    expect(splitAddressLines("A\n\nC", 4)).toEqual(["A", "", "C"]);
    expect(splitAddressLines("A\nB\nC\nD\nE", 4)).toEqual(["A", "B", "C", "D E"]);
  });
});

describe("extraFieldFpt / extraFieldIssue – ô bổ sung khi truyền FPT", () => {
  it("ô bổ sung thuộc đúng object FPT; ô APP_* chỉ lưu trong app", () => {
    expect(extraFieldFpt("IDA", "TK_CCC")?.object).toBe("objVN_IDA");
    expect(extraFieldFpt("IDA", "VD_BL2")?.object).toBe("objVN_IDA_VANDON");
    expect(extraFieldFpt("IDA", "KTG_IN4")?.object).toBe("objVN_IDA_KTG");
    expect(extraFieldFpt("EDA", "CON_VN")?.object).toBe("objVN_EDA_CON");
    expect(extraFieldFpt("IDA", "APP_HAWB1")).toBeNull();
    expect(extraFieldFpt("IDA", "TK_IMC")).toBeNull();
  });
  it("kiểm tra kiểu số / ngày / độ dài theo đặc tả", () => {
    expect(extraFieldIssue("IDA", "TK_BYA", "2026")).toBeNull();
    expect(extraFieldIssue("IDA", "TK_BYA", "năm 26")).toMatch(/số nguyên/);
    expect(extraFieldIssue("IDA", "TK_TP", "1,5")).toMatch(/số/);
    expect(extraFieldIssue("IDA", "TK_CCC", "AB")).toMatch(/vượt giới hạn 1/);
    expect(extraFieldIssue("IDA", "TK_CCC", "")).toBeNull();
  });
});

describe("appFieldMeta – chỉ tiêu app chưa có trên tờ khai", () => {
  it("lấy nhãn, số, nhóm theo ô trên form", () => {
    expect(appFieldMeta("IDA", "NNK_DT")).toMatchObject({ no: "1.16", section: "PARTIES" });
    expect(appFieldMeta("IDA", "NOPE")).toBeNull();
  });
});

describe("chi phí trị giá (1.47–1.49) → ô KTG và 1.88 dòng hàng", () => {
  it("cước / bảo hiểm → mã phân loại A + mã tiền + số tiền; không mua bảo hiểm → D; khoản điều chỉnh → từng dòng + Phân bổ phí", () => {
    const v = declarationFormValues("IDA", [f("PHI_VC", "1150 USD"), f("PHI_BH", NO_INSURANCE_VALUE), f("KHOAN_DC", "A AD 100 USD; G SB 20.5 USD KPB")]);
    expect(v).toMatchObject({ KTG_FR1: "A", KTG_FR2: "USD", KTG_FR3: "1150", KTG_IN1: "D", KTG_VR1: "A", KTG_VI1: "AD", KTG_VP1: "100", APP_PB1: "1", KTG_VR2: "G", KTG_VI2: "SB", KTG_VP2: "20.5" });
    expect(v["APP_PB2"]).toBeUndefined();
    expect(v["KTG_IN3"]).toBeUndefined();
  });
  it("1.88 mỗi dòng = số thứ tự các khoản được phân bổ; không có khoản → trống", () => {
    const items = [{ id: "li1", description: "X", quantity: "1", unit: "PCE", unitPrice: "1", amount: "1", origin: "CN" }, { id: "li2", description: "Y", quantity: "1", unit: "PCE", unitPrice: "1", amount: "1", origin: "CN" }];
    const rows = itemFormValues("IDA", items, { currency: "USD", fields: [f("KHOAN_DC", "A AD 100 USD; G SB 20 USD KPB; E AD 5 USD")] });
    expect(rows.map((r) => [r["HAG_VN1"], r["HAG_VN2"], r["HAG_VN3"]])).toEqual([["1", "3", undefined], ["1", "3", undefined]]);
    expect(allocatedAdjustmentNos("")).toEqual([]);
    expect(itemFormValues("IDA", items, { currency: "USD", fields: [] })[0]?.["HAG_VN1"]).toBeUndefined();
  });
});

describe("declarationEditScope / editBlockFor / sheetOfLine – phạm vi sửa theo tờ đã gọi về (lô nhiều tờ)", () => {
  const sh = (no: number, stage: CustomsStage, declarationNo: string | null = "10001") => ({ no, stage, declarationNo });
  it("chỉ tờ 2 gọi về, tờ 1, 3 còn hiệu lực → khóa chỉ tiêu chung, chỉ sửa dòng tờ 2, không thêm/xóa dòng", () => {
    expect(declarationEditScope("DRAFT", [sh(1, "PRE_DECLARED"), sh(2, "RECALLED"), sh(3, "PRE_DECLARED")])).toEqual({
      common: "LOCKED", lines: { 1: "LOCKED", 2: "FULL", 3: "LOCKED" }, addRemoveLines: false, lockedSheets: [1, 3],
    });
  });
  it("gọi về tất cả → sửa toàn bộ như cũ", () => {
    expect(declarationEditScope("DRAFT", [sh(1, "RECALLED"), sh(2, "RECALLED"), sh(3, "RECALLED")])).toEqual({
      common: "FULL", lines: { 1: "FULL", 2: "FULL", 3: "FULL" }, addRemoveLines: true, lockedSheets: [],
    });
  });
  it("tờ 2 gọi về sửa đổi bổ sung, tờ 3 đã thông quan → chung AMEND (chặt nhất); dòng tờ 3 khóa; không tờ nào còn hiệu lực", () => {
    const s = declarationEditScope("DRAFT", [sh(1, "RECALLED"), sh(2, "AMEND_RECALLED"), sh(3, "CLEARED")]);
    expect(s).toMatchObject({ common: "AMEND", lines: { 1: "FULL", 2: "AMEND", 3: "LOCKED" }, lockedSheets: [] });
  });
  it("tờ chưa từng gửi → sửa được như tờ đã gọi về", () => {
    const s = declarationEditScope("DRAFT", [sh(1, "RECALLED"), sh(2, "RECALLED"), sh(3, "NOT_SENT", null)]);
    expect(s.common).toBe("FULL");
    expect(s.lines[3]).toBe("FULL");
  });
  it("tờ khai không còn nháp → khóa mọi thứ", () => {
    expect(declarationEditScope("APPROVED", [sh(1, "RECALLED"), sh(2, "RECALLED")])).toEqual({
      common: "LOCKED", lines: { 1: "LOCKED", 2: "LOCKED" }, addRemoveLines: false, lockedSheets: [],
    });
  });
  it("lô một tờ: đúng declarationEditMode như cũ", () => {
    expect(declarationEditScope("DRAFT", [sh(1, "RECALLED")])).toEqual({ common: "FULL", lines: { 1: "FULL" }, addRemoveLines: true, lockedSheets: [] });
    expect(declarationEditScope("DRAFT", [sh(1, "AMEND_RECALLED")]).common).toBe("AMEND");
    expect(declarationEditScope("DRAFT", [sh(1, "PRE_DECLARED")])).toEqual({ common: "LOCKED", lines: { 1: "LOCKED" }, addRemoveLines: false, lockedSheets: [] });
    expect(declarationEditScope("DRAFT", []).common).toBe("FULL");
  });
  it("editBlockFor: lý do theo từng đích sửa", () => {
    const partial = declarationEditScope("DRAFT", [sh(1, "PRE_DECLARED"), sh(2, "RECALLED"), sh(3, "PRE_DECLARED")]);
    const common = { reasonCode: "COMMON_LOCKED_SHEETS", params: { sheets: "1, 3" } };
    expect(editBlockFor(partial, { kind: "COMMON" })).toEqual(common);
    expect(editBlockFor(partial, { kind: "REBUILD" })).toEqual(common);
    expect(editBlockFor(partial, { kind: "ADD_REMOVE_LINES" })).toEqual(common);
    expect(editBlockFor(partial, { kind: "LINE", sheet: 2 })).toBeNull();
    expect(editBlockFor(partial, { kind: "LINE", sheet: 1 })).toEqual({ reasonCode: "LINE_SHEET_LOCKED", params: { sheet: 1 } });
    const cleared = declarationEditScope("DRAFT", [sh(1, "RECALLED"), sh(2, "CLEARED")]);
    expect(editBlockFor(cleared, { kind: "LINE", sheet: 2 })).toEqual({ reasonCode: "LINE_SHEET_LOCKED", params: { sheet: 2 } });
    expect(editBlockFor(cleared, { kind: "COMMON" })).toBeNull();
    const all = declarationEditScope("DRAFT", [sh(1, "RECALLED"), sh(2, "RECALLED")]);
    for (const t of [{ kind: "COMMON" }, { kind: "REBUILD" }, { kind: "ADD_REMOVE_LINES" }, { kind: "LINE", sheet: 2 }] as const) expect(editBlockFor(all, t)).toBeNull();
    const approved = declarationEditScope("APPROVED", [sh(1, "RECALLED"), sh(2, "RECALLED")]);
    expect(editBlockFor(approved, { kind: "COMMON" })).toEqual({ reasonCode: "DECLARATION_LOCKED", params: {} });
    expect(editBlockFor(approved, { kind: "LINE", sheet: 1 })).toEqual({ reasonCode: "DECLARATION_LOCKED", params: {} });
    const single = declarationEditScope("DRAFT", [sh(1, "PRE_DECLARED")]);
    expect(editBlockFor(single, { kind: "LINE", sheet: 1 })).toEqual({ reasonCode: "DECLARATION_LOCKED", params: {} });
    // Tờ không có trong danh sách (vd dòng thứ 51 của lô một tờ cũ) → theo chỉ tiêu chung.
    expect(editBlockFor(declarationEditScope("DRAFT", [sh(1, "RECALLED")]), { kind: "LINE", sheet: 2 })).toBeNull();
  });
  it("sheetOfLine: tờ của dòng theo thứ tự lineNo, 50 dòng một tờ", () => {
    const lineNos = Array.from({ length: 120 }, (_, i) => 120 - i);
    expect(sheetOfLine(lineNos, 1)).toBe(1);
    expect(sheetOfLine(lineNos, 50)).toBe(1);
    expect(sheetOfLine(lineNos, 51)).toBe(2);
    expect(sheetOfLine(lineNos, 120)).toBe(3);
    expect(sheetOfLine([10, 20, 30], 999)).toBe(1);
  });
});
