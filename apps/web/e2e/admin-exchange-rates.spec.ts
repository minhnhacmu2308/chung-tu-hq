// Khu Quản trị → Tỷ giá tính thuế: quản trị cấp cao nhập tay tỷ giá ngoại tệ Vietcombank không công bố (TWD) kèm lý do → hiện "Nhập tay", có nhật ký.
import { expect, test } from "@playwright/test";
import { stateFor } from "./global-setup";

test.use({ storageState: stateFor("bao") });

test("nhập tay tỷ giá TWD cho tuần áp dụng → bảng hiện nguồn Nhập tay; API trả đúng; nhật ký ghi lý do", async ({ page }) => {
  const reason = `Tỷ giá chéo NHNN – e2e ${Date.now().toString(36)}`;
  await page.goto("/admin/exchange-rates");
  await expect(page.getByRole("heading", { name: "Tỷ giá tính thuế" })).toBeVisible();
  await expect(page.getByText("Lần chạy kế tiếp")).toBeVisible();

  await page.getByRole("button", { name: "Thêm / sửa tỷ giá" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Ngoại tệ", exact: true }).fill("twd");
  await expect(dialog.getByRole("textbox", { name: "Ngoại tệ", exact: true })).toHaveValue("TWD");
  await dialog.getByLabel("Tỷ giá (VND / 1 đơn vị ngoại tệ)").fill("805.12");
  const week = await dialog.getByLabel("Áp dụng cho tuần").inputValue();
  await dialog.getByLabel("Lý do").fill(reason);
  await dialog.getByRole("button", { name: "Lưu tỷ giá" }).click();
  await expect(dialog).toBeHidden();

  const view = (await (await page.request.get("/api/admin/exchange-rates")).json()) as { weeks: { effectiveFrom: string; rates: { currency: string; rate: string; source: string }[] }[] };
  const twd = view.weeks.find((w) => w.effectiveFrom === week)?.rates.find((r) => r.currency === "TWD");
  expect(twd).toMatchObject({ rate: "805.12", source: "MANUAL" });

  await page.getByRole("tab", { name: new RegExp(`^${week.slice(8, 10)}/${week.slice(5, 7)}`) }).click();
  await expect(page.getByRole("table", { name: /Tỷ giá tuần/ }).getByRole("row").filter({ hasText: "TWD" })).toContainText("Nhập tay");

  await page.goto("/admin/audit");
  await expect(page.getByText(reason).first()).toBeVisible();
});
