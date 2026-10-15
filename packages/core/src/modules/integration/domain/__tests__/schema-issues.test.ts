import { IdaRequestSchema } from "@kb/contracts";
import { describe, expect, it } from "vitest";
import { describeSchemaIssue } from "../schema-issues.js";

const issuesOf = (req: unknown) => (IdaRequestSchema.safeParse(req).error?.issues ?? []).map(describeSchemaIssue);

describe("describeSchemaIssue", () => {
  it("thiếu chỉ tiêu vận đơn → tên tiếng Việt + mã đặc tả, hướng dẫn nhập trên tờ khai", () => {
    const vd = issuesOf({ objVN_IDA_VANDON: {} }).find((i) => i.field === "objVN_IDA_VANDON.vD_BL1");
    expect(vd).toEqual({ code: "E-SCHEMA", field: "objVN_IDA_VANDON.vD_BL1", message: 'Vận đơn: thiếu chỉ tiêu bắt buộc "Số vận đơn (Số B/L, số AWB v.v. …) (VD_BL1)"', solution: expect.stringContaining("Nhập chỉ tiêu này") });
  });
  it("lỗi ở dòng hàng → nêu số dòng (đếm từ 1)", () => {
    const msg = describeSchemaIssue({ path: ["objVN_IDA_HANG", 1, "haG_CMD"], message: "Invalid input: expected string, received undefined" }).message;
    expect(msg).toMatch(/^Dòng hàng dòng 2: thiếu chỉ tiêu bắt buộc ".*\(HAG_CMD\)"$/);
  });
  it("sai định dạng (không phải thiếu) → giữ lý do", () => {
    expect(describeSchemaIssue({ path: ["objVN_IDA_VANDON", "vD_ARR"], message: "Ngày phải dạng dd/MM/yyyy", input: "2026-10-20" }).message).toBe('Vận đơn: "Ngày hàng đến (VD_ARR)" không hợp lệ – Ngày phải dạng dd/MM/yyyy');
  });
  it("đường dẫn lạ → giữ nguyên đường dẫn", () => {
    expect(describeSchemaIssue({ path: ["objX", "a"], message: "m" }).message).toBe("objX.a: m");
  });
});
