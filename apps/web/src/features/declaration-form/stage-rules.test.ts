import { describe, expect, it } from "vitest";
import { taxAmount, taxSummary } from "./stage-rules";

describe("taxSummary – thông tin thuế tờ khai", () => {
  it("chưa có số liệu Hải quan (nháp): null, không tự đặt số", () => {
    expect(taxSummary("IDA", { TK_IMC: "0101234567", TK_CH: "02CI" }, "vi")).toBeNull();
    expect(taxSummary("EDA", { TK_EPC: "0309876543", TK_CH: "01B1" }, "vi")).toBeNull();
  });
  it("IDA đã khai: tỷ giá, từng sắc thuế và tổng tiền thuế lấy từ kết quả Hải quan", () => {
    const t = taxSummary("IDA", { THUE_KJ1: "USD", THUE_KK1: "25800", THUE_KF1: "A", THUE_KG1: "Thuế NK", THUE_KH1: "0", THUE_KF2: "V", THUE_KH2: "1200", THUE_B02: "1200" }, "vi")!;
    expect(t.rate).toEqual({ currency: "USD", value: "25800" });
    // Không có tên sắc thuế → dùng mã.
    expect(t.lines).toEqual([{ label: "Thuế NK", value: "0" }, { label: "V", value: "1200" }]);
    expect(t.total).toBe("1200");
  });
  it("IDA chỉ có tổng tiền thuế: vẫn hiện, chưa có tỷ giá", () => {
    expect(taxSummary("IDA", { THUE_B02: "0" }, "vi")).toEqual({ rate: null, lines: [], total: "0" });
  });
  it("EDA đã khai: tỷ giá và thuế xuất khẩu (nhãn theo ngôn ngữ)", () => {
    const h = { TK_ETA: "0", TK_RC1: "USD", TK_RD1: "25790" };
    const t = taxSummary("EDA", h, "vi")!;
    expect(t.rate).toEqual({ currency: "USD", value: "25790" });
    expect(t.lines).toEqual([{ label: "Thuế xuất khẩu", value: "0" }]);
    expect(t.total).toBeNull();
    expect(taxSummary("EDA", h, "en")!.lines[0]!.label).not.toBe("Thuế xuất khẩu");
  });
});

describe("taxAmount – số thuế / tỷ giá hiện có phân tách hàng nghìn", () => {
  it("số nguyên, số lẻ, số âm định dạng; chữ giữ nguyên", () => {
    expect(taxAmount("155000")).toBe("155.000");
    expect(taxAmount("25450.5")).toBe("25.450,5");
    expect(taxAmount("-1200")).toBe("-1.200");
    expect(taxAmount("Miễn")).toBe("Miễn");
  });
});
