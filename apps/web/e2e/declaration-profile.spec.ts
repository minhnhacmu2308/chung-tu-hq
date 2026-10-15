// Cài đặt → Khai báo: mặc định khai báo + nguồn chỉ tiêu → dựng tờ khai dùng đúng cấu hình.
import { expect, test } from "@playwright/test";
import { createDossier, login, runAgentToReview, uploadAndConfirm } from "./helpers";

test("mặc định KHO + ghi đè KHAI_TG → tờ khai mới dùng giá trị cấu hình; chỉ tiêu trị giá bị khóa", async ({ page }) => {
  test.setTimeout(240_000);
  await login(page);
  // Đặt lại cấu hình về trạng thái biết trước.
  expect((await page.request.put("/api/org/declaration-profile/NK", { data: { values: {}, overrides: {} } })).ok()).toBeTruthy();

  await page.goto("/settings?tab=declaration");
  await expect(page.getByRole("heading", { name: "Mặc định khai báo" })).toBeVisible();
  await page.getByLabel("Mã địa điểm lưu kho mặc định (KHO)").fill("02CIS01 – Kho CY Cát Lái");
  await page.getByRole("button", { name: "Lưu mặc định" }).click();
  await expect(page.getByText("Đã lưu mặc định khai báo").first()).toBeVisible();

  const khaiTg = page.getByRole("listitem").filter({ hasText: "Mã phân loại khai trị giá" });
  await khaiTg.getByRole("button", { name: "Đổi nguồn" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("label").filter({ hasText: "Giá trị cố định" }).first().click(); // radio sr-only của SegmentedControl → bấm nhãn
  await dialog.getByRole("textbox", { name: "Giá trị cố định" }).fill("1 – Khai trị giá tổng hợp");
  await dialog.getByRole("button", { name: "Lưu", exact: true }).click();
  await expect(khaiTg).toContainText("Cố định: 1 – Khai trị giá tổng hợp");
  await expect(page.getByRole("listitem").filter({ hasText: "Tổng trị giá hóa đơn" })).toContainText("Khóa – tính từ trị giá");

  // API chặn ghi đè chỉ tiêu trị giá.
  expect((await page.request.put("/api/org/declaration-profile/NK", { data: { values: {}, overrides: { TONG_TG: { fixed: "1" } } } })).status()).toBe(403);

  const id = await createDossier(page);
  await uploadAndConfirm(page, ["Commercial Invoice.pdf", "Packing List.pdf", "Hoa don cuoc GTGT.pdf"]);
  await runAgentToReview(page);
  const view = (await (await page.request.get(`/api/dossiers/${id}/declaration`)).json()) as { declaration: { fields: { code: string; value: string }[] } };
  expect(view.declaration.fields.find((f) => f.code === "KHO")?.value).toBe("02CIS01 – Kho CY Cát Lái");
  expect(view.declaration.fields.find((f) => f.code === "KHAI_TG")?.value).toBe("1 – Khai trị giá tổng hợp");

  // Dọn để không ảnh hưởng e2e khác.
  await page.request.put("/api/org/declaration-profile/NK", { data: { values: {}, overrides: {} } });
});
