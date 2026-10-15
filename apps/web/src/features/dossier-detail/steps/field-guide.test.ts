import { describe, expect, it } from "vitest";
import { fieldGuide } from "./field-guide";

describe("fieldGuide", () => {
  it("lấy hướng dẫn khai theo đúng mẫu tờ khai: 1.68 (IDA) và 2.57 (EDA) đều là Phần ghi chú, được TT121 sửa", () => {
    expect(fieldGuide("IDA", "1.68")).toMatchObject({ no: "1.68", label: expect.stringMatching(/ghi chú/i), amendedBy121: true });
    expect(fieldGuide("EDA", "2.57")).toMatchObject({ no: "2.57", amendedBy121: true });
    expect(fieldGuide("IDA", "1.37")?.note).toMatch(/MO/);
  });
  it("số chỉ tiêu của mẫu khác, không có số, hoặc không tồn tại → null", () => {
    expect(fieldGuide("IDA", "2.57")).toBeNull();
    expect(fieldGuide("EDA", undefined)).toBeNull();
    expect(fieldGuide("IDA", "")).toBeNull();
    expect(fieldGuide("IDA", "9.99")).toBeNull();
  });
});
