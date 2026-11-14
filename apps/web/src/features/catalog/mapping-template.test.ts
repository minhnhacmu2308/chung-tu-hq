import { detectItemColumns, isUnfilledLinkRow, type CrossReference } from "@kb/contracts";
import { pickMessages } from "@kb/ui";
import { describe, expect, it } from "vitest";
import { mappingTemplateRows } from "./catalog-xlsx";
import { MAPPING_TEMPLATE_MESSAGES } from "./mapping-template.messages";

const ref: CrossReference = {
  codeSets: [
    { id: "xnk", kind: "CUSTOMS", name: "XNK" },
    { id: "acc", kind: "ACCOUNTING", name: "Kế toán" },
  ],
  rows: [
    { itemNo: "MH-000001", name: "Ống thép D20", hs: "73063010", baseUnit: "PCE", codes: { xnk: ["OT-20"], acc: ["152-OT20"] }, factors: { BOX: "12" } },
    { itemNo: "MH-000002", name: "Keo dán", hs: "35069900", baseUnit: "KGM", codes: { xnk: ["KD-1"] }, factors: {} },
  ],
};

describe("mappingTemplateRows", () => {
  it("điền sẵn mã/tên/ĐVT/hệ số đã có ở bộ đích; chưa có mã → trống mã, tên mặt hàng", () => {
    const rows = mappingTemplateRows(ref, "xnk", "acc", new Map([["MH-000001", { name: "Ống thép mạ kẽm (KT)", unit: "box" }]]));
    expect(rows).toEqual([
      { linkCode: "MH-000001", refCode: "OT-20", refName: "Ống thép D20", refHs: "73063010", refUnit: "PCE", code: "152-OT20", name: "Ống thép mạ kẽm (KT)", unit: "box", factor: "12" },
      { linkCode: "MH-000002", refCode: "KD-1", refName: "Keo dán", refHs: "35069900", refUnit: "KGM", code: "", name: "Keo dán", unit: "", factor: "" },
    ]);
  });
  it("mặt hàng nhiều mã ở bộ đích → mỗi mã một dòng; ĐVT = gốc → không điền hệ số", () => {
    const multi: CrossReference = { ...ref, rows: [{ ...ref.rows[0]!, codes: { acc: ["A1", "A2"] } }] };
    const rows = mappingTemplateRows(multi, null, "acc", new Map([["MH-000001", { name: null, unit: "PCE" }]]));
    expect(rows.map((r) => [r.code, r.name, r.factor, r.refCode])).toEqual([["A1", "Ống thép D20", "", ""], ["A2", "Ống thép D20", "", ""]]);
  });
});

describe("tiêu đề file đối chiếu", () => {
  it.each(["vi", "en", "zh"] as const)("%s: cột điền được Ghép cột tự nhận, cột tham khảo thì không", (locale) => {
    const t = pickMessages(MAPPING_TEMPLATE_MESSAGES, locale);
    const headers = [t.colLink, t.colRefCode.replace("{source}", "XNK (Xuất nhập khẩu)"), t.colRefName, t.colRefHs, t.colRefUnit, t.colCode, t.colName, t.colUnit, t.colFactor];
    expect(detectItemColumns(headers)).toEqual({ linkCode: 0, code: 5, name: 6, unit: 7, factor: 8 });
  });
});

describe("isUnfilledLinkRow", () => {
  it("có Mã nối, trống mã → bỏ qua; trống cả hai hoặc có mã → không", () => {
    expect(isUnfilledLinkRow({ code: " ", linkCode: "MH-000002" })).toBe(true);
    expect(isUnfilledLinkRow({ code: "", linkCode: undefined })).toBe(false);
    expect(isUnfilledLinkRow({ code: "A1", linkCode: "MH-000001" })).toBe(false);
  });
});
