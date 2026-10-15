// Bảng đọc chứng từ theo danh mục trường chuẩn + xuất Excel (mỗi chứng từ một sheet: STT | TÊN TRƯỜNG | TRỊ GIÁ).
import ExcelJS from "exceljs";
import { expect, test } from "@playwright/test";
import { createDossier, login, uploadAndConfirm } from "./helpers";

test("màn đọc chứng từ có bảng theo danh mục; xuất Excel đúng định dạng", async ({ page }) => {
  test.setTimeout(180_000);
  await login(page);
  const id = await createDossier(page);
  await uploadAndConfirm(page, ["Commercial Invoice.pdf", "Packing List.pdf"]);
  await page.goto(`/dossiers/${id}?step=ocr`);

  await expect(page.getByText("Bảng đọc chứng từ", { exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("table", { name: /Bảng đọc .*Commercial Invoice/ })).toContainText("Số hóa đơn");

  const sheets = (await (await page.request.get(`/api/dossiers/${id}/document-sheets`)).json()) as { kind: string; rows: { label: string; value: string }[] }[];
  const inv = sheets.find((s) => s.kind === "INVOICE")!;
  expect(inv.rows[0]).toMatchObject({ label: "Số hóa đơn" });

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Xuất Excel" }).click();
  const file = await (await download).path();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file!);
  expect(wb.worksheets.length).toBe(sheets.length);
  const ws = wb.worksheets.find((w) => w.name.startsWith("Commercial Invoice"))!;
  expect([ws.getCell("A1").value, ws.getCell("B1").value, ws.getCell("C1").value]).toEqual(["STT", "TÊN TRƯỜNG", "TRỊ GIÁ"]);
  expect(ws.getCell("B2").value).toBe("Số hóa đơn");
});
