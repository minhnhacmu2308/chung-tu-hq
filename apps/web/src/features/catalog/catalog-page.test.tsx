// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb, resetDb } from "@/mocks/db";
import { expectNoA11yViolations, renderWithProviders } from "@/test/dom";
import { CatalogPage } from "./catalog-page";

let search = new URLSearchParams();
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace, back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/products",
  useSearchParams: () => search,
}));

const T = { timeout: 5000 };
const table = () => screen.findByRole("table", { name: "Danh sách mặt hàng" }, T);
const rowWith = async (text: string) => {
  const t = await table();
  await within(t).findByText(text, {}, T);
  return within(t).getAllByRole("row").find((r) => r.textContent?.includes(text))!;
};
/** Panel chi tiết – tìm theo tiêu đề (truy vấn role trên cả trang có bảng lớn chậm trong jsdom). */
const panelEl = () => screen.queryByText("Chi tiết mặt hàng", { selector: "h2" })?.closest<HTMLElement>("[role=dialog]") ?? null;
const panel = async () => {
  await waitFor(() => expect(panelEl()).not.toBeNull(), { timeout: 15_000 });
  return panelEl()!;
};
/**
 * Bấm dòng bằng fireEvent: userEvent dùng chung giữa các test (không setup riêng) giữ trạng thái con trỏ của test trước
 * (vd sau khi chọn trong Select) nên lần bấm dòng đầu đôi khi không tới được – chỉ là hiện tượng của test, không phải của bảng.
 */
const openItem = async (name: string) => {
  fireEvent.click(await within(await table()).findByText(name, {}, T));
  return panel();
};
const actAs = (id: string) => {
  getDb().currentUserId = id;
};

beforeEach(() => {
  resetDb();
  search = new URLSearchParams();
  replace.mockReset();
});

