import { describe, expect, it } from "vitest";
import type { DeclarationField } from "@/mocks/types";
import { fieldTitle, groupDeclarationFields } from "./declaration-groups";

const f = (code: string, no: string | undefined, section: DeclarationField["section"] = "GENERAL"): DeclarationField => ({
  code, ...(no ? { no } : {}), label: code, value: "x", source: "SYSTEM", section,
});

describe("groupDeclarationFields", () => {
  it("số tờ khai vào nhóm Hải quan trả về, tỷ giá/C/O (không có số) vào nhóm tham khảo – không lẫn với chỉ tiêu khai", () => {
    const groups = groupDeclarationFields("IDA", [f("SOTK", "1.1"), f("MA_LH", "1.4"), f("TY_GIA", undefined, "VALUE"), f("SO_CO", undefined, "VALUE")]);
    expect(groups.map((g) => g.id)).toEqual(["GENERAL", "REFERENCE", "CUSTOMS"]);
    expect(groups.find((g) => g.id === "CUSTOMS")!.fields.map((x) => x.code)).toEqual(["SOTK"]);
    expect(groups.find((g) => g.id === "REFERENCE")!.fields.map((x) => x.role)).toEqual(["REFERENCE", "REFERENCE"]);
  });

  it("nhóm theo Phụ lục II chứ không theo nhóm dựng: 1.37 vào Giấy phép/trị giá, 1.52 vào Nộp thuế, 1.68 vào Thông tin chung", () => {
    const groups = groupDeclarationFields("IDA", [f("VBPQ", "1.37", "GENERAL"), f("NGUOI_NT", "1.52", "GENERAL"), f("GHI_CHU", "1.68", "GENERAL")]);
    expect(Object.fromEntries(groups.map((g) => [g.id, g.fields.map((x) => x.code)]))).toEqual({ GENERAL: ["GHI_CHU"], VALUE: ["VBPQ"], TAX: ["NGUOI_NT"] });
  });

  it("xếp theo số chỉ tiêu (1.8 trước 1.11), các ô con cùng số 1.44 giữ thứ tự dựng", () => {
    const [value] = groupDeclarationFields("IDA", [f("TONG_TG", "1.44"), f("SO_HD", "1.41"), f("GIA_PL", "1.44"), f("DK_GIA", "1.44")]);
    expect(value!.fields.map((x) => x.code)).toEqual(["SO_HD", "TONG_TG", "GIA_PL", "DK_GIA"]);
    const [general] = groupDeclarationFields("IDA", [f("NGAY_DK", "1.11"), f("CQHQ", "1.8")]);
    expect(general!.fields.map((x) => x.code)).toEqual(["CQHQ", "NGAY_DK"]);
  });

  it("gắn vai trò theo đúng mẫu tờ khai", () => {
    const [general] = groupDeclarationFields("EDA", [f("CQHQ", "2.8"), f("MA_LH", "2.4")]);
    expect(general!.fields.map((x) => [x.code, x.role])).toEqual([["MA_LH", "REQUIRED"], ["CQHQ", "ASSIST"]]);
  });
});

describe("fieldTitle", () => {
  it("hiện số chỉ tiêu trước tên", () => {
    expect(fieldTitle({ no: "1.44", label: "Tổng trị giá hóa đơn" })).toBe("1.44 · Tổng trị giá hóa đơn");
    expect(fieldTitle({ label: "Tỷ giá tính thuế" })).toBe("Tỷ giá tính thuế");
  });
});
