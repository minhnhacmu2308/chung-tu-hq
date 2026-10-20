import { expect, test } from "@playwright/test";

// Kiểm tra quy tắc @media print: PaperStack 2 trang giấy trong playground phải ra đúng 2 trang PDF
// (không trang trắng, không thừa phần còn lại của ứng dụng).
test("in PaperStack 2 trang giấy ra đúng 2 trang PDF", async ({ page, isMobile }) => {
  test.skip(isMobile, "page.pdf chỉ cần kiểm một lần trên desktop");
  await page.goto("/?font=system&ai=0&mode=light");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("region", { name: "Trang 2 / 2" })).toBeAttached();
  await page.emulateMedia({ media: "print" });
  const pdf = await page.pdf({ format: "A4", printBackground: true });
  const text = pdf.toString("latin1");
  const pages = (text.match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;
  expect(pages).toBe(2);
});
