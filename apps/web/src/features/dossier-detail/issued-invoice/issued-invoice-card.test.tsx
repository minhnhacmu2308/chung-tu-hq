// @vitest-environment jsdom
// Khối Hóa đơn thương mại (ADR 0013 mục 3): cấp số trước khai → phát hành sau thông quan (mẫu + thông tin bổ sung) → in; hủy số cần lý do; a11y.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_INVOICE_LAYOUT } from "@kb/contracts";
import { saveInvoiceTemplate } from "@/api/invoice-templates";
import { getIssuedInvoices, issueInvoiceAction } from "@/api/issued-invoice";
import { saveManualShipment } from "@/api/manual-shipment";
import { getDb, resetDb } from "@/mocks/db";
import { SEED_SETS } from "@/mocks/seed/catalog";
import { expectNoA11yViolations, renderWithProviders } from "@/test/dom";
import { IssuedInvoiceCard } from "./issued-invoice-card";

const T = { timeout: 20_000 };
const DOS = "dos_025";
const DATA = { buyer: { name: "NORDIC TOOLING GROUP AB" }, invoice: { incoterm: "FOB", currency: "USD" }, items: [{ description: "Drill bit 10mm", quantity: "1000", unit: "PCE", unitPrice: "1.25" }] };
const render = () => renderWithProviders(<IssuedInvoiceCard dossierId={DOS} />);
const period = () => {
  const iso = new Date().toISOString();
  return `${iso.slice(2, 4)}${iso.slice(5, 7)}`;
};
const dossier = () => getDb().dossiers.find((x) => x.id === DOS)!;

beforeEach(() => {
  resetDb();
  Object.assign(dossier(), { status: "DRAFT", direction: "XK", documentSources: { INVOICE: "ISSUED", PACKING_LIST: "ISSUED" } });
  delete dossier().declarationNo;
});

