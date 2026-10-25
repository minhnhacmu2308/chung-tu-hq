import { describe, expect, it } from "vitest";
import { createLocator, needlesFor, type PageText } from "./pdf-locate";

/** Mỗi dòng một mẩu chữ, cao 2%, rộng theo số ký tự (0,5%/ký tự). */
const page = (n: number, lines: [string, number, number][]): PageText => ({
  page: n,
  boxes: lines.map(([str, x, y]) => ({ str, x, y, w: str.length * 0.5, h: 2 })),
});

const INVOICE: PageText[] = [
  page(1, [
    ["COMMERCIAL INVOICE", 30, 5],
    ["Invoice No.: M-240315", 10, 12],
    ["Date: DEC. 04, 2024", 60, 12],
    ["For account and Risk of Messrs. CARA LIGHTING SOLUTION CO., LTD", 10, 20],
    ["Qty", 50, 40],
    ["1PCS", 50, 45],
    ["1PCS", 50, 50],
    ["91PCS", 50, 60],
    ["TOTAL PRICE (USD) US$608.58", 10, 70],
  ]),
  page(2, [["Packages: 300 CTNS", 10, 10], ["Gross weight 17,420.00 KGS", 10, 20]]),
];

describe("pdf-locate", () => {
  const locate = createLocator(INVOICE);

  it("tìm số chứng từ trong mẩu chữ dài và chỉ tô đúng phần giá trị (không cả dòng)", () => {
    const r = locate("M-240315")!;
    expect(r.page).toBe(1);
    expect(r.x).toBeGreaterThan(10 + 12 * 0.5 - 1);
    expect(r.w).toBeLessThan(6);
  });

  it("tên công ty dính sau chữ khác; bỏ dấu, bỏ hoa thường", () => {
    expect(locate("Cara Lighting Solution Co., Ltd")?.page).toBe(1);
  });

  it("số: 608.58 khớp US$608.58; 17420.00 khớp 17,420.00 ở trang 2; 300 khớp trọn cụm", () => {
    expect(locate("608.58")).toMatchObject({ page: 1, y: expect.closeTo(70 - 0.4, 1) });
    expect(locate("17420.00")?.page).toBe(2);
    expect(locate("17420")?.page).toBe(2);
    expect(locate("300")?.page).toBe(2);
  });

  it("ngày ISO khớp kiểu in DEC. 04, 2024", () => {
    expect(locate("2024-12-04")).toMatchObject({ page: 1, y: expect.closeTo(12 - 0.4, 1) });
  });

  it("số quá ngắn xuất hiện nhiều chỗ → không đoán; không khớp nửa cụm số", () => {
    expect(locate("1")).toBeNull();
    expect(locate("91")).not.toBeNull();
    expect(locate("24031")).toBeNull();
  });

  it("không có trên chứng từ → null", () => {
    expect(locate("HANSOL")).toBeNull();
    expect(locate("")).toBeNull();
  });

  it("needlesFor: số bỏ số 0 thừa, ngày có cả dạng tháng chữ", () => {
    expect(needlesFor("17420.00").map((n) => n.s)).toEqual(expect.arrayContaining(["1742000", "17420"]));
    expect(needlesFor("2024-12-04").map((n) => n.s)).toEqual(expect.arrayContaining(["04122024", "DEC042024", "04DEC2024"]));
  });
});
