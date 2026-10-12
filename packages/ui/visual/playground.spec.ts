import { expect, test, type Page } from "@playwright/test";

// Font hệ thống (không tải Google Fonts qua mạng) + ẩn trợ lý AI → ảnh ổn định giữa các lần chạy.
const STABLE = "font=system&ai=0";

async function open(page: Page, query: string) {
  await page.goto(`/?${STABLE}&${query}`);
  await page.waitForLoadState("networkidle");
}

test.describe("Giao diện tổng thể", () => {
  for (const [name, query] of [
    ["sang-mac-dinh", "mode=light"],
    ["toi-mac-dinh", "mode=dark"],
    ["sang-mau-cam-gon-vuong", "mode=light&brand=EA580C&density=compact&radius=square"],
    ["toi-xanh-duong-gray-aurora", "mode=dark&brand=2563EB&gray=gray&backdrop=aurora"],
  ] as const) {
    test(name, async ({ page }) => {
      await open(page, query);
      await expect(page).toHaveScreenshot(`${name}.png`, { fullPage: true });
    });
  }
});

test.describe("Thành phần tương tác", () => {
  test("dialog-dang-panel", async ({ page, isMobile }) => {
    test.skip(isMobile, "Dialog panel chỉ chụp trên desktop");
    await open(page, "mode=light");
    await page.getByRole("button", { name: "Giao diện" }).click();
    await expect(page.getByRole("dialog", { name: "Cấu hình giao diện" })).toBeVisible();
    await expect(page).toHaveScreenshot("dialog-dang-panel.png");
  });

  test("so-do-quy-trinh", async ({ page }) => {
    await open(page, "mode=light");
    await page.getByRole("button", { name: "Xem cây quy trình" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Đang ở bước này")).toBeVisible();
    await expect(dialog).toHaveScreenshot("so-do-quy-trinh.png");
  });

  test("menu-mobile", async ({ page, isMobile }) => {
    test.skip(!isMobile, "Ngăn kéo menu chỉ có trên màn nhỏ");
    await open(page, "mode=light");
    await page.getByRole("button", { name: "Mở menu" }).click();
    await expect(page.getByRole("dialog", { name: "Điều hướng chính" })).toBeVisible();
    await expect(page).toHaveScreenshot("menu-mobile.png");
  });

  test("bang-ho-so", async ({ page, isMobile }) => {
    test.skip(isMobile, "Bảng dữ liệu chụp trên desktop");
    await open(page, "mode=light");
    const table = page.getByRole("table", { name: "Danh sách hồ sơ" });
    await table.scrollIntoViewIfNeeded();
    await expect(table).toHaveScreenshot("bang-ho-so.png");
  });
});
