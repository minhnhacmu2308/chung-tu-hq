import { expect, test } from "@playwright/test";
import { createDossier, login, PDF } from "./helpers";

test("upload 3 chứng từ → AI đọc → màn OCR hiện trường + luật → sửa trường → xác nhận dữ liệu", async ({ page }) => {
  await login(page);
  await createDossier(page);
  await page.locator('input[type="file"]').first().setInputFiles([PDF("Commercial Invoice.pdf"), PDF("Packing List.pdf"), PDF("HBL.pdf")]);
  await expect(page.getByText(/đã đọc 3\/3/)).toBeVisible({ timeout: 90_000 });
  await page.getByRole("button", { name: "Xem kết quả đọc" }).click();
  await expect(page.getByRole("heading", { name: "AI đối chiếu chéo" })).toBeVisible();
  await expect(page.getByText(/13 luật đã chạy/)).toBeVisible();
  const po = page.getByRole("textbox", { name: "Số PO" });
  await expect(po).toHaveValue("AP-2609-114");
  await po.fill("AP-2609-999");
  await po.press("Enter");
  await expect(page.getByText("Hoàn tác")).toBeVisible();
  await page.getByRole("button", { name: "Xác nhận dữ liệu" }).click();
  await page.getByRole("button", { name: "Vẫn tiếp tục" }).click();
  await expect(page).toHaveURL(/step=agent/);
});
