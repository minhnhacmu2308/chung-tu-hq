import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("cấu hình skill: danh sách → chi tiết → thêm trường tạo phiên bản mới → bật/tắt skill", async ({ page }) => {
  await login(page);
  await page.goto("/skills");
  await expect(page.getByRole("heading", { name: "Cấu hình Skill AI" })).toBeVisible();
  await page.getByRole("link", { name: /SK-INV-GEN/ }).first().click();
  await expect(page.getByRole("heading", { name: "Commercial Invoice – chung" })).toBeVisible();
  const versionBefore = await page.getByText(/^v\d+$/).first().textContent();

  await page.getByRole("button", { name: "Thêm trường" }).click();
  const dialog = page.getByRole("dialog");
  const key = `e2e_${Date.now().toString(36)}`;
  await dialog.getByLabel("Mã trường").fill(key);
  await dialog.getByLabel("Tên hiển thị").fill(`Trường ${key}`);
  await dialog.getByLabel("Nhãn thường gặp trên chứng từ (alias)").fill("E2E Label, Test");
  await dialog.getByRole("button", { name: "Thêm" }).click();
  await expect(page.getByText(`Trường ${key}`).first()).toBeVisible();
  await expect(page.getByText(/^v\d+$/).first()).not.toHaveText(versionBefore ?? "");

  const toggle = page.getByRole("switch", { name: "Đang dùng" });
  const was = await toggle.isChecked();
  await toggle.click();
  await expect(toggle).toBeChecked({ checked: !was });
  await toggle.click();
  await expect(toggle).toBeChecked({ checked: was });
});
