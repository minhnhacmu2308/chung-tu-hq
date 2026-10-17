import { describe, expect, it } from "vitest";
import { CATALOG_EDA } from "./catalog-eda.js";
import { CATALOG_IDA } from "./catalog-ida.js";
import { catalogFieldRole, declarationFieldRole, findDeclarationFieldDef } from "./field-role.js";

describe("declarationFieldRole – vai trò chỉ tiêu theo Phụ lục II", () => {
  it.each([
    ["IDA", "1.1", "CUSTOMS"], // số tờ khai: hệ thống cấp
    ["IDA", "1.70", "CUSTOMS"], // chỉ thị Hải quan
    ["IDA", "1.4", "REQUIRED"], // mã loại hình
    ["IDA", "1.3", "CONDITIONAL"], // số tờ khai TN-TX: chỉ khi tạm nhập/tái xuất
    ["IDA", "1.8", "ASSIST"], // cơ quan Hải quan: không nhập thì hệ thống tự xác định
    ["IDA", "1.9", "ASSIST"], // đội thủ tục: hệ thống xác định theo HS
    ["IDA", "1.87", "ASSIST"], // trị giá tính thuế: VNACCS tự phân bổ
    ["IDA", "1.46", "UNUSED"], // chưa sử dụng
    ["IDA", "1.68", "OPTIONAL"],
    ["EDA", "2.1", "CUSTOMS"],
    ["EDA", "2.61", "CUSTOMS"],
    ["EDA", "2.8", "ASSIST"],
    ["EDA", "2.33", "CONDITIONAL"],
    ["EDA", "2.65", "REQUIRED"],
  ] as const)("%s %s → %s", (kind, no, role) => {
    expect(declarationFieldRole(kind, no)).toBe(role);
  });

  it("không có số chỉ tiêu (tỷ giá, C/O) → REFERENCE", () => {
    expect(declarationFieldRole("IDA", null)).toBe("REFERENCE");
    expect(declarationFieldRole("EDA", undefined)).toBe("REFERENCE");
    expect(declarationFieldRole("IDA", "9.99")).toBe("REFERENCE");
  });

  it("không tra chéo mẫu: số của Mẫu 02 không có trong Mẫu 01", () => {
    expect(findDeclarationFieldDef("IDA", "2.1")).toBeUndefined();
    expect(findDeclarationFieldDef("EDA", "2.1")?.label).toBe("Số tờ khai");
  });

  it("chỉ tiêu Hải quan trả về chỉ gồm số tờ khai và chỉ thị Hải quan", () => {
    const customs = (c: typeof CATALOG_IDA) => c.filter((d) => catalogFieldRole(d) === "CUSTOMS").map((d) => d.no);
    expect(customs(CATALOG_IDA)).toEqual(["1.1", "1.70", "1.71", "1.72", "1.73"]);
    expect(customs(CATALOG_EDA)).toEqual(["2.1", "2.61", "2.62", "2.63", "2.64"]);
  });

  it("chỉ tiêu ASSIST không đồng thời bắt buộc tuyệt đối (M)", () => {
    for (const d of [...CATALOG_IDA, ...CATALOG_EDA]) if (d.assist) expect(d.required).not.toBe("M");
  });
});
