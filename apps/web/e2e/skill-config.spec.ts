import { expect, test, type Page } from "@playwright/test";
import { login } from "./helpers";

/** Gỡ các trường thử nghiệm e2e_* còn sót trên skill (mỗi skill tối đa 20 trường bổ sung – chạy e2e nhiều lần sẽ chạm giới hạn). */
async function removeE2eFields(page: Page, skillId: string) {
  const skill = (await (await page.request.get(`/api/skills/${skillId}`)).json()) as { fields: { key: string }[] };
  for (const f of skill.fields.filter((x) => x.key.startsWith("e2e_"))) {
    expect((await page.request.delete(`/api/skills/${skillId}/fields/${encodeURIComponent(f.key)}`)).ok()).toBeTruthy();
  }
}

test("cấu hình skill: danh sách → chi tiết → thêm trường tạo phiên bản mới → bật/tắt skill", async ({ page }) => {
  await login(page);
  await page.goto("/skills");
  await expect(page.getByRole("heading", { name: "Cách đọc chứng từ" })).toBeVisible();
  // Mã, phiên bản, cột kỹ thuật chỉ hiện ở chế độ Nâng cao (lưu theo trình duyệt).
  const advanced = page.getByRole("switch", { name: "Nâng cao" });
  if (!(await advanced.isChecked())) await advanced.click();
  await page.getByRole("link", { name: /SK-INV-GEN/ }).first().click();
  await expect(page.getByRole("heading", { name: "Commercial Invoice – chung" })).toBeVisible();
  const skillId = new URL(page.url()).pathname.split("/").at(-1)!;
  await removeE2eFields(page, skillId);
  await page.reload();
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
  await removeE2eFields(page, skillId);
});
