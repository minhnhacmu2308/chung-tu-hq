import { expect, test } from "@playwright/test";
import { stateFor } from "./global-setup";
import { createDossier, fillManualFields, login, runAgentToReview, uploadAndConfirm } from "./helpers";

test("danh sách hồ sơ: hồ sơ mới hiện ở đầu, tìm theo đối tác, lọc theo phạm vi, mở chi tiết", async ({ page }) => {
  await login(page);
  const partner = `E2E LIST ${Date.now().toString(36).toUpperCase()}`;
  const res = await page.request.post("/api/dossiers", {
    data: { direction: "NK", typeCode: "A11", partner, customsOffice: "03CE – Chi cục HQ CK cảng Hải Phòng KV III", skillSetId: "default", dueDate: "2026-12-31", incoterm: "FOB", transportMode: "SEA_CONTAINER" },
  });
  expect(res.ok()).toBeTruthy();
  const { id, code } = (await res.json()) as { id: string; code: string };

  await page.goto("/dossiers");
  await expect(page.getByRole("heading", { name: "Hồ sơ khai báo", level: 1 })).toBeVisible();
  await page.getByPlaceholder("Tìm kiếm…").fill(partner);
  const row = page.getByRole("row").filter({ hasText: partner });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText(code);

  await page.goto("/dossiers?direction=XK");
  await page.getByPlaceholder("Tìm kiếm…").fill(partner);
  await expect(page.getByRole("row").filter({ hasText: partner })).toHaveCount(0);

  await page.goto("/dossiers?direction=NK");
  await page.getByPlaceholder("Tìm kiếm…").fill(partner);
  await page.getByRole("row").filter({ hasText: partner }).getByText(code).click();
  await expect(page).toHaveURL(new RegExp(`/dossiers/${id}`));
});

test("truyền Hải quan: ký số & truyền → IDA/IDC/HYS/IEX qua cổng giả → phân luồng, thông quan, nhật ký thông điệp", async ({ page, browser }) => {
  test.setTimeout(240_000);
  await login(page);
  // Chứng thư số để ký (Customs Hub ký thay bằng chứng thư đã đăng ký).
  const certs = (await (await page.request.get("/api/org/certificates")).json()) as unknown[];
  if (certs.length === 0) expect((await page.request.post("/api/org/certificates", { data: { issuer: "Viettel-CA", serial: `E2E${Date.now()}`, validTo: "2027-12-31" } })).ok()).toBeTruthy();

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
  // Cổng giả cố ý cho HYS lỗi lần đầu ở ~1/7 hồ sơ ("phiên ký số hết hạn") → người khai bấm Gửi lại HYS.
  const cleared = page.getByText("Đã thông quan").first();
  const resendHys = page.getByRole("button", { name: "Gửi lại HYS" });
  await expect(cleared.or(page.getByText(/E-SIG-401/).first())).toBeVisible({ timeout: 120_000 });
  if (!(await cleared.isVisible()) && (await resendHys.isVisible())) await resendHys.click();
  await expect(cleared).toBeVisible({ timeout: 120_000 });
  await expect(page.getByText(/luồng (xanh|vàng|đỏ)/i).first()).toBeVisible();
  type View = { result: { declarationNo: string | null; clearanceStatus: string } };
  const submission = async () => (await (await page.request.get(`/api/dossiers/${id}/submission`)).json()) as View;
  // Giao diện có thể hiện "Đã thông quan" trước một nhịp so với lần đọc API → chờ API.
  await expect.poll(async () => (await submission()).result.clearanceStatus, { timeout: 15_000 }).toBe("CLEARED");
  expect((await submission()).result.declarationNo).toMatch(/^\d{12}$/);
  // Đã truyền: không mở lại tờ khai được nữa.
  expect((await page.request.post(`/api/dossiers/${id}/declaration/reopen`, { data: {} })).status()).toBe(409);
});
