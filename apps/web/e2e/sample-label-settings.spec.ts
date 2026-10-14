import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { login, PDF } from "./helpers";

test("mẫu skill: tải mẫu → AI đọc nháp → mở Gắn nhãn, sửa giá trị → Đã gắn nhãn, nhãn còn nguyên khi mở lại", async ({ page }) => {
  await login(page);
  await page.goto("/skills");
  await page.getByRole("link", { name: /SK-INV-GEN/ }).first().click();
  await page.getByRole("tab", { name: /Mẫu/ }).click();
  const fileName = `e2e-${Date.now().toString(36)}.pdf`; // tên riêng mỗi lần chạy để không lẫn với mẫu của lần trước
  await page.locator('input[type="file"]').first().setInputFiles({ name: fileName, mimeType: "application/pdf", buffer: readFileSync(PDF("Commercial Invoice.pdf")) });
  const open = page.getByRole("button", { name: `Gắn nhãn ${fileName}`, exact: true });
  await expect(open).toBeVisible({ timeout: 30_000 });

  // Worker đọc mẫu xong mới có nhãn nháp; trước đó hộp thoại báo "AI đang đọc".
  const dialog = page.getByRole("dialog");
  const invoiceNo = dialog.getByLabel("Số hóa đơn");
  await expect(async () => {
    await open.click();
    await expect(invoiceNo).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 60_000, intervals: [1_000] });
  await expect(invoiceNo).not.toHaveValue(""); // nhãn nháp từ AI
  const value = `E2E-${Date.now().toString(36)}`;
  await invoiceNo.fill(value);
  await dialog.getByRole("button", { name: "Xác nhận nhãn" }).click();
  await expect(page.getByText("Đã lưu nhãn mẫu", { exact: true })).toBeVisible();

  const edit = page.getByRole("button", { name: `Sửa nhãn ${fileName}`, exact: true });
  await edit.click();
  await expect(dialog.getByLabel("Số hóa đơn")).toHaveValue(value);
});

test("cài đặt: công tắc nguyên tắc 4 mắt bật/tắt và lưu xuống backend", async ({ page }) => {
  await login(page);
  await page.goto("/settings?tab=preferences");
  const sw = page.getByRole("switch", { name: /Nguyên tắc 4 mắt/ });
  await expect(sw).toBeVisible();
  const was = await sw.isChecked();
  try {
    await sw.click();
    await expect(page.getByText(was ? "Đã tắt nguyên tắc 4 mắt" : "Đã bật nguyên tắc 4 mắt", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("switch", { name: /Nguyên tắc 4 mắt/ })).toBeChecked({ checked: !was });
  } finally {
    await page.request.patch("/api/org/four-eyes", { data: { enabled: false } });
  }
});
