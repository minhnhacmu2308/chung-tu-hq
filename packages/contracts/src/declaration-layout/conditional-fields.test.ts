// Đợt 5 – chỉ tiêu theo tình huống người khai nhập (ô bổ sung, mã = tên trường VNACCS): 1.40/2.35, ủy thác/tại chỗ, nộp thuế – hạn mức – bảo lãnh,
// kho ngoại quan, vận chuyển kết hợp. Kiểm điều kiện xuất hiện, bắt buộc (requiredGaps), "khai cả nhóm" và ô không áp dụng.
import { describe, expect, it } from "vitest";
import { declarationRequiredGaps, extraFieldFpt, fieldRole, inapplicableExtraCodes, isExtraFieldKey, layoutFor, requiredGaps, type LayoutField } from "./index.js";

type Kind = "IDA" | "EDA";
type Values = Record<string, string>;

/** Giá trị đủ mọi ô bắt buộc (nhập kinh doanh A11 / xuất B11, đường hàng không, giá CIF, hóa đơn A). */
function complete(kind: Kind): { decl: Values; item: Values } {
  const decl: Values = kind === "IDA" ? { TK_ICB: "A11", TK_MTC: "1", TK_IP2: "CIF", TK_IV1: "A", TK_IV3: "INV-1" } : { TK_ECB: "B11", TK_MTC: "1", TK_IP2: "CIF", TK_IV1: "A", TK_IV3: "INV-1" };
  for (const g of requiredGaps(kind, decl, [])) decl[g.key] ||= "X";
  const item: Values = {};
  for (const g of requiredGaps(kind, decl, [item])) if (g.line === 0) item[g.key] = "1";
  return { decl, item };
}
const gapKeys = (kind: Kind, v: Values, item: Values) => requiredGaps(kind, v, [item]).map((g) => g.key);

function findField(kind: Kind, key: string): { f: LayoutField; no: string | undefined } {
  for (const s of layoutFor(kind).declarant) for (const b of s.blocks) for (const it of b.items) {
    if (it.kind === "field" && it.key === key) return { f: it, no: undefined };
    if (it.kind !== "field") for (const f of it.fields) if (f.key === key || f.key.replace(/\{n+\}/, "1") === key) return { f, no: it.no };
  }
  throw new Error(`Không có ô ${key}`);
}

const NO = {
  IDA: { iv2: "1.40", limit: ["1.54", "1.55", "1.56", "1.57"], guarantee: ["1.59", "1.60", "1.61", "1.62"] },
  EDA: { iv2: "2.35", limit: ["2.44", "2.45", "2.46", "2.47"], guarantee: ["2.49", "2.50", "2.51", "2.52"] },
} as const;
const LIMIT = ["TK_BRC", "TK_BYA", "TK_BCM", "TK_BCN"];
const GUARANTEE = ["TK_SBC", "TK_RYA", "TK_SCM", "TK_SCN"];

describe.each(["IDA", "EDA"] as const)("%s – số tiếp nhận hóa đơn điện tử (1.40 / 2.35)", (kind) => {
  it("ô TK_IV2 gắn điều kiện E_INVOICE, là ô bổ sung gửi object chính", () => {
    expect(findField(kind, "TK_IV2").f).toMatchObject({ no: NO[kind].iv2, condition: "E_INVOICE" });
    expect(isExtraFieldKey(kind, "TK_IV2")).toBe(true);
    expect(extraFieldFpt(kind, "TK_IV2")?.object).toBe(kind === "IDA" ? "objVN_IDA" : "objVN_EDA");
  });
  it("1.39 / 2.34 = D và còn trống → thiếu (chặn duyệt); A/B → không thiếu", () => {
    const { decl, item } = complete(kind);
    expect(gapKeys(kind, decl, item)).toEqual([]);
    expect(requiredGaps(kind, { ...decl, TK_IV1: "D" }, [item])).toEqual([expect.objectContaining({ key: "TK_IV2", no: NO[kind].iv2 })]);
    expect(gapKeys(kind, { ...decl, TK_IV1: "D", TK_IV2: "123456789012" }, item)).toEqual([]);
    expect(gapKeys(kind, { ...decl, TK_IV1: "B" }, item)).not.toContain("TK_IV2");
  });
  it("từ chỉ tiêu lưu trên tờ khai (backend): HD_PL “D – …” → thiếu TK_IV2", () => {
    const fields = [{ code: "HD_PL", value: "D – Hóa đơn điện tử" }];
    expect(declarationRequiredGaps(kind, fields, []).map((g) => g.key)).toContain("TK_IV2");
    expect(declarationRequiredGaps(kind, [{ code: "HD_PL", value: "A – Hóa đơn thương mại" }], []).map((g) => g.key)).not.toContain("TK_IV2");
  });
  it("đã nhập TK_IV2 nhưng 1.39 / 2.34 không phải D → ô không áp dụng (không gửi, bỏ khi dựng lại); D → áp dụng", () => {
    expect(inapplicableExtraCodes(kind, [{ code: "HD_PL", value: "A – Hóa đơn thương mại" }, { code: "TK_IV2", value: "123" }])).toEqual(["TK_IV2"]);
    expect(inapplicableExtraCodes(kind, [{ code: "HD_PL", value: "D – Hóa đơn điện tử" }, { code: "TK_IV2", value: "123" }])).toEqual([]);
    // Ô trống hoặc ô không theo tình huống không bị liệt kê.
    expect(inapplicableExtraCodes(kind, [{ code: "HD_PL", value: "A" }, { code: "TK_IV2", value: " " }, { code: "TK_ENC", value: "C" }])).toEqual([]);
  });
});

