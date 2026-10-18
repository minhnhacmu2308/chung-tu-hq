import { LAYOUT_EDA, LAYOUT_IDA } from "@kb/contracts";
import { describe, expect, it } from "vitest";
import { fixtureFor, valuesAt } from "./fixtures";
import { changedCount, declarantEditable, lookupsAt, operationsAt, summaryAt, taxAmount, taxSummary } from "./stage-rules";

describe("declarantEditable – phần người khai nhập theo giai đoạn", () => {
  it("nháp sửa được; đã khai chỉ sửa khi đang khai sửa đổi bổ sung; đã thông quan chỉ đọc", () => {
    expect(declarantEditable("nhap", false)).toBe(true);
    expect(declarantEditable("da-khai", false)).toBe(false);
    expect(declarantEditable("da-khai", true)).toBe(true);
    expect(declarantEditable("thong-quan", true)).toBe(false);
  });
});

describe("changedCount – số ô đã sửa so với tờ khai đã đăng ký", () => {
  it("đếm ô phần đầu và ô dòng hàng khác giá trị đăng ký; xóa trắng ô có giá trị cũng tính", () => {
    const before = { header: { TK_IV3: "A", TK_IMA: "X" }, items: [{ HAG_QN1: "1" }, { HAG_QN1: "2" }] };
    expect(changedCount(before, { header: { TK_IV3: "A", TK_IMA: "X" }, items: [{ HAG_QN1: "1" }, { HAG_QN1: "2" }] })).toBe(0);
    expect(changedCount(before, { header: { TK_IV3: "B", TK_IMA: "" }, items: [{ HAG_QN1: "1" }, { HAG_QN1: "3", HAG_FOO: "" }] })).toBe(3);
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

describe("taxAmount – số thuế / tỷ giá hiện có phân tách hàng nghìn", () => {
  it("số nguyên, số lẻ, số âm định dạng; chữ giữ nguyên", () => {
    expect(taxAmount("155000")).toBe("155.000");
    expect(taxAmount("25450.5")).toBe("25.450,5");
    expect(taxAmount("-1200")).toBe("-1.200");
    expect(taxAmount("Miễn")).toBe("Miễn");
  });
});
