import { expect, type Page } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
export const PDF = (name: string) => path.join(ROOT, "evals/golden/hansol", name);

/** Phiên đã có sẵn từ global-setup (storageState); chỉ mở trang và chắc chắn không bị đẩy về /login. */
export async function login(page: Page) {
  await page.goto("/");
  await expect(page).not.toHaveURL(/\/login/);
}

/** Tạo hồ sơ nhập khẩu qua API (cùng cookie phiên) rồi mở trang chi tiết; trả về id. */
export async function createDossier(page: Page) {
  const res = await page.request.post("/api/dossiers", {
    data: { direction: "NK", typeCode: "A11", partner: "HANSOL PRECISION", customsOffice: "03CE – Chi cục HQ CK cảng Hải Phòng KV III", skillSetId: "default", dueDate: "2026-10-31", incoterm: "FCA", transportMode: "SEA" },
  });
  expect(res.ok()).toBeTruthy();
  const { id } = (await res.json()) as { id: string };
  await page.goto(`/dossiers/${id}?step=upload`);
  return id;
}

/** Upload các PDF, chờ worker đọc xong, mở màn OCR và xác nhận dữ liệu → bước agent. */
export async function uploadAndConfirm(page: Page, files: string[]) {
  await page.locator('input[type="file"]').first().setInputFiles(files.map(PDF));
  await expect(page.getByText(new RegExp(`đã đọc ${files.length}/${files.length}`))).toBeVisible({ timeout: 90_000 });
  await page.getByRole("button", { name: "Xem kết quả đọc" }).click();
  await expect(page.getByRole("heading", { name: "AI đối chiếu chéo" })).toBeVisible();
  await page.getByRole("button", { name: "Xác nhận dữ liệu" }).click();
  const proceed = page.getByRole("button", { name: "Vẫn tiếp tục" });
  if (await proceed.isVisible({ timeout: 3_000 }).catch(() => false)) await proceed.click();
  await expect(page).toHaveURL(/step=agent/);
}

/** Chạy AI Agent, xác nhận hết HS gợi ý rồi sang bước Review tờ khai. */
export async function runAgentToReview(page: Page) {
  await page.getByRole("button", { name: "Chạy AI Agent" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Bắt đầu" }).click();
  await expect(page.getByText("Đã dựng tờ khai nháp").first()).toBeVisible({ timeout: 90_000 });
  const confirmButtons = page.getByRole("button", { name: /^Xác nhận mã .* cho dòng \d+$/ });
  await expect(confirmButtons.first()).toBeVisible();
  while ((await confirmButtons.count()) > 0) {
    await confirmButtons.first().click();
    await page.waitForTimeout(300);
  }
  await page.getByRole("button", { name: "Sang Review tờ khai" }).click();
  await expect(page).toHaveURL(/step=review/);
}
