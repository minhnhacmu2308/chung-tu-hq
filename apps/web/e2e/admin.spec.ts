import { expect, test, type Page } from "@playwright/test";
import { stateFor } from "./global-setup";
import { totpCode } from "./totp";

const R = { reason: "Kiểm thử e2e khu quản trị" };
const SCREENS: [string, string][] = [
  ["/admin", "Tổng quan vận hành"],
  ["/admin/orgs", "Doanh nghiệp"],
  ["/admin/users", "Người dùng"],
  ["/admin/plans", "Gói dịch vụ"],
  ["/admin/usage", "Sử dụng & chi phí"],
  ["/admin/integrations", "Tích hợp dùng chung"],
  ["/admin/system", "Sức khỏe hệ thống"],
  ["/admin/skill-templates", "Skill mẫu"],
  ["/admin/staff", "Quản trị viên"],
  ["/admin/audit", "Nhật ký quản trị"],
  ["/admin/announcements", "Thông báo hệ thống"],
];

async function noScreenError(page: Page) {
  await expect(page.getByText("Màn hình này gặp lỗi")).toHaveCount(0);
  await expect(page.getByText("Không tải được", { exact: false })).toHaveCount(0);
}

test.describe("khu Quản trị hệ thống trên backend thật", () => {
  test.use({ storageState: stateFor("bao") });

  test("quản trị viên cấp cao mở được mọi màn, dữ liệu thật của doanh nghiệp demo hiện ra", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    for (const [path, heading] of SCREENS) {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
      await noScreenError(page);
    }
    await page.goto("/admin/orgs");
    await expect(page.getByText("CÔNG TY TNHH THIẾT BỊ CÔNG NGHIỆP AN PHÁT").first()).toBeVisible();
    await page.goto("/admin/orgs/org_anphat");
    await expect(page.getByRole("heading", { name: "CÔNG TY TNHH THIẾT BỊ CÔNG NGHIỆP AN PHÁT" })).toBeVisible();
    await noScreenError(page);
    expect(errors).toEqual([]);
  });

  test("tạm khóa doanh nghiệp chặn khách đăng nhập; thông báo hệ thống tới panel của khách rồi thu hồi; mọi thao tác vào nhật ký", async ({ page, browser }) => {
    const api = page.request;
    const customer = await browser.newContext({ storageState: stateFor("chau") });
    try {
      expect((await api.post("/api/admin/orgs/org_anphat/suspend", { data: R })).status()).toBe(200);
      const blocked = await customer.request.post("/api/auth/login", { data: { email: "ha.nguyen@anphat-demo.vn", password: "demo1234" } });
      expect(blocked.status()).toBe(403);
      expect(((await blocked.json()) as { code: string }).code).toBe("ORG_SUSPENDED");
      expect((await customer.request.get("/api/notifications")).status()).toBe(401); // phiên cũ hết hiệu lực
    } finally {
      expect((await api.post("/api/admin/orgs/org_anphat/reactivate", { data: R })).status()).toBe(200);
    }
    expect((await customer.request.get("/api/notifications")).status()).toBe(200);

    const title = `Thông báo e2e ${Date.now().toString(36)}`;
    const sent = await api.post("/api/admin/announcements", { data: { title, body: "Nội dung thông báo kiểm thử e2e.", kind: "INFO", audience: "ALL" } });
    expect(sent.status()).toBe(200);
    const { id } = (await sent.json()) as { id: string };
    const page2 = await customer.newPage();
    await page2.goto("/");
    await page2.getByRole("button", { name: /^Thông báo/ }).first().click();
    await expect(page2.getByText(title).first()).toBeVisible();
    expect((await api.post(`/api/admin/announcements/${id}/withdraw`, { data: R })).status()).toBe(200);
    const after = (await (await customer.request.get("/api/notifications")).json()) as { title: string }[];
    expect(after.map((n) => n.title)).not.toContain(title);
    await customer.close();

    await page.goto("/admin/audit");
    await expect(page.getByText(title).first()).toBeVisible();
    await expect(page.getByText(R.reason).first()).toBeVisible();
  });
});

test("tài khoản khách không vào được khu quản trị (giao diện và API)", async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: stateFor("chau") });
  const page = await ctx.newPage();
  expect((await page.request.get("/api/admin/orgs")).status()).toBe(403);
  expect(((await (await page.request.get("/api/admin/session")).json()) as { session: unknown }).session).toBeNull();
  await page.goto("/admin/orgs");
  await expect(page).not.toHaveURL(/\/admin/);
  await ctx.close();
});

test("2FA: quản trị viên chưa thiết lập → màn thiết lập (QR, khóa) chặn mọi dữ liệu; nhập mã → mã khôi phục → vào được; API trước đó bị MFA_REQUIRED", async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await ctx.newPage();
  const login = await page.request.post("/api/auth/login", { data: { email: "trang.mai@khaibao-demo.vn", password: "demo1234" } });
  expect(login.ok()).toBeTruthy();
  const blocked = await page.request.get("/api/admin/orgs");
  expect(blocked.status()).toBe(403);
  expect(((await blocked.json()) as { code: string }).code).toBe("MFA_REQUIRED");

  await page.goto("/admin/orgs");
  await expect(page.getByRole("heading", { name: "Thiết lập xác thực 2 lớp", level: 1 })).toBeVisible();
  await expect(page.getByRole("img", { name: "Mã QR thiết lập ứng dụng xác thực" })).toBeVisible();
  await expect(page.getByText("CÔNG TY TNHH THIẾT BỊ CÔNG NGHIỆP AN PHÁT")).toHaveCount(0);
  const secret = (await page.getByText(/^([A-Z2-7]{4} ){7}[A-Z2-7]{4}$/).textContent())!.replace(/\s/g, "");
  await page.getByLabel("Mã 6 số").fill("000000");
  await page.getByRole("button", { name: "Bật xác thực 2 lớp" }).click();
  await expect(page.getByText("Mã không đúng").first()).toBeVisible();
  await page.getByLabel("Mã 6 số").fill(totpCode(secret));
  await page.getByRole("button", { name: "Bật xác thực 2 lớp" }).click();
  await expect(page.getByRole("list", { name: "Mã khôi phục" }).getByRole("listitem")).toHaveCount(8);
  await page.getByRole("button", { name: "Tôi đã lưu mã khôi phục" }).click();
  await expect(page.getByText("CÔNG TY TNHH THIẾT BỊ CÔNG NGHIỆP AN PHÁT").first()).toBeVisible();
  expect((await page.request.get("/api/admin/orgs")).status()).toBe(200);
  await ctx.close();

  // Dọn: Quản trị cấp cao đặt lại 2FA cho trang (cũng là đường cho người mất điện thoại) → trang bị đăng xuất.
  const bao = await browser.newContext({ storageState: stateFor("bao") });
  const staff = (await (await bao.request.get("/api/admin/staff")).json()) as { id: string; email: string; mfaEnabled?: boolean }[];
  const trang = staff.find((s) => s.email === "trang.mai@khaibao-demo.vn")!;
  expect(trang.mfaEnabled).toBe(true);
  const reset = await bao.request.post(`/api/admin/staff/${trang.id}/mfa-reset`, { data: { reason: "Dọn sau kiểm thử e2e 2FA" } });
  expect(reset.status()).toBe(200);
  expect(((await reset.json()) as { mfaEnabled: boolean }).mfaEnabled).toBe(false);
  await bao.close();
});
