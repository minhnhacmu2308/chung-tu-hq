import { expect, test } from "@playwright/test";
import { stateFor } from "./global-setup";
import { approveDeclaration, createDossier, ensureCertificate, fillManualFields, login, runAgentToReview, uploadAndConfirm } from "./helpers";

test("xác nhận tờ khai đã hủy: khai tạm IDA có số → người duyệt ghi nhận hủy → tờ hiện 'Đã hủy'", async ({ page, browser }) => {
  test.setTimeout(300_000);
  await login(page);
  await ensureCertificate(page);

  const id = await createDossier(page);
  await uploadAndConfirm(page, ["Commercial Invoice.pdf", "Packing List.pdf", "Hoa don cuoc GTGT.pdf"]);
  await runAgentToReview(page);
  await fillManualFields(page, id);

  const approverCtx = await browser.newContext({ storageState: stateFor("tuan") });
  try {
    const approver = await approverCtx.newPage();
    await approveDeclaration(approver, id);

    // Người khai: ký số & khai tạm IDA → có số tờ khai (chưa khai chính thức).
    await page.goto(`/dossiers/${id}?step=submit`);
    await page.getByRole("button", { name: "Ký số & khai tạm (IDA)" }).click();
    const skipHys = page.getByRole("dialog").getByRole("button", { name: "Vẫn khai, không cần HYS" });
    const filed = page.getByText("Đã khai tạm").first();
    await expect(skipHys.or(filed)).toBeVisible({ timeout: 60_000 });
    if (await skipHys.isVisible()) await skipHys.click();
    await expect(filed).toBeVisible({ timeout: 60_000 });

    // Người duyệt: ghi nhận Hải quan đã hủy tờ khai.
    await approver.goto(`/dossiers/${id}?step=submit`);
    await approver.getByRole("button", { name: /^Xác nhận tờ khai đã hủy/ }).first().click();
    const dialog = approver.getByRole("dialog", { name: "Xác nhận tờ khai đã hủy" }); // danh sách chọn lý do cũng là role dialog
    await dialog.getByRole("combobox", { name: /Lý do hủy/ }).click();
    await approver.getByRole("option", { name: /^H01/ }).click(); // dòng đầu là "Chọn lý do hủy" (giá trị trống)
    await dialog.getByRole("button", { name: "Xác nhận đã hủy" }).click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });
    await expect(approver.getByText("Đã hủy").first()).toBeVisible({ timeout: 15_000 });

    type View = { branches?: { no: number; stage: string }[]; result?: unknown };
    await expect
      .poll(async () => {
        const v = (await (await approver.request.get(`/api/dossiers/${id}/submission`)).json()) as View;
        return v.branches?.[0]?.stage;
      }, { timeout: 30_000 })
      .toBe("CANCELLED");
  } finally {
    await approverCtx.close();
  }
});