describe("Danh mục hàng hóa – tab Mặt hàng", () => {
  it("4 tab; bảng có mã hiển thị chính (bộ Kế toán), mã nối, HS, ĐVT gốc, số bộ có mã; không vi phạm a11y", async () => {
    const { container } = renderWithProviders(<CatalogPage />);
    for (const name of [/^Mặt hàng$/, /^Bộ mã$/, /^Chờ duyệt/, /^Nhập dữ liệu$/]) expect(screen.getByRole("tab", { name })).toBeTruthy();
    const row = await rowWith("Vòng bi cầu 6205-2RS, đường kính trong 25 mm");
    expect(within(row).getByText("vt-0012")).toBeTruthy();
    expect(within(row).getByText("8482.10.00")).toBeTruthy();
    expect(within(row).getByText("PCE")).toBeTruthy();
    await expectNoA11yViolations(container);
  }, 30_000);

  it("Xem theo bộ mã: Kho → cột mã/tên/ĐVT theo bộ Kho", async () => {
    renderWithProviders(<CatalogPage />);
    await rowWith("vt-0012");
    await userEvent.click(screen.getByRole("combobox", { name: "Xem theo bộ mã" }));
    await userEvent.click(await screen.findByRole("option", { name: /^Kho/ }, T));
    const t = await table();
    await within(t).findByRole("columnheader", { name: /Mã · Kho \(Kho\)/ }, T);
    const row = await rowWith("VT 0012");
    expect(within(row).queryByText("vt-0012")).toBeNull();
    // Mặt hàng 2: ĐVT của bộ Kho là DZN (khác ĐVT gốc PCE).
    expect(within(await rowWith("VT0013")).getByText("DZN")).toBeTruthy();
  }, 30_000);

  it("tìm bằng mã kho (chỉ có ở bộ Kho) ra đúng mặt hàng", async () => {
    renderWithProviders(<CatalogPage />);
    await rowWith("vt-0012");
    await userEvent.type(screen.getByRole("searchbox", { name: "Tìm mặt hàng" }), "VT-0017");
    await rowWith("Thanh trượt dẫn hướng HGR25, dài 1.000 mm");
    await waitFor(async () => expect(within(await table()).queryByText("vt-0012")).toBeNull(), T);
  }, 30_000);

  it("panel chi tiết: mã theo từng bộ (kèm loại bộ), quy đổi, lịch sử sau khi sửa; nút Đóng ở cuối", async () => {
    renderWithProviders(<CatalogPage />);
    const dialog = await openItem("Vòng bi cầu 6308ZZ, đường kính trong 40 mm");
    expect(await within(dialog).findByText("Mã theo bộ mã", {}, T)).toBeTruthy();
    const kho = await within(dialog).findByRole("table", { name: "Mã của mặt hàng trong bộ Kho" }, T);
    expect(within(kho).getByText("VT0013")).toBeTruthy();
    expect(within(dialog).getAllByText("Nhà cung cấp").length).toBeGreaterThan(0);
    expect(within(dialog).getByText("SKF KOREA LTD")).toBeTruthy();
    expect(within(dialog).getByText("1 DZN = 12 PCE")).toBeTruthy();
    expect(await within(dialog).findByText("Chưa có thay đổi nào.", {}, T)).toBeTruthy();
    await expectNoA11yViolations(dialog);

    // Popup thêm mã: a11y, rồi Hủy.
    await userEvent.click(within(dialog).getByRole("button", { name: "Thêm mã" }));
    const addAlias = (await screen.findByText("Thêm mã cho mặt hàng", { selector: "h2" }, T)).closest<HTMLElement>("[role=dialog]")!;
    await expectNoA11yViolations(addAlias);
    await userEvent.click(within(addAlias).getByRole("button", { name: "Hủy" }));
    await waitFor(() => expect(screen.queryByText("Thêm mã cho mặt hàng", { selector: "h2" })).toBeNull(), T);

    // Sửa tên → lịch sử có dòng "Tên hàng".
    await userEvent.click(within(dialog).getByRole("button", { name: "Sửa thông tin" }));
    const edit = (await screen.findByText("Sửa thông tin mặt hàng", { selector: "h2" }, T)).closest<HTMLElement>("[role=dialog]")!;
    await expectNoA11yViolations(edit);
    const name = within(edit).getByLabelText(/^Tên hàng/);
    await userEvent.clear(name);
    await userEvent.type(name, "Vòng bi 6308ZZ");
    await userEvent.click(within(edit).getByRole("button", { name: "Lưu" }));
    const reopened = await panel();
    const history = await within(reopened).findByRole("list", { name: "Lịch sử" }, T);
    expect(await within(history).findByText("Tên hàng", {}, T)).toBeTruthy();
    expect(within(history).getByText("Vòng bi cầu 6308ZZ, đường kính trong 40 mm")).toBeTruthy();

    const buttons = within(reopened).getAllByRole("button");
    expect(buttons[buttons.length - 1]!.textContent).toBe("Đóng");
    await userEvent.click(buttons[buttons.length - 1]!);
    await waitFor(() => expect(screen.queryByText("Chi tiết mặt hàng", { selector: "h2" })).toBeNull(), T);
  }, 40_000);

  it("Gộp vào mặt hàng khác → ConfirmDialog → mặt hàng nguồn biến khỏi danh sách", async () => {
    renderWithProviders(<CatalogPage />);
    const source = "Dây cáp điện CVV 3x4mm2";
    const dialog = await openItem(source);
    await userEvent.click(await within(dialog).findByRole("button", { name: "Gộp vào mặt hàng khác" }, T));
    const merge = (await screen.findByText("Gộp vào mặt hàng khác", { selector: "h2" }, T)).closest<HTMLElement>("[role=dialog]")!;
    await expectNoA11yViolations(merge);
    await userEvent.click(within(merge).getByRole("combobox", { name: "Mặt hàng giữ lại" }));
    const box = await screen.findByPlaceholderText("Tìm kiếm…", {}, T);
    await userEvent.type(box, "DC-0001");
    await userEvent.click(await screen.findByRole("option", { name: /Dây cáp điện CVV 3x2.5mm2/ }, T));
    const next = within(merge).getByRole("button", { name: "Tiếp tục" });
    await waitFor(() => expect(next).toHaveProperty("disabled", false), T);
    await userEvent.click(next);
    const confirm = (await screen.findByText("Gộp mặt hàng?", { selector: "h2" }, T)).closest<HTMLElement>("[role=dialog]")!;
    await userEvent.click(within(confirm).getByRole("button", { name: "Gộp" }));
    expect(await screen.findByText(/Đã gộp vào MH-/, {}, T)).toBeTruthy();
    await waitFor(async () => expect(within(await table()).queryByText(source)).toBeNull(), T);
    expect(getDb().catalog.items.find((i) => i.name === source)?.status).toBe("MERGED");
  }, 40_000);

  it("Ngưng dùng → biến khỏi danh sách đang dùng; lọc Trạng thái: Ngưng dùng → tìm lại được → Dùng lại", async () => {
    renderWithProviders(<CatalogPage />);
    const name = "Ổ bi đũa côn 30210";
    const dialog = await openItem(name);
    await userEvent.click(await within(dialog).findByRole("button", { name: "Ngưng dùng mặt hàng" }, T));
    const confirm = (await screen.findByText("Ngưng dùng mặt hàng?", { selector: "h2" }, T)).closest<HTMLElement>("[role=dialog]")!;
    await userEvent.click(within(confirm).getByRole("button", { name: "Ngưng dùng mặt hàng" }));
    expect(await screen.findByText("Đã ngưng dùng mặt hàng", {}, T)).toBeTruthy();
    fireEvent.click(within(await panel()).getAllByRole("button", { name: "Đóng" }).at(-1)!);
    await waitFor(async () => expect(within(await table()).queryByText(name)).toBeNull(), T);

    await userEvent.click(screen.getByRole("combobox", { name: "Trạng thái" }));
    await userEvent.click(await screen.findByRole("option", { name: "Ngưng dùng" }, T));
    const row = await rowWith(name);
    expect(within(row).getByText("Ngưng dùng")).toBeTruthy();
    const again = await openItem(name);
    await userEvent.click(await within(again).findByRole("button", { name: "Dùng lại" }, T));
    expect(await screen.findByText("Đã dùng lại mặt hàng", {}, T)).toBeTruthy();
    expect(getDb().catalog.items.find((i) => i.name === name)?.status).toBe("ACTIVE");
  }, 40_000);

  it("VIEWER: chỉ xem – không có nút Thêm, Sửa thông tin, Gộp, Ngưng dùng; vẫn xuất Excel được", async () => {
    actAs("usr_quang");
    renderWithProviders(<CatalogPage />);
    await rowWith("vt-0012");
    expect(screen.getByRole("button", { name: "Xuất Excel" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Thêm mặt hàng" })).toBeNull();
    const dialog = await openItem("Vòng bi cầu 6205-2RS, đường kính trong 25 mm");
    await within(dialog).findByText("Mã theo bộ mã", {}, T);
    expect(within(dialog).queryByRole("button", { name: "Sửa thông tin" })).toBeNull();
    expect(within(dialog).queryByRole("button", { name: "Gộp vào mặt hàng khác" })).toBeNull();
    expect(within(dialog).queryByRole("button", { name: "Ngưng dùng mặt hàng" })).toBeNull();
    expect(within(dialog).queryByRole("button", { name: "Thêm mã" })).toBeNull();
  }, 30_000);

  it("mở tab theo ?tab= (Nhập dữ liệu)", async () => {
    search = new URLSearchParams("tab=import");
    renderWithProviders(<CatalogPage />);
    expect(screen.getByRole("tab", { name: "Nhập dữ liệu", selected: true })).toBeTruthy();
    expect(await screen.findByRole("heading", { name: "Nhập từ file Excel" }, T)).toBeTruthy();
  });

  it.each([
    ["en", "Product catalog", "Products", "Code · Kho (Warehouse)", ["Product details", "Codes by code set", "Unit conversions", "History", "Close"]],
    ["zh", "商品目录", "商品", "编码 · Kho (仓库)", ["商品详情", "各编码集中的编码", "单位换算", "历史记录", "关闭"]],
  ] as const)("ngôn ngữ %s: tiêu đề, tab, cột theo bộ mã, panel chi tiết đã dịch", async (locale, title, tab, header, panelTexts) => {
    renderWithProviders(<CatalogPage />, locale);
    expect(screen.getByRole("heading", { name: title })).toBeTruthy();
    expect(screen.getByRole("tab", { name: tab })).toBeTruthy();
    await screen.findAllByText("vt-0012", {}, T);
    const view = locale === "en" ? "View by code set" : "按编码集查看";
    await userEvent.click(screen.getByRole("combobox", { name: view }));
    await userEvent.click(await screen.findByRole("option", { name: /^Kho/ }, T));
    // Tên bộ là dữ liệu nghiệp vụ (không dịch).
    expect(await screen.findByRole("columnheader", { name: header }, T)).toBeTruthy();
    // Panel chi tiết theo ngôn ngữ (tiêu đề h2 + các mục + nút Đóng); không còn chữ tiếng Việt của giao diện.
    fireEvent.click(await within(await screen.findByRole("table", {}, T)).findByText("VT 0012", {}, T));
    const h2 = await screen.findByText(panelTexts[0], { selector: "h2" }, { timeout: 15_000 });
    const dlg = h2.closest<HTMLElement>("[role=dialog]")!;
    for (const text of panelTexts.slice(1)) expect(await within(dlg).findByText(text, {}, T)).toBeTruthy();
    expect(within(dlg).queryByText("Mã theo bộ mã")).toBeNull();
  }, 40_000);
});
