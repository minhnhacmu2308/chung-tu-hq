import { LAYOUT_EDA, LAYOUT_IDA } from "@kb/contracts";
import { describe, expect, it } from "vitest";
import { fixtureFor, valuesAt } from "./fixtures";
import { declarantEditable, lookupsAt, operationsAt, summaryAt, taxSummary } from "./stage-rules";

describe("declarantEditable – phần người khai nhập theo giai đoạn", () => {
  it("nháp sửa được; đã khai chỉ sửa khi đang khai sửa đổi bổ sung; đã thông quan chỉ đọc", () => {
    expect(declarantEditable("nhap", false)).toBe(true);
    expect(declarantEditable("da-khai", false)).toBe(false);
    expect(declarantEditable("da-khai", true)).toBe(true);
    expect(declarantEditable("thong-quan", true)).toBe(false);
  });
});

describe("summaryAt – đầu trang", () => {
  it.each([LAYOUT_IDA, LAYOUT_EDA])("$kind: nháp chỉ hiện số tờ khai; sau khai hiện cả phân luồng, thông quan, ngày đăng ký", (layout) => {
    expect(summaryAt(layout, "nhap").map((f) => f.key)).toEqual([layout.summary[0]!.key]);
    expect(summaryAt(layout, "da-khai")).toEqual(layout.summary);
    expect(summaryAt(layout, "thong-quan")).toEqual(layout.summary);
  });
});

describe("operationsAt / lookupsAt – tab Theo dõi & nghiệp vụ", () => {
  it("nháp: không có nghiệp vụ cần số tờ khai (AMA, hủy, lấy danh sách container) và không có tra cứu", () => {
    const ops = operationsAt("nhap");
    expect(ops).toContain("Đăng ký bổ sung file đính kèm (HYS)");
    for (const o of ["Khai sửa đổi bổ sung sau thông quan (AMA)", "Lấy danh sách container", "Cập nhật trạng thái tờ khai hủy"]) expect(ops).not.toContain(o);
    expect(lookupsAt("nhap")).toEqual([]);
  });
  it("đã khai / đã thông quan: đủ nghiệp vụ và tra cứu", () => {
    for (const s of ["da-khai", "thong-quan"] as const) {
      expect(operationsAt(s)).toContain("Khai sửa đổi bổ sung sau thông quan (AMA)");
      expect(operationsAt(s)).toContain("Cập nhật trạng thái tờ khai hủy");
      expect(lookupsAt(s).length).toBeGreaterThan(0);
    }
  });
});

describe("taxSummary – thông tin thuế tờ khai", () => {
  it("nháp: chưa có số liệu (không tự đặt số)", () => {
    expect(taxSummary("IDA", valuesAt(fixtureFor("IDA"), "nhap").header)).toBeNull();
    expect(taxSummary("EDA", valuesAt(fixtureFor("EDA"), "nhap").header)).toBeNull();
  });
  it("IDA đã khai: tỷ giá, từng sắc thuế và tổng tiền thuế lấy từ kết quả Hải quan", () => {
    const t = taxSummary("IDA", valuesAt(fixtureFor("IDA"), "da-khai").header)!;
    expect(t.rate).toEqual({ currency: "USD", value: "25800" });
    expect(t.lines).toEqual([{ label: "Thuế NK", value: "0" }]);
    expect(t.total).toBe("0");
  });
  it("EDA đã khai: tỷ giá và thuế xuất khẩu", () => {
    const h = valuesAt(fixtureFor("EDA"), "da-khai").header;
    const t = taxSummary("EDA", h)!;
    expect(t.rate).toEqual({ currency: "USD", value: h["TK_RD1"] });
    expect(t.lines).toEqual([{ label: "Thuế xuất khẩu", value: "0" }]);
  });
});
