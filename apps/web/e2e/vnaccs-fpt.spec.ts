// Tài khoản VNACCS (Kết nối hệ thống) + truyền tờ khai qua HTTP thật tới apps/fpt-mock.
// Phần FPT chỉ chạy khi web + worker bật CUSTOMS_GATEWAY=fpt trỏ fpt-mock:
//   pnpm fpt-mock; CUSTOMS_GATEWAY=fpt FPT_API_BASE_URL=http://localhost:7070 FPT_API_USERNAME=test FPT_API_PASSWORD=test (web + worker)
//   E2E_CUSTOMS_GATEWAY=fpt pnpm test:e2e vnaccs-fpt
import { expect, test, type Page } from "@playwright/test";
import { stateFor } from "./global-setup";
import { createDossier, fillManualFields, login, runAgentToReview, uploadAndConfirm } from "./helpers";

const FPT = process.env.E2E_CUSTOMS_GATEWAY === "fpt";
const MOCK_URL = process.env.E2E_FPT_MOCK_URL ?? "http://localhost:7070";
const ACCOUNT = { userId: "BI820001", password: "12345678", terminalId: "Z0000M", terminalAccessKey: "MOCKTERMINALKEY0" };

/** Thẻ VNACCS = tổ tiên gần nhất của khu tài khoản VNACCS có nút Kiểm tra kết nối. */
const customsHubCard = (page: Page) => page.getByRole("region", { name: "Tài khoản VNACCS" }).locator("xpath=ancestor::*[.//button[normalize-space()='Kiểm tra kết nối']][1]");

async function enterAccount(page: Page, account = ACCOUNT) {
  await page.goto("/settings?tab=integrations");
  const section = page.getByRole("region", { name: "Tài khoản VNACCS" });
  await section.getByRole("button", { name: /Nhập tài khoản VNACCS|Đổi tài khoản/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("User ID").fill(account.userId);
  await dialog.getByLabel("Mật khẩu").fill(account.password);
  await dialog.getByLabel("Terminal ID").fill(account.terminalId);
  await dialog.getByLabel("Terminal Access Key").fill(account.terminalAccessKey);
  await dialog.getByRole("button", { name: "Lưu tài khoản" }).click();
  await expect(dialog).toBeHidden();
  await expect(section).toContainText(account.userId);
}

test("tài khoản VNACCS: thiếu mật khẩu báo lỗi đúng ô; lưu → hiện User ID, không trả mật khẩu; gỡ → chưa nhập", async ({ page }) => {
  await login(page);
  await page.goto("/settings?tab=integrations");
  const section = page.getByRole("region", { name: "Tài khoản VNACCS" });
  await expect(section).toBeVisible();
  if (await section.getByRole("button", { name: "Gỡ" }).isVisible()) await section.getByRole("button", { name: "Gỡ" }).click();
  await expect(section).toContainText("Chưa nhập");

  await section.getByRole("button", { name: "Nhập tài khoản VNACCS" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("User ID").fill(ACCOUNT.userId);
  await dialog.getByRole("button", { name: "Lưu tài khoản" }).click();
  await expect(dialog.getByText("Nhập mật khẩu VNACCS")).toBeVisible();
  await expect(dialog.getByText("Nhập Terminal Access Key")).toBeVisible();
  await dialog.getByRole("button", { name: "Hủy" }).click();

  await enterAccount(page);
  const res = await page.request.get("/api/org/vnaccs-account");
  const body = await res.text();
  expect(JSON.parse(body)).toMatchObject({ configured: true, userId: ACCOUNT.userId, terminalId: ACCOUNT.terminalId });
  expect(body).not.toContain(ACCOUNT.password);
  expect(body).not.toContain(ACCOUNT.terminalAccessKey);

  await section.getByRole("button", { name: "Gỡ" }).click();
  await expect(section).toContainText("Chưa nhập");
  await enterAccount(page); // để lại tài khoản cho các test sau
});

test("người khai (không phải Quản trị) không thấy nút nhập tài khoản; API PUT → 403", async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: stateFor("tuan") });
  const page = await ctx.newPage();
  const role = ((await (await page.request.get("/api/auth/session")).json()) as { user?: { role?: string } }).user?.role;
  test.skip(role === "OWNER" || role === "ADMIN", "tài khoản tuan là quản lý – không kiểm được nhánh này");
  await page.goto("/settings?tab=integrations");
  await expect(page.getByRole("region", { name: "Tài khoản VNACCS" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Nhập tài khoản VNACCS|Đổi tài khoản/ })).toHaveCount(0);
  expect((await page.request.put("/api/org/vnaccs-account", { data: ACCOUNT })).status()).toBe(403);
  await ctx.close();
});

test.describe("qua FPT.VNACCS (fpt-mock)", () => {
  test.skip(!FPT, "chỉ chạy khi E2E_CUSTOMS_GATEWAY=fpt (web + worker trỏ fpt-mock)");

  test("Kiểm tra kết nối Customs Hub → đăng nhập FPT thành công bằng tài khoản vừa nhập", async ({ page }) => {
    await login(page);
    await enterAccount(page);
    await customsHubCard(page).getByRole("button", { name: "Kiểm tra kết nối" }).click();
    await expect(customsHubCard(page)).toContainText("Đăng nhập FPT.VNACCS thành công");
    await expect(customsHubCard(page)).toContainText(ACCOUNT.userId);
  });

  test("ký số & truyền: IDA → IDC → HYS → IEX đi qua HTTP tới fpt-mock, về Đã thông quan với số tờ khai của mock", async ({ page, browser, request }) => {
    test.setTimeout(300_000);
    await login(page);
    await enterAccount(page);
    const certs = (await (await page.request.get("/api/org/certificates")).json()) as unknown[];
    if (certs.length === 0) expect((await page.request.post("/api/org/certificates", { data: { issuer: "Viettel-CA", serial: `E2E${Date.now()}`, validTo: "2027-12-31" } })).ok()).toBeTruthy();
    const before = ((await (await request.get(`${MOCK_URL}/__mock/declarations`)).json()) as { declarationNo: string }[]).map((d) => d.declarationNo);

    const id = await createDossier(page);
    await uploadAndConfirm(page, ["Commercial Invoice.pdf", "Packing List.pdf", "Hoa don cuoc GTGT.pdf"]);
    await runAgentToReview(page);
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
    await approverCtx.close();

    await page.goto(`/dossiers/${id}?step=submit`);
    await page.getByRole("button", { name: "Ký số & truyền tờ khai" }).click();
    await expect(page.getByText("Đã thông quan").first()).toBeVisible({ timeout: 180_000 });

    const after = (await (await request.get(`${MOCK_URL}/__mock/declarations`)).json()) as { declarationNo: string; kind: string; state: string; cleared: boolean }[];
    const created = after.filter((d) => !before.includes(d.declarationNo));
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ kind: "IDA", state: "C", cleared: true });
    await expect(page.getByText(created[0]!.declarationNo).first()).toBeVisible();
  });
});
