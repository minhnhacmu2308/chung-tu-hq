// @vitest-environment jsdom
// Bản kê mã vạch qua khu vực giám sát (spec KVGS §4): mẫu container (QR mỗi dòng, sang trang), mẫu hàng lẻ (Code128 đầu trang),
// "Tờ khai (không) phải niêm phong", trang in khi chưa có bảng kê → EmptyState + liên kết về thẻ; axe.
import type { KvgsSheet } from "@kb/contracts";
import { screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb, resetDb } from "@/mocks/db";
import { expectNoA11yViolations, renderWithProviders } from "@/test/dom";
import { KvgsDocument } from "./kvgs-document";
import { KvgsPrintPage } from "./kvgs-print-page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/dossiers/dos_029/kvgs/1/print",
  useSearchParams: () => new URLSearchParams(),
}));

const CONT: KvgsSheet = {
  kind: "CONTAINER", regionOffice: "Chi cục Hải quan khu vực II", customsOffice: "Hải quan cửa khẩu cảng Sài Gòn khu vực 1",
  supervisionOffice: "02CI – CTYCP Cảng Cát Lái", sealRequired: false, companyName: "CÔNG TY A", taxCode: "0312345678",
  declarationNo: "309096721420", declarationStatus: "Thông quan", declarationDate: "2026-02-27", declarationDateTo: "2026-03-01",
  typeName: "Nhập kinh doanh", channel: "Luồng xanh", cargoControlNo: "122600049332258", barcode: null,
  containers: [{ containerNo: "FBIU5802429", sealNo: "NA", customsSealNo: null, barcode: "FBIU5802429" }], cargo: null, exportedAt: "2026-02-27T03:00:00Z",
};
const CARGO: KvgsSheet = {
  ...CONT, kind: "CARGO", barcode: "KVGS-MOCK|309096721420|CARGO", containers: [],
  cargo: { quantity: "17", quantityUnit: "CASE", grossWeight: "255", weightUnit: "Kilogam" },
};
const qr = () => screen.queryAllByRole("img").filter((i) => i.getAttribute("viewBox") && !i.hasAttribute("width"));
const code128 = () => screen.queryAllByRole("img").filter((i) => i.hasAttribute("width"));

describe("KvgsDocument – mẫu container", () => {
  it("tiêu đề, mục 1–9, số quản lý hàng hóa, 1 QR theo container, ghi chú; a11y", async () => {
    const { container } = renderWithProviders(<KvgsDocument sheet={CONT} template="cont" />);
    expect(screen.getByRole("heading", { name: /DANH SÁCH CONTAINER/ })).toBeTruthy();
    expect(screen.getByText("ĐỦ ĐIỀU KIỆN QUA KHU VỰC GIÁM SÁT HẢI QUAN")).toBeTruthy();
    expect(screen.getByText("122600049332258")).toBeTruthy();
    expect(screen.getByText("309096721420")).toBeTruthy();
    expect(screen.getByText("27/02/2026 - 01/03/2026")).toBeTruthy();
    expect(screen.getByText("02CI – CTYCP Cảng Cát Lái")).toBeTruthy();
    expect(screen.getByText("FBIU5802429")).toBeTruthy();
    expect(screen.getByText("NA")).toBeTruthy();
    const codes = screen.getAllByRole("img").filter((i) => i.getAttribute("aria-label")?.includes("FBIU5802429"));
    expect(codes).toHaveLength(1);
    expect(qr()).toHaveLength(1);
    expect(screen.getByText(/lấy từ tiêu chí "Số container" trên tờ khai xuất/)).toBeTruthy();
    expect(screen.getByText(/^Kết xuất dữ liệu lúc:/)).toBeTruthy();
    expect(screen.getByText("Trang 1/1")).toBeTruthy();
    await expectNoA11yViolations(container);
  }, 30_000);

  it("sealRequired=false → 'Tờ khai không phải niêm phong'; true → 'Tờ khai phải niêm phong'", () => {
    const { unmount } = renderWithProviders(<KvgsDocument sheet={CONT} template="cont" />);
    expect(screen.getByText("Tờ khai không phải niêm phong")).toBeTruthy();
    unmount();
    renderWithProviders(<KvgsDocument sheet={{ ...CONT, sealRequired: true }} template="cont" />);
    expect(screen.getByText("Tờ khai phải niêm phong")).toBeTruthy();
  });

  it("11 container → 2 trang giấy (5 + 6 kèm ghi chú), tiêu đề bảng lặp mỗi trang, mỗi container 1 QR", () => {
    const containers = Array.from({ length: 11 }, (_, i) => ({ containerNo: `CONT${String(i).padStart(7, "0")}`, sealNo: null, customsSealNo: null, barcode: `B${i}` }));
    renderWithProviders(<KvgsDocument sheet={{ ...CONT, containers }} template="cont" />);
    const pages = screen.getAllByRole("region", { name: /^Trang \d+ \/ \d+$/ });
    expect(pages).toHaveLength(2);
    expect(screen.getAllByText("MÃ VẠCH")).toHaveLength(pages.length);
    expect(qr()).toHaveLength(11);
    expect(screen.getByText(`Trang ${pages.length}/${pages.length}`)).toBeTruthy();
    // Ghi chú chỉ in một lần, ở trang cuối
    expect(screen.getAllByText(/^Kết xuất dữ liệu lúc:/)).toHaveLength(1);
  });

  it("13 container → dòng cuối không còn chỗ cho ghi chú: ghi chú sang trang riêng, có trong 'Trang x/y', không in lại bảng rỗng", () => {
    const containers = Array.from({ length: 13 }, (_, i) => ({ containerNo: `CONT${String(i).padStart(7, "0")}`, sealNo: null, customsSealNo: null, barcode: `B${i}` }));
    renderWithProviders(<KvgsDocument sheet={{ ...CONT, containers }} template="cont" />);
    const pages = screen.getAllByRole("region", { name: /^Trang \d+ \/ \d+$/ });
    expect(pages).toHaveLength(3);
    expect(screen.getAllByText("MÃ VẠCH")).toHaveLength(2);
    expect(qr()).toHaveLength(13);
    expect(within(pages[2]!).getByText(/^Kết xuất dữ liệu lúc:/)).toBeTruthy();
    expect(within(pages[2]!).getByText("Trang 3/3")).toBeTruthy();
    expect(within(pages[1]!).queryByText(/^Kết xuất dữ liệu lúc:/)).toBeNull();
  });
});

