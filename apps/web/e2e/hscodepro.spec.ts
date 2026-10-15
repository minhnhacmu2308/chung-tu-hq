// Phân loại HS qua HSCodePro (HTTP tới máy giả lập trong apps/fpt-mock): AI hỏi lại → người khai trả lời → có mã → xác nhận → Review.
// Chỉ chạy khi worker bật HSCodePro trỏ máy giả lập:
//   pnpm fpt-mock; worker: HS_CLASSIFIER=hscodepro HSCODEPRO_URL=http://localhost:7070 HSCODEPRO_INTERNAL_KEY=dev-hs-key
//   E2E_HS=hscodepro pnpm test:e2e hscodepro
import { expect, test } from "@playwright/test";
import { createDossier, login, uploadAndConfirm } from "./helpers";

test.skip(process.env.E2E_HS !== "hscodepro", "Cần worker HS_CLASSIFIER=hscodepro + pnpm fpt-mock (E2E_HS=hscodepro)");

test("AI phân loại HS hỏi lại dòng thanh trượt → trả lời → có mã kèm thuế → xác nhận hết → sang Review", async ({ page }) => {
  test.setTimeout(240_000);
  await login(page);
  await createDossier(page);
  await uploadAndConfirm(page, ["Commercial Invoice.pdf", "Packing List.pdf", "Hoa don cuoc GTGT.pdf"]);

  await page.getByRole("button", { name: "Chạy AI Agent" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Bắt đầu" }).click();

  // HSCodePro giả lập: dòng "Linear guide…" cần bổ sung công dụng; agent không bị chặn, vẫn dựng tờ khai nháp.
  const answerButtons = page.getByRole("button", { name: /^Trả lời AI cho dòng \d+$/ });
  await expect(answerButtons.first()).toBeVisible({ timeout: 120_000 });
  await expect(page.getByText("Đã dựng tờ khai nháp").first()).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText("Cần bổ sung").first()).toBeVisible();

  while ((await answerButtons.count()) > 0) {
    await answerButtons.first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("radiogroup", { name: /dùng cho loại máy nào/ })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Gửi câu trả lời" })).toBeDisabled();
    await dialog.getByText("Máy công cụ (CNC, máy phay, máy tiện)").click();
    await dialog.getByRole("button", { name: "Gửi câu trả lời" }).click();
    await expect(dialog).toBeHidden();
  }

  // Sau khi trả lời: máy giả lập trả mã 8466.93.90 cho thanh trượt (poll 3 giây).
  const confirmButtons = page.getByRole("button", { name: /^Xác nhận mã .* cho dòng \d+$/ });
  await expect(page.getByText("8466.93.90").first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/\d+% · 10%/).first()).toBeVisible(); // thuế NK · VAT theo gợi ý
  await expect(page.getByText(/Đang phân loại|Đang chờ|Đang gửi câu trả lời/)).toHaveCount(0, { timeout: 60_000 });
  while ((await confirmButtons.count()) > 0) {
    await confirmButtons.first().click();
    await page.waitForTimeout(300);
  }
  await page.getByRole("button", { name: "Sang Review tờ khai" }).click();
  await expect(page).toHaveURL(/step=review/);
});
