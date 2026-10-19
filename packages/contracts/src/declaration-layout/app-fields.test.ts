import { describe, expect, it } from "vitest";
import { appFieldMeta, declarationEditMode, declarationFormValues, editableFormKeys, extraFieldFpt, extraFieldIssue, extraFieldMeta, fieldEditBlock, formKeyLock, isExtraFieldKey, pendingFormEdits } from "./index.js";

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