describe("KvgsDocument – mẫu hàng lẻ", () => {
  it("DANH SÁCH HÀNG HÓA, '17 CASE', '255 Kilogam', 1 Code128 đầu trang, không QR; a11y", async () => {
    const { container } = renderWithProviders(<KvgsDocument sheet={CARGO} template="le" />);
    expect(screen.getByRole("heading", { name: /DANH SÁCH HÀNG HÓA/ })).toBeTruthy();
    expect(screen.getByText("17 CASE")).toBeTruthy();
    expect(screen.getByText("255 Kilogam")).toBeTruthy();
    expect(code128()).toHaveLength(1);
    expect(qr()).toHaveLength(0);
    expect(screen.getByText(/ghi rõ lượng hàng từng lần qua KVGS/)).toBeTruthy();
    await expectNoA11yViolations(container);
  }, 30_000);
});

describe("KvgsPrintPage", () => {
  beforeEach(() => resetDb());

  it("chưa có bảng kê → EmptyState + liên kết về thẻ Qua khu vực giám sát của hồ sơ", async () => {
    renderWithProviders(<KvgsPrintPage dossierId="dos_029" branch={1} template="cont" />);
    const link = await screen.findByRole("link", { name: /Về thẻ Qua khu vực giám sát/ }, { timeout: 8000 });
    expect(link.getAttribute("href")).toBe("/dossiers/dos_029?step=submit#kvgs-1");
    expect(screen.getByText("Chưa có bản kê qua khu vực giám sát")).toBeTruthy();
  }, 30_000);

  /** Bảng kê đã lấy về (ACCEPTED) của tờ 1 – đặt thẳng vào mock db. */
  const withSheet = (sheet: KvgsSheet) =>
    getDb().kvgs.fetches.push({
      id: "kvf_t", dossierId: "dos_029", branch: 1, status: "ACCEPTED", requestedAt: "2026-02-27T02:00:00Z", fetchedAt: "2026-02-27T03:00:00Z",
      doneAt: "2026-02-27T03:00:00Z", outcome: "ACCEPTED", refId: "R1", receiptNo: "1", receiptDate: "2026-02-27", errors: [], sheet,
    });
  const btn = (name: string) => screen.getByRole("button", { name }) as HTMLButtonElement;

  it("mẫu khớp loại bản kê → In / Tải PDF bật, không cảnh báo", async () => {
    withSheet(CONT);
    renderWithProviders(<KvgsPrintPage dossierId="dos_029" branch={1} template="cont" />);
    await screen.findByRole("heading", { name: /DANH SÁCH CONTAINER/ }, { timeout: 8000 });
    expect(btn("In").disabled).toBe(false);
    expect(btn("Tải PDF").disabled).toBe(false);
    expect(screen.queryByText(/sẽ in ra bảng trống/)).toBeNull();
  }, 30_000);

  it("mẫu không khớp (mau=le cho hàng container) → cảnh báo, khóa In / Tải PDF", async () => {
    withSheet(CONT);
    renderWithProviders(<KvgsPrintPage dossierId="dos_029" branch={1} template="le" />);
    await screen.findByText(/Bản kê này là hàng container – mẫu Hàng lẻ sẽ in ra bảng trống/, undefined, { timeout: 8000 });
    expect(btn("In").disabled).toBe(true);
    expect(btn("Tải PDF").disabled).toBe(true);
  }, 30_000);

  it("mẫu không khớp (mau=cont cho hàng lẻ) → cảnh báo, khóa In", async () => {
    withSheet(CARGO);
    renderWithProviders(<KvgsPrintPage dossierId="dos_029" branch={1} template="cont" />);
    await screen.findByText(/Bản kê này là hàng lẻ – mẫu Hàng container sẽ in ra bảng trống/, undefined, { timeout: 8000 });
    expect(btn("In").disabled).toBe(true);
  }, 30_000);
});
