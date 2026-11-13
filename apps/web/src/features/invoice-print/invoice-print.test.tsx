// @vitest-environment jsdom
// Bản in hóa đơn thương mại / Packing List theo mẫu doanh nghiệp (ADR 0013 mục 3).
import { DEFAULT_INVOICE_LAYOUT, type IssuedInvoice, type IssuedInvoiceSnapshot } from "@kb/contracts";
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoA11yViolations, renderWithProviders } from "@/test/dom";
import { InvoicePrintView } from "./invoice-print-page";

const NOCAT = { catalogItemId: null, printedCode: null, printedUnit: null, printedQuantity: null, printedUnitPrice: null };
const SNAP: IssuedInvoiceSnapshot = {
  seller: { name: "AN PHAT INDUSTRIAL EQUIPMENT CO., LTD", taxCode: "0316789012", address: "HAI PHONG, VIETNAM", phone: "0225 3 123 456" },
  buyer: { name: "NORDIC TOOLING GROUP AB", address: "SOLNA, SWEDEN", country: "SE", taxCode: null },
  invoice: { date: "2026-11-11", incoterm: "FOB", incotermPlace: "HAIPHONG PORT, VIETNAM", currency: "USD", paymentTerms: "T/T 30 DAYS", poNo: "PO-778", totalAmount: "1250.50" },
  transport: { portOfLoading: "HAIPHONG", portOfDischarge: "GOTHENBURG", finalDestination: null, departureDate: "2026-11-20", vessel: "MAERSK EUBANK 245W", packages: "20", packageUnit: "CT", grossWeightKg: "520.5", netWeightKg: "480", containers: [{ no: "MSKU1234567", sealNo: "SL998", size: "20GP" }] },
  originCountry: "VN",
  declarationNo: "306123456780",
  marks: "NTG / SOLNA / C/NO. 1-20",
  extra: { contractNo: "HD-01/2026", lcNo: "NDEA26LC00417", lcDate: "2026-11-01", lcIssuingBank: "NORDEA BANK ABP", blNo: "HPH123", blDate: "2026-11-20" },
  signatory: { name: "LE MINH CHAU", title: "DIRECTOR" },
  layout: DEFAULT_INVOICE_LAYOUT,
  items: [
    { lineNo: 1, description: "Drill bit 10mm", partNo: "DB-10", hsCode: "82075000", quantity: "1000", unit: "PCE", unitPrice: "1.25", amount: "1250.00", origin: "VN", ...NOCAT },
    { lineNo: 2, description: "Drill bit 2mm", partNo: null, hsCode: null, quantity: "1", unit: "PCE", unitPrice: "0.5", amount: "0.50", origin: null, ...NOCAT },
  ],
};
const inv = (o: Partial<IssuedInvoice> = {}): IssuedInvoice => ({
  id: "isd_1", no: "INV2611-001", status: "ISSUED", reservedAt: "2026-11-01T03:00:00.000Z", releasedAt: "2026-11-21T03:00:00.000Z", voidedAt: null, voidReason: null, templateId: null, snapshot: SNAP, ...o,
});

