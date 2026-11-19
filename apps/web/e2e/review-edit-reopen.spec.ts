import { expect, test, type Page } from "@playwright/test";
import { stateFor } from "./global-setup";
import { createDossier, fillManualFields, login, runAgentToReview, uploadAndConfirm } from "./helpers";

/** Ô 1.29 – mã địa điểm lưu kho hàng chờ thông quan (chỉ tiêu KHO): ô VD_ST trên bản in, ô nhập trong panel sửa. */
// Tên ô nhập trong panel = tên chỉ tiêu (không kèm số "1.29" – số nằm ở tiêu đề panel).
const KHO = /Mã địa điểm lưu kho hàng chờ thông quan/;
const full = (id: string) => `/dossiers/${id}?step=review&tab=full`;
/** Bấm ô chỉ tiêu chung trên bản in (data-print-cell = ":<khóa>") → mở panel sửa ô. */
const openCell = async (page: Page, key: string) => {
  await page.locator(`[data-print-cell=":${key}"]`).click();
  const panel = page.getByRole("dialog");
  await expect(panel).toBeVisible();
  return panel;
};

test("Review: sửa chỉ tiêu trên bản in tờ khai (chặn chỉ tiêu tính thuế, sai dạng số) → 4 mắt chặn người tạo → người khác duyệt → mở lại để sửa", async ({ page, browser }) => {
  await login(page);
  const id = await createDossier(page);
  await uploadAndConfirm(page, ["Commercial Invoice.pdf", "Packing List.pdf", "Hoa don cuoc GTGT.pdf"]);
  await runAgentToReview(page);

  // Chỉ tiêu là đầu vào tính thuế / do hệ thống cấp chỉ đọc trong panel; backend cũng chặn.
  await page.goto(full(id));
  // Thông báo giai đoạn nằm trong HelpPopover (nút ? cạnh tiêu đề), không còn khung Alert.
  await page.getByRole("button", { name: "Hướng dẫn sửa tờ khai" }).click();
  await expect(page.getByRole("dialog", { name: "Hướng dẫn sửa tờ khai" }).getByText("Tờ khai chưa khai báo – nhập đủ chỉ tiêu")).toBeVisible();
  await page.keyboard.press("Escape");
  let panel = await openCell(page, "TK_ICB");
  // Panel chỉ đọc: không có ô nhập nào.
  await expect(panel.getByRole("heading", { name: /^1\.4\b/ })).toBeVisible();
  await expect(panel.getByRole("textbox")).toHaveCount(0);
  await expect(panel.getByRole("combobox")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  const derived = await page.request.patch(`/api/dossiers/${id}/declaration/fields/TONG_TG`, { data: { value: "1" } });
  expect(derived.status()).toBe(400);
  const badNumber = await page.request.patch(`/api/dossiers/${id}/declaration/fields/TRONG_LUONG`, { data: { value: "5.402,50 kg" } });
  expect(badNumber.status()).toBe(400);
  expect(((await badNumber.json()) as { message: string }).message).toMatch(/phải là số/);

  // Sửa một chỉ tiêu trong panel rồi Lưu: panel đóng, giá trị còn nguyên sau khi tải lại trang.
  panel = await openCell(page, "VD_ST");
  const kho = panel.getByRole("textbox", { name: KHO });
  await expect(kho).toBeEditable();
  await kho.fill("03CCS01");
  await panel.getByRole("button", { name: /^Lưu 1 thay đổi/ }).click();
  await expect(panel).toBeHidden(); // lưu xong: panel đóng
  await page.reload();
  await expect(page.locator('[data-print-cell=":VD_ST"]')).toContainText("03CCS01");

  // Bật 4 mắt: người tạo hồ sơ không tự duyệt (cả giao diện lẫn API).
  const on = await page.request.patch("/api/org/four-eyes", { data: { enabled: true } });
  expect(on.ok()).toBeTruthy();
  try {
    await page.reload();
    await expect(page.getByText("Cần người khác phê duyệt")).toBeVisible();
    await expect(page.getByRole("button", { name: "Phê duyệt tờ khai" })).toBeDisabled();
    expect((await page.request.post(`/api/dossiers/${id}/declaration/approve`, { data: {} })).status()).toBe(403);

    // Người duyệt khác: duyệt được, rồi mở lại để sửa → về bản nháp, sửa tiếp được.
    await fillManualFields(page, id);
    const approverCtx = await browser.newContext({ storageState: stateFor("tuan") });
    const approver = await approverCtx.newPage();
    await approver.goto(`/dossiers/${id}?step=review`);
    await approver.getByRole("button", { name: "Phê duyệt tờ khai" }).click();
    const dialog = approver.getByRole("dialog");
    const ack = dialog.getByRole("checkbox");
    if (await ack.isVisible({ timeout: 2_000 }).catch(() => false)) await ack.check();
    await dialog.getByRole("button", { name: "Phê duyệt", exact: true }).click();
    await expect(approver).toHaveURL(/step=submit/, { timeout: 15_000 });

    await approver.goto(full(id));
    // Đã duyệt: khóa sửa – "Tờ khai chỉ đọc" nằm trong nút ? cạnh tiêu đề, không còn khung Alert.
    await approver.getByRole("button", { name: "Hướng dẫn sửa tờ khai" }).click();
    await expect(approver.getByRole("dialog", { name: "Hướng dẫn sửa tờ khai" }).getByText("Tờ khai chỉ đọc")).toBeVisible();
    await approver.keyboard.press("Escape");
    const locked = await openCell(approver, "VD_ST");
    await expect(locked.getByRole("textbox", { name: KHO })).toHaveCount(0);
    await approver.keyboard.press("Escape");
    await expect(locked).toBeHidden();
    await approver.getByRole("button", { name: "Mở lại để sửa" }).click();
    await approver.getByRole("dialog").getByRole("button", { name: "Mở lại tờ khai" }).click();
    await expect(approver.getByText("Bản nháp, chờ duyệt")).toBeVisible();
    const reopened = await openCell(approver, "VD_ST");
    await expect(reopened.getByRole("textbox", { name: KHO })).toHaveValue("03CCS01"); // sửa tay vẫn giữ sau khi mở lại
    await approverCtx.close();
  } finally {
    await page.request.patch("/api/org/four-eyes", { data: { enabled: false } });
  }
});
