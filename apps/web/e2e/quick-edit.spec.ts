import { expect, test, type Page } from "@playwright/test";
import { createDossier, login, runAgentToReview, uploadAndConfirm } from "./helpers";

// Sửa nhanh tại ô trên bản in tờ khai: bật công tắc → gõ thẳng vào ô (không mở panel) → ô chưa lưu + thanh nổi "Lưu N thay đổi"
// → lưu một lần, còn nguyên sau khi tải lại. Mã không có trong danh mục bị báo đỏ và không vào danh sách lưu.
const full = (id: string) => `/dossiers/${id}?step=review&tab=full`;
const cell = (page: Page, key: string) => page.locator(`[data-print-cell=":${key}"]`);

test("Review: sửa nhanh tại ô 1.58 trên bản in, chặn mã sai, lưu hàng loạt", async ({ page }) => {
  await login(page);
  const id = await createDossier(page);
  await uploadAndConfirm(page, ["Commercial Invoice.pdf", "Packing List.pdf", "Hoa don cuoc GTGT.pdf"]);
  await runAgentToReview(page);

  await page.goto(full(id));
  await page.evaluate(() => window.localStorage.removeItem("kb-print-quick-edit"));
  await page.reload();
  const toggle = page.getByRole("switch", { name: "Sửa nhanh tại ô" });
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");

  // Mã sai: Enter báo đỏ, vẫn ở ô; Esc bỏ phần đang gõ → không có ô chưa lưu.
  await cell(page, "TK_ENC").click();
  await expect(page.getByRole("dialog")).toHaveCount(0); // sửa nhanh: bấm ô chỉ chọn ô, không mở panel
  await page.keyboard.type("Q");
  const input = page.getByRole("textbox", { name: /^1\.58\b/ });
  await expect(input).toHaveValue("Q");
  await page.keyboard.press("Enter");
  await expect(input).toHaveAttribute("aria-invalid", "true");
  await page.keyboard.press("Escape");
  await expect(input).toHaveCount(0);

  // Mã đúng: Enter chốt → ô "Chưa lưu", thanh nổi đếm 1; Lưu → thanh biến mất, giá trị còn sau khi tải lại.
  await cell(page, "TK_ENC").click();
  await page.keyboard.type("d");
  await page.keyboard.press("Enter");
  await expect(cell(page, "TK_ENC")).toContainText("Chưa lưu");
  const bar = page.getByRole("group", { name: "Thay đổi chưa lưu trên bản in" });
  await expect(bar).toContainText("1 ô chưa lưu");
  await bar.getByRole("button", { name: "Lưu 1 thay đổi" }).click();
  await expect(bar).toBeHidden();
  await page.reload();
  await expect(cell(page, "TK_ENC")).toContainText("D");
  await expect(cell(page, "TK_ENC")).not.toContainText("Chưa lưu");
});
