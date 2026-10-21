import { describe, expect, it } from "vitest";
import { VN_EDA_FIELDS, VN_EDA_HANG_FIELDS } from "../fpt/eda.js";
import { VN_IDA_FIELDS, VN_IDA_HANG_FIELDS, VN_IDA_KTG_FIELDS, VN_IDA_VANDON_FIELDS } from "../fpt/ida.js";
import { expandRepeat, fieldRole, itemFormValues, layoutFor, requiredGaps, requiredGapsText, type LayoutBlock } from "./index.js";

type Kind = "IDA" | "EDA";

/** Ô FPT bắt buộc mà declaration-to-fpt / itemDefaults tự điền khi trống – người khai không phải nhập. */
const AUTO_FILLED: Record<Kind, string[]> = {
  IDA: ["TK_CHB", "TK_IMY", "TK_IP1", "TK_IP3", "VD_GWT", "HAG_QN2", "HAG_QT2", "HAG_UPC"],
  EDA: ["TK_CHB", "HAG_QN2", "HAG_QT2", "HAG_UPC"],
};
const FPT_REQUIRED: Record<Kind, string[]> = {
  IDA: [...VN_IDA_FIELDS, ...VN_IDA_HANG_FIELDS, ...VN_IDA_VANDON_FIELDS, ...VN_IDA_KTG_FIELDS].filter((f) => f.required).map((f) => f.name),
  EDA: [...VN_EDA_FIELDS, ...VN_EDA_HANG_FIELDS].filter((f) => f.required).map((f) => f.name),
};

/** Mỗi ô người khai trên form kèm số chỉ tiêu của nhóm chứa ô. */
function formFields(blocks: LayoutBlock[]) {
  return blocks.flatMap((b) => b.items.flatMap((it) =>
    it.kind === "field" ? [{ f: it, no: undefined }] : (it.kind === "group" ? it.fields : (expandRepeat(it)[0] ?? [])).map((f) => ({ f, no: it.no }))));
}

/** Giá trị đủ mọi ô bắt buộc (tờ khai nhập kinh doanh A11 / xuất B11, giá CIF). */
function complete(kind: Kind) {
  const base = kind === "IDA" ? { TK_ICB: "A11", TK_MTC: "1", TK_IP2: "CIF", TK_IV3: "INV-1" } : { TK_ECB: "B11", TK_MTC: "1", TK_IP2: "CIF", TK_IV3: "INV-1" };
  const decl: Record<string, string> = { ...base };
  for (const g of requiredGaps(kind, decl, [])) decl[g.key] ||= "X";
  const item: Record<string, string> = {};
  for (const g of requiredGaps(kind, decl, [item])) if (g.line === 0) item[g.key] = "1";
  return { decl, item };
}

describe("ô FPT bắt buộc trên form", () => {
  it.each(["IDA", "EDA"] as const)("%s: mọi ô FPT bắt buộc người khai nhập đều là Bắt buộc, trừ ô phần mềm tự điền", (kind) => {
    const L = layoutFor(kind);
    const onForm = formFields([...L.declarant.flatMap((s) => s.blocks), ...L.item.declarant]).filter(({ f }) => FPT_REQUIRED[kind].includes(f.key) && f.origin !== "CUSTOMS");
    const notRequired = onForm.filter(({ f, no }) => fieldRole(kind, f, no) !== "REQUIRED" && !AUTO_FILLED[kind].includes(f.key)).map(({ f }) => f.key);
    expect(notRequired).toEqual([]);
  });

  it("1.22 địa chỉ người xuất khẩu dòng 1 Bắt buộc (FPT), dòng 2–4 không", () => {
    const g = layoutFor("IDA").declarant.flatMap((s) => s.blocks).flatMap((b) => b.items).find((it) => it.kind === "group" && it.no === "1.22");
    expect(g?.kind === "group" && g.fields.map((f) => fieldRole("IDA", f, g.no))).toEqual(["REQUIRED", "CONDITIONAL", "CONDITIONAL", "CONDITIONAL"]);
  });
});

describe("requiredGaps – ô bắt buộc còn trống trước khi khai", () => {
  it.each(["IDA", "EDA"] as const)("%s: đủ dữ liệu → không thiếu", (kind) => {
    const { decl, item } = complete(kind);
    expect(requiredGaps(kind, decl, [item, item])).toEqual([]);
  });

  it("thiếu địa chỉ người xuất khẩu dòng 1 → báo 1.22", () => {
    const { decl, item } = complete("IDA");
    expect(requiredGaps("IDA", { ...decl, TK_EPA: "" }, [item])).toEqual([{ key: "TK_EPA", no: "1.22", label: expect.stringContaining("Địa chỉ") }]);
  });

  it("ô APP_* (nhóm loại hình, ngày vận đơn) không gửi Hải quan → không chặn", () => {
    const { decl, item } = complete("IDA");
    expect(requiredGaps("IDA", { ...decl, APP_NHOM_LH: "", APP_NGAY_VD1: "" }, [item])).toEqual([]);
  });

  it("theo tình huống: thời hạn tái xuất (1.10) chỉ thiếu khi loại hình tạm nhập G11–G14", () => {
    const { decl, item } = complete("IDA");
    expect(requiredGaps("IDA", decl, [item]).map((g) => g.key)).not.toContain("TK_RED");
    expect(requiredGaps("IDA", { ...decl, TK_ICB: "G11", TK_RED: "" }, [item]).map((g) => g.key)).toContain("TK_RED");
  });

  it("EDA 2.40 trị giá tính thuế: FOB không bắt buộc, CIF bắt buộc", () => {
    const { decl, item } = complete("EDA");
    const keys = (v: Record<string, string>) => requiredGaps("EDA", v, [item]).map((g) => g.key);
    expect(keys({ ...decl, TK_IP2: "FOB", TK_FKK: "", TK_FCD: "" })).toEqual([]);
    expect(keys({ ...decl, TK_IP2: "CIF", TK_FKK: "", TK_FCD: "" })).toEqual(expect.arrayContaining(["TK_FKK"]));
  });

  it("dòng hàng: xét từng dòng; thông báo ghi số dòng hàng", () => {
    const { decl, item } = complete("IDA");
    const gaps = requiredGaps("IDA", decl, [item, { ...item, HAG_UPR: "" }]);
    expect(gaps).toEqual([expect.objectContaining({ key: "HAG_UPR", line: 1 })]);
    expect(requiredGapsText(gaps, [5, 7])).toMatch(/^Dòng hàng 7: 1\.86 /);
  });
});

describe("itemFormValues", () => {
  it("số liệu dòng + giá trị tự điền + ô người khai nhập (HANG.<id>.<ô>) thắng", () => {
    const it0 = { id: "li1", lineNo: 1, description: "Bạc đạn", quantity: "10", unit: "PCE", unitPrice: "2", amount: "20", origin: "KR", hsConfirmed: "84821000", importDutyRate: "0" };
    const [v] = itemFormValues("IDA", [it0], { currency: "USD", fields: [{ code: "HANG.li1.HAG_UPR", value: "2.5" }] });
    expect(v).toMatchObject({ HAG_CMD: "84821000", HAG_QN1: "10", HAG_UPC: "USD", HAG_QN2: "10", HAG_OR: "KR", HAG_TXA: "0", HAG_UPR: "2.5" });
  });
});