describe("InvoicePrintView – hóa đơn thương mại theo mẫu", () => {
  it("mẫu dựng sẵn: tiêu đề, Incoterms kèm phiên bản, số tiền bằng chữ, cột theo mẫu, ô ký; nhóm L/C và Tờ khai tắt; a11y", async () => {
    const { container } = renderWithProviders(<InvoicePrintView invoice={inv()} snapshot={SNAP} doc="invoice" />);
    expect(screen.getAllByRole("heading", { name: "COMMERCIAL INVOICE" })).toHaveLength(1);
    expect(screen.getAllByText("ORIGINAL")).toHaveLength(1);
    expect(screen.getByText(/FOB HAIPHONG PORT, VIETNAM – INCOTERMS® 2020/)).toBeTruthy();
    expect(screen.getByText("SAY: US DOLLARS ONE THOUSAND TWO HUNDRED FIFTY AND CENTS FIFTY ONLY")).toBeTruthy();
    expect(screen.getAllByText("Unit price (USD)").length).toBeGreaterThan(0);
    expect(screen.queryByText("Part No.")).toBeNull();
    expect(screen.queryByText("NDEA26LC00417")).toBeNull();
    expect(screen.queryByText("306123456780")).toBeNull();
    expect(screen.getByText("HPH123")).toBeTruthy();
    expect(screen.getByText(/For and on behalf of AN PHAT INDUSTRIAL EQUIPMENT CO., LTD/)).toBeTruthy();
    await expectNoA11yViolations(container);
  }, 30_000);

  it("in theo bộ mã: cột Mã hàng/Số lượng/ĐVT/Đơn giá lấy từ phần đã in; tổng lượng theo ĐVT in; bản cũ (chưa có phần in) in như dữ liệu dòng", () => {
    const layout = { ...DEFAULT_INVOICE_LAYOUT, columns: DEFAULT_INVOICE_LAYOUT.columns.map((c) => ({ ...c, visible: true })) };
    const snap = {
      ...SNAP, layout,
      items: [
        { ...SNAP.items[0]!, catalogItemId: "cat_1", printedCode: "VT-0012", printedUnit: "ROLL", printedQuantity: "10", printedUnitPrice: "125" },
        { ...SNAP.items[1]!, partNo: "OLD-2" },
      ],
    };
    renderWithProviders(<InvoicePrintView invoice={inv({ snapshot: snap })} snapshot={snap} doc="invoice" />);
    expect(screen.getByText("VT-0012")).toBeTruthy();
    expect(screen.queryByText("DB-10")).toBeNull();
    expect(screen.getByText("ROLL")).toBeTruthy();
    expect(screen.getByText("125.00")).toBeTruthy();
    expect(screen.getByText("OLD-2")).toBeTruthy();
    expect(screen.getByText("10 ROLL + 1 PCE")).toBeTruthy();
  });

  it("mẫu doanh nghiệp: thứ tự nhóm, nhãn riêng, bật L/C + số tờ khai, câu xác nhận, số bản theo mẫu", () => {
    const layout = {
      ...DEFAULT_INVOICE_LAYOUT,
      title: "INVOICE",
      statement: "WE HEREBY CERTIFY THAT THE GOODS ARE OF VIETNAM ORIGIN",
      originals: 1,
      copies: 2,
      blocks: [
        { key: "BUYER" as const, visible: true, label: "Sold to" },
        ...DEFAULT_INVOICE_LAYOUT.blocks.filter((b) => b.key !== "BUYER").map((b) => ({ ...b, visible: true })),
      ],
    };
    const snap = { ...SNAP, layout };
    renderWithProviders(<InvoicePrintView invoice={inv({ snapshot: snap })} snapshot={snap} doc="invoice" />);
    expect(screen.getAllByRole("heading", { name: "INVOICE" })).toHaveLength(3);
    expect(screen.getAllByText("COPY")).toHaveLength(2);
    const sheet = screen.getAllByRole("region")[0]!;
    const sections = within(sheet).getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(sections[0]).toBe("Sold to");
    expect(within(sheet).getByText("NDEA26LC00417")).toBeTruthy();
    expect(within(sheet).getByText("306123456780")).toBeTruthy();
    expect(within(sheet).getByText("WE HEREBY CERTIFY THAT THE GOODS ARE OF VIETNAM ORIGIN")).toBeTruthy();
  });

  it("bản đã hủy → chữ chìm VOID", () => {
    const { container } = renderWithProviders(<InvoicePrintView invoice={inv({ status: "VOID" })} snapshot={SNAP} doc="invoice" originals={1} copies={0} />);
    expect(container.textContent).toContain("VOID");
  });
});

describe("InvoicePrintView – Packing List", () => {
  it("PACKING LIST cùng số, Ref. Invoice No., không có cột tiền, có kiện/trọng lượng/cont", () => {
    renderWithProviders(<InvoicePrintView invoice={inv()} snapshot={SNAP} doc="packing" originals={1} copies={0} />);
    expect(screen.getByRole("heading", { name: "PACKING LIST" })).toBeTruthy();
    expect(screen.getByText(/Ref\. Invoice No\./)).toBeTruthy();
    expect(screen.queryByText("Unit price (USD)")).toBeNull();
    expect(screen.queryByText(/SAY: US DOLLARS/)).toBeNull();
    expect(screen.getByText(/MSKU1234567/)).toBeTruthy();
    expect(screen.getByText(/520[.,]5/)).toBeTruthy();
  });
});