describe("IssuedInvoiceCard", () => {
  it("chưa cấp số → hiện số sẽ cấp; cấp số → số INV{YYMM}-001, chưa phát hành được; a11y", async () => {
    const { container } = render();
    expect(await screen.findByText(`INV${period()}-001`, {}, T)).toBeTruthy();
    await expectNoA11yViolations(container);
    await userEvent.click(screen.getByRole("button", { name: "Cấp số hóa đơn" }));
    const dialog = await screen.findByRole("alertdialog", {}, T).catch(() => screen.findByRole("dialog", {}, T));
    await userEvent.click(within(dialog).getByRole("button", { name: "Cấp số hóa đơn" }));
    await waitFor(() => expect(getDb().issuedInvoices.map((x) => [x.invoice.no, x.invoice.status])).toEqual([[`INV${period()}-001`, "RESERVED"]]), T);
    expect(await screen.findByText(/Số đã điền vào tờ khai/, {}, T)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Phát hành hóa đơn" })).toBeNull();
  }, 60_000);

  it("đã thông quan → phát hành với số L/C, B/L → nút in; thiếu dữ liệu thì khóa nút", async () => {
    await issueInvoiceAction(DOS, { action: "RESERVE" });
    Object.assign(dossier(), { status: "CLEARED", declarationNo: "306123456780" });
    const { unmount } = render();
    expect(await screen.findByText("Chưa đủ dữ liệu để phát hành", {}, T)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Phát hành hóa đơn" }) as HTMLButtonElement).disabled).toBe(true);
    unmount();
    dossier().status = "DRAFT";
    await saveManualShipment(DOS, DATA);
    dossier().status = "CLEARED";
    render();
    await userEvent.click(await screen.findByRole("button", { name: "Phát hành hóa đơn" }, T));
    const dialog = await screen.findByRole("dialog", {}, T);
    expect(within(dialog).getByText("306123456780")).toBeTruthy();
    await userEvent.type(within(dialog).getByLabelText(/^Số L\/C/), "LC-889");
    await userEvent.type(within(dialog).getByLabelText(/^Số vận đơn/), "HPH123");
    await expectNoA11yViolations(dialog);
    await userEvent.click(within(dialog).getByRole("button", { name: "Phát hành" }));
    await waitFor(() => expect(getDb().issuedInvoices[0]?.invoice).toMatchObject({ status: "ISSUED", snapshot: { extra: { lcNo: "LC-889", blNo: "HPH123" }, declarationNo: "306123456780" } }), T);
    expect(await screen.findByRole("link", { name: "In hóa đơn" }, T)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Phát hành lại" })).toBeTruthy();
  }, 60_000);

  it("mẫu in theo bộ Kho: dòng đổi ĐVT có quy đổi → in lượng quy đổi; thiếu quy đổi → giữ lượng gốc + cảnh báo (không khóa phát hành)", async () => {
    await saveInvoiceTemplate(null, { name: "Theo mã kho", isDefault: true, layout: { ...DEFAULT_INVOICE_LAYOUT, itemCodeSet: { codeSetId: SEED_SETS.WH } } });
    const cat = getDb().catalog.items;
    const canvas = cat.find((i) => i.name === "Vải canvas cotton khổ 1,5 m")!; // Kho tính kg, chưa có quy đổi
    const cable = cat.find((i) => i.name === "Dây cáp điện CVV 3x2.5mm2")!; // Kho tính cuộn, 1 ROL = 100 MTR
    await saveManualShipment(DOS, {
      ...DATA,
      items: [
        { description: canvas.name, quantity: "50", unit: "MTR", unitPrice: "2", catalogItemId: canvas.id },
        { description: cable.name, quantity: "300", unit: "MTR", unitPrice: "1.5", catalogItemId: cable.id },
      ],
    });
    await issueInvoiceAction(DOS, { action: "RESERVE" });
    Object.assign(dossier(), { status: "CLEARED", declarationNo: "306123456780" });
    const view = await getIssuedInvoices(DOS);
    expect(view.printWarnings).toEqual([{ lineNo: 1, code: "UNIT_FACTOR_MISSING" }]);
    expect(view.preview!.items.map((x) => [x.printedCode, x.printedQuantity, x.printedUnit, x.printedUnitPrice])).toEqual([
      ["VAI-C15", "50", "MTR", null],
      ["dc 0001", "3", "ROL", "150"],
    ]);
    const { container } = render();
    const alert = await screen.findByText(/Dòng 1: ĐVT của bộ mã khác ĐVT dòng/, {}, T);
    expect(alert).toBeTruthy();
    expect((screen.getByRole("button", { name: "Phát hành hóa đơn" }) as HTMLButtonElement).disabled).toBe(false);
    await expectNoA11yViolations(container);
  }, 60_000);

  it("hủy số cần lý do → VOID, cấp tiếp số mới", async () => {
    await issueInvoiceAction(DOS, { action: "RESERVE" });
    render();
    await userEvent.click(await screen.findByRole("button", { name: "Hủy số" }, T));
    const dialog = await screen.findByRole("alertdialog", {}, T).catch(() => screen.findByRole("dialog", {}, T));
    await userEvent.click(within(dialog).getByRole("button", { name: "Hủy số" }));
    expect(await within(dialog).findByText("Nhập lý do hủy")).toBeTruthy();
    await userEvent.type(within(dialog).getByLabelText(/Lý do hủy/), "Sai người mua");
    await userEvent.click(within(dialog).getByRole("button", { name: "Hủy số" }));
    await waitFor(() => expect(getDb().issuedInvoices[0]?.invoice).toMatchObject({ status: "VOID", voidReason: "Sai người mua" }), T);
    expect(await screen.findByText(`INV${period()}-002`, {}, T)).toBeTruthy();
  }, 60_000);

  it("đã cấp số rồi đổi nguồn Invoice sang tải lên → thẻ vẫn hiện để hủy số, kèm cảnh báo", async () => {
    await issueInvoiceAction(DOS, { action: "RESERVE" });
    dossier().documentSources = { INVOICE: "UPLOADED" };
    render();
    expect(await screen.findByText(/Invoice của hồ sơ đã chuyển sang tải lên/, {}, T)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Cấp số hóa đơn" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Hủy số" }));
    const dialog = await screen.findByRole("dialog", {}, T);
    await userEvent.type(within(dialog).getByLabelText(/Lý do hủy/), "Khách gửi invoice thật");
    await userEvent.click(within(dialog).getByRole("button", { name: "Hủy số" }));
    await waitFor(() => expect(getDb().issuedInvoices[0]?.invoice.status).toBe("VOID"), T);
    await waitFor(() => expect(screen.queryByText("Hóa đơn thương mại")).toBeNull(), T);
  }, 60_000);

  it("hồ sơ không đặt Invoice do hệ thống phát hành → không hiện", async () => {
    dossier().documentSources = { INVOICE: "UPLOADED" };
    render();
    await waitFor(() => expect(screen.queryByText("Hóa đơn thương mại")).toBeNull());
  });
});
