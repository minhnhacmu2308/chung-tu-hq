import { expect, test } from "@playwright/test";
import { stateFor } from "./global-setup";
import { createDossier, fillManualFields, login, runAgentToReview, uploadAndConfirm } from "./helpers";

const KHO = "Mã địa điểm lưu kho hàng chờ thông quan dự kiến";

test("Review: sửa chỉ tiêu (chặn chỉ tiêu tính thuế, sai dạng số) → 4 mắt chặn người tạo → người khác duyệt → mở lại để sửa", async ({ page, browser }) => {
  await login(page);
  const id = await createDossier(page);
  await uploadAndConfirm(page, ["Commercial Invoice.pdf", "Packing List.pdf", "Hoa don cuoc GTGT.pdf"]);
  await runAgentToReview(page);

  // Chỉ tiêu là đầu vào tính thuế / do hệ thống cấp không có nút Sửa; backend cũng chặn.
  await expect(page.getByRole("button", { name: `Sửa ${KHO}` })).toBeVisible();
  for (const label of ["Tổng trị giá hóa đơn", "Số tờ khai", "Mã loại hình", "Phí vận chuyển"]) await expect(page.getByRole("button", { name: `Sửa ${label}`, exact: true })).toHaveCount(0);
  const derived = await page.request.patch(`/api/dossiers/${id}/declaration/fields/TONG_TG`, { data: { value: "1" } });
  expect(derived.status()).toBe(400);
  const badNumber = await page.request.patch(`/api/dossiers/${id}/declaration/fields/TRONG_LUONG`, { data: { value: "5.402,50 kg" } });
  expect(badNumber.status()).toBe(400);
  expect(((await badNumber.json()) as { message: string }).message).toMatch(/phải là số/);

  // Sửa một chỉ tiêu: nguồn "Người khai sửa", còn nguyên sau khi tải lại trang.
  await page.getByRole("button", { name: `Sửa ${KHO}` }).click();
  const edit = page.getByRole("dialog");
  await expect(edit.getByRole("button", { name: "Lưu" })).toBeDisabled();
  await edit.getByLabel("Giá trị mới").fill("03CCS01 – Kho CFS Tân Vũ");
  await edit.getByRole("button", { name: "Lưu" }).click();
  await expect(page.getByText("03CCS01 – Kho CFS Tân Vũ").first()).toBeVisible();
  await page.reload();
  await expect(page.getByText("03CCS01 – Kho CFS Tân Vũ").first()).toBeVisible();
  await expect(page.getByText("Người khai sửa").first()).toBeVisible();

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

    await approver.goto(`/dossiers/${id}?step=review`);
    await expect(approver.getByRole("button", { name: /^Sửa / })).toHaveCount(0); // đã duyệt: khóa sửa
    await approver.getByRole("button", { name: "Mở lại để sửa" }).click();
    await approver.getByRole("dialog").getByRole("button", { name: "Mở lại tờ khai" }).click();
    await expect(approver.getByText("Bản nháp, chờ duyệt")).toBeVisible();
    await expect(approver.getByRole("button", { name: `Sửa ${KHO}` })).toBeVisible();
    await expect(approver.getByText("03CCS01 – Kho CFS Tân Vũ").first()).toBeVisible(); // sửa tay vẫn giữ sau khi mở lại
    await approverCtx.close();
  } finally {
    await page.request.patch("/api/org/four-eyes", { data: { enabled: false } });
  }
});