describe.each(["IDA", "EDA"] as const)("%s – khai cả nhóm: hạn mức ngân hàng trả thuế thay, bảo lãnh", (kind) => {
  it.each([["hạn mức", LIMIT, "limit"], ["bảo lãnh", GUARANTEE, "guarantee"]] as const)("%s: chưa nhập ô nào → không bắt buộc; nhập một ô → các ô còn lại thiếu; đủ cả nhóm → hết thiếu", (_n, keys, which) => {
    const { decl, item } = complete(kind);
    expect(gapKeys(kind, decl, item)).toEqual([]);
    const one = { ...decl, [keys[0]!]: "01201001" };
    const gaps = requiredGaps(kind, one, [item]);
    expect(gaps.map((g) => g.key)).toEqual(keys.slice(1));
    expect(gaps.map((g) => g.no)).toEqual(NO[kind][which].slice(1));
    expect(gaps[0]!.label).toMatch(/khai cả nhóm/);
    // Nhập ô khác (không phải mã ngân hàng) cũng bắt khai cả nhóm.
    expect(gapKeys(kind, { ...decl, [keys[2]!]: "AB" }, item)).toEqual([keys[0], keys[1], keys[3]]);
    expect(gapKeys(kind, { ...decl, ...Object.fromEntries(keys.map((k) => [k, "2026"])) }, item)).toEqual([]);
  });
  it("hai nhóm độc lập: nhập hạn mức không bắt nhập bảo lãnh", () => {
    const { decl, item } = complete(kind);
    const v = { ...decl, ...Object.fromEntries(LIMIT.map((k) => [k, "1"])) };
    expect(gapKeys(kind, v, item)).toEqual([]);
  });
  it("mọi ô của hai nhóm là ô bổ sung có trường FPT (gửi khi có giá trị)", () => {
    for (const k of [...LIMIT, ...GUARANTEE]) expect(extraFieldFpt(kind, k)?.field.name).toBe(k);
  });
});

describe("tùy chọn (không bao giờ chặn khi trống): 1.58 / 2.48, 1.53, ủy thác / tại chỗ, 1.64, vận chuyển kết hợp", () => {
  const OPTIONAL: Record<Kind, string[]> = {
    IDA: ["TK_ENC", "TK_BP", "TK_NMC", "TK_NMN", "TK_EPC", "TK_ENM", "VD_ISD", "TK_DPD", "TK_ST1", "TK_AD1", "TK_SD1", "TK_ARP", "TK_ADT"],
    EDA: ["TK_ENC", "TK_EXC", "TK_EXN", "TK_CGC", "TK_DPD", "TK_ST1", "TK_AD1", "TK_SD1", "TK_ARP", "TK_ADT"],
  };
  it.each(["IDA", "EDA"] as const)("%s: có trên bố cục, không theo điều kiện, vai trò không phải Bắt buộc, gửi FPT đúng tên trường", (kind) => {
    for (const key of OPTIONAL[kind]) {
      const { f, no } = findField(kind, key);
      expect(f.condition, key).toBeUndefined();
      expect(fieldRole(kind, f, no), key).not.toBe("REQUIRED");
      expect(extraFieldFpt(kind, key)?.field.name, key).toBe(key);
    }
  });
  it.each(["IDA", "EDA"] as const)("%s: để trống không thiếu; loại hình nào cũng vậy", (kind) => {
    const { decl, item } = complete(kind);
    const typeKey = kind === "IDA" ? "TK_ICB" : "TK_ECB";
    for (const t of kind === "IDA" ? ["A11", "A41", "E21", "G11"] : ["B11", "E42", "G61"]) {
      expect(gapKeys(kind, { ...decl, [typeKey]: t }, item).filter((k) => OPTIONAL[kind].includes(k)), t).toEqual([]);
    }
  });
});
