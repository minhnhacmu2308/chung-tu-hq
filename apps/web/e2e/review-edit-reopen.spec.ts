import { expect, test } from "@playwright/test";
import { stateFor } from "./global-setup";
import { createDossier, fillManualFields, login, runAgentToReview, uploadAndConfirm } from "./helpers";

/** Ô 1.29 – mã địa điểm lưu kho hàng chờ thông quan (chỉ tiêu KHO) trên tab Tờ khai đầy đủ. */
const KHO = /^1\.29/;
const full = (id: string, nhom: string) => `/dossiers/${id}?step=review&tab=full&nhom=${nhom}`;

test("Review: sửa chỉ tiêu trên tờ khai đầy đủ (chặn chỉ tiêu tính thuế, sai dạng số) → 4 mắt chặn người tạo → người khác duyệt → mở lại để sửa", async ({ page, browser }) => {
  await login(page);
  const id = await createDossier(page);
  await uploadAndConfirm(page, ["Commercial Invoice.pdf", "Packing List.pdf", "Hoa don cuoc GTGT.pdf"]);
  await runAgentToReview(page);

  // Chỉ tiêu là đầu vào tính thuế / do hệ thống cấp chỉ đọc trên form; backend cũng chặn.
  await page.goto(full(id, "chung"));
  await expect(page.getByRole("textbox", { name: /^1\.4\b/ })).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: /^1\.4\b/ })).toHaveCount(0);
  const derived = await page.request.patch(`/api/dossiers/${id}/declaration/fields/TONG_TG`, { data: { value: "1" } });
  expect(derived.status()).toBe(400);
  const badNumber = await page.request.patch(`/api/dossiers/${id}/declaration/fields/TRONG_LUONG`, { data: { value: "5.402,50 kg" } });
  expect(badNumber.status()).toBe(400);
  expect(((await badNumber.json()) as { message: string }).message).toMatch(/phải là số/);

  // Sửa một chỉ tiêu rồi Lưu: còn nguyên sau khi tải lại trang.
  await page.goto(full(id, "van-chuyen"));
  const kho = page.getByRole("textbox", { name: KHO });
  await expect(kho).toBeEditable();
  await kho.fill("03CCS01");
  const save = page.getByRole("button", { name: /^Lưu 1 thay đổi/ });
  await save.click();
  await expect(save).toHaveCount(0); // lưu xong: không còn thay đổi chờ lưu
  await page.reload();
  await expect(page.getByRole("textbox", { name: KHO })).toHaveValue("03CCS01");

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

    await approver.goto(full(id, "van-chuyen"));
    await expect(approver.getByText("Tờ khai đầy đủ theo Phụ lục II – chỉ đọc")).toBeVisible(); // đã duyệt: khóa sửa
    await expect(approver.getByRole("textbox", { name: KHO })).toHaveCount(0);
    await approver.getByRole("button", { name: "Mở lại để sửa" }).click();
    await approver.getByRole("dialog").getByRole("button", { name: "Mở lại tờ khai" }).click();
    await expect(approver.getByText("Bản nháp, chờ duyệt")).toBeVisible();
    await expect(approver.getByRole("textbox", { name: KHO })).toHaveValue("03CCS01"); // sửa tay vẫn giữ sau khi mở lại
    await approverCtx.close();
  } finally {
    await page.request.patch("/api/org/four-eyes", { data: { enabled: false } });
  }
});
