import { expect, test } from "@playwright/test";
import { stateFor } from "./global-setup";
import { createDossier, login, uploadAndConfirm } from "./helpers";

test("AI Agent chạy → xác nhận HS → Review tờ khai (chỉ tiêu + nguồn) → Người duyệt phê duyệt → bước truyền", async ({ page, browser }) => {
  await login(page);
  const id = await createDossier(page);
  await uploadAndConfirm(page, ["Commercial Invoice.pdf", "Packing List.pdf", "Hoa don cuoc GTGT.pdf"]); // có hóa đơn cước → không còn luật chặn FCA

  await page.getByRole("button", { name: "Chạy AI Agent" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Bắt đầu" }).click();
  await expect(page.getByText("Đã dựng tờ khai nháp").first()).toBeVisible({ timeout: 90_000 });
  // Xác nhận HS từng dòng (gợi ý từ biểu thuế giả).
  const confirmButtons = page.getByRole("button", { name: /^Xác nhận mã .* cho dòng \d+$/ });
  await expect(confirmButtons.first()).toBeVisible();
  while ((await confirmButtons.count()) > 0) {
    await confirmButtons.first().click();
    await page.waitForTimeout(300);
  }
  await page.getByRole("button", { name: "Sang Review tờ khai" }).click();
  await expect(page).toHaveURL(/step=review/);
  await expect(page.getByText("Mã số thuế người nhập khẩu")).toBeVisible();
  await expect(page.getByText("0316789012").first()).toBeVisible();
  await expect(page.getByText("Tài khoản").first()).toBeVisible(); // nguồn ACCOUNT

  const approverCtx = await browser.newContext({ storageState: stateFor("tuan") });
  const approver = await approverCtx.newPage();
  await approver.goto(`/dossiers/${id}?step=review`);
  await approver.getByRole("button", { name: "Phê duyệt tờ khai" }).click();
  const dialog = approver.getByRole("dialog");
  const ack = dialog.getByRole("checkbox");
  if (await ack.isVisible({ timeout: 2_000 }).catch(() => false)) await ack.check();
  await dialog.getByRole("button", { name: "Phê duyệt" }).click();
  await expect(approver.getByText("Đã phê duyệt").first()).toBeVisible({ timeout: 15_000 });
  await approverCtx.close();
});
