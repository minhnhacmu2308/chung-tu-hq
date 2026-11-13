// @vitest-environment jsdom
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb, resetDb } from "@/mocks/db";
import { SEED_SETS } from "@/mocks/seed/catalog";
import { expectNoA11yViolations, renderWithProviders } from "@/test/dom";
import { CatalogPage } from "./catalog-page";

let search = new URLSearchParams("tab=code-sets");
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace, back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/products",
  useSearchParams: () => search,
}));

const T = { timeout: 5000 };
const table = () => screen.findByRole("table", { name: "Danh sách bộ mã" }, T);
const rowWith = async (text: string) => {
  const t = await table();
  await within(t).findAllByText(text, {}, T);
  return within(t).getAllByRole("row").find((r) => r.textContent?.includes(text))!;
};
const dialogTitled = async (title: string) => (await screen.findByText(title, { selector: "h2" }, T)).closest<HTMLElement>("[role=dialog]")!;

/** Danh mục chưa thiết lập: như org mới (chưa có bộ mã, chưa chọn chế độ). */
function emptyCatalog() {
  const c = getDb().catalog;
  Object.assign(c.settings, { mode: null, setupAt: null });
  Object.assign(c, { codeSets: [], owners: {}, items: [], aliases: [], conversions: [], queue: [], imports: [], audit: [] });
}

beforeEach(() => {
  resetDb();
  search = new URLSearchParams("tab=code-sets");
  replace.mockReset();
});

describe("Danh mục – tab Bộ mã", () => {
  it("danh sách bộ mã: dòng chế độ, loại bộ, số mã, người phụ trách, mã hiển thị chính; không vi phạm a11y", async () => {
    const { container } = renderWithProviders(<CatalogPage />);
    expect(await screen.findByText("Mỗi bộ phận một bộ mã", {}, T)).toBeTruthy();
    expect(await screen.findByRole("button", { name: "Đổi chế độ" }, T)).toBeTruthy();
    const acc = await rowWith("Kế toán (MISA)");
    expect(within(acc).getByText("Mã hiển thị chính")).toBeTruthy();
    expect(await within(acc).findByText("Phạm Anh Tuấn", {}, T)).toBeTruthy();
    const skf = await rowWith("SKF KOREA LTD");
    expect(within(skf).getByText("Nhà cung cấp")).toBeTruthy();
    await expectNoA11yViolations(container);
  }, 30_000);

  it("danh mục trống → EmptyState; thiết lập chế độ mỗi bộ phận → 3 bộ Kế toán, Kho, XNK", async () => {
    emptyCatalog();
    renderWithProviders(<CatalogPage />);
    expect(await screen.findByText("Chưa thiết lập danh mục", {}, T)).toBeTruthy();
    await userEvent.click(await screen.findByRole("button", { name: "Thiết lập danh mục" }, T));
    const wizard = await dialogTitled("Thiết lập danh mục");
    await expectNoA11yViolations(wizard);
    await userEvent.click(within(wizard).getByRole("radio", { name: /Mỗi bộ phận một bộ mã/ }));
    await userEvent.click(within(wizard).getByRole("button", { name: "Tiếp tục" }));
    expect((within(wizard).getByLabelText(/^Tên bộ Kế toán/) as HTMLInputElement).value).toBe("Kế toán");
    const prefix = within(wizard).getByLabelText(/^Tiền tố mã nối/) as HTMLInputElement;
    expect(prefix.value).toBe("MH-");
    // Tiền tố sai (kiểm bằng schema của route) → báo lỗi ở ô, khóa nút.
    await userEvent.clear(prefix);
    await userEvent.type(prefix, "MH 01");
    expect(within(wizard).getByText(/Tiền tố gồm 1–10 ký tự/)).toBeTruthy();
    expect(within(wizard).getByRole("button", { name: "Thiết lập" })).toHaveProperty("disabled", true);
    await userEvent.clear(prefix);
    await userEvent.type(prefix, "MH-");
    await expectNoA11yViolations(wizard);
    await userEvent.click(within(wizard).getByRole("button", { name: "Thiết lập" }));
    expect(await screen.findByText("Đã thiết lập danh mục", {}, T)).toBeTruthy();
    for (const name of ["Kế toán", "Kho", "XNK"]) expect(await rowWith(name)).toBeTruthy();
    expect(getDb().catalog.settings.mode).toBe("PER_DEPARTMENT");
    expect(getDb().catalog.codeSets.map((s) => s.kind).sort()).toEqual(["ACCOUNTING", "CUSTOMS", "WAREHOUSE"]);
    expect(replace).not.toHaveBeenCalledWith("/products?tab=import", expect.anything());
  }, 40_000);

  it("thiết lập dùng chung → 1 bộ “Mã chung”, chuyển sang tab Nhập dữ liệu; thêm bộ chỉ cho nhà cung cấp/khách hàng", async () => {
    emptyCatalog();
    const view = renderWithProviders(<CatalogPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Thiết lập danh mục" }, T));
    const wizard = await dialogTitled("Thiết lập danh mục");
    await userEvent.click(within(wizard).getByRole("radio", { name: /Dùng chung một bộ mã/ }));
    await userEvent.click(within(wizard).getByRole("button", { name: "Tiếp tục" }));
    expect((within(wizard).getByLabelText(/^Tên bộ Mã chung/) as HTMLInputElement).value).toBe("Mã chung");
    await userEvent.click(within(wizard).getByRole("button", { name: "Thiết lập và nhập file" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/products?tab=import", { scroll: false }), T);
    const sets = getDb().catalog.codeSets;
    expect(sets.map((s) => [s.kind, s.name])).toEqual([["SHARED", "Mã chung"]]);
    expect(getDb().catalog.settings.mode).toBe("SHARED");

    view.unmount();
    renderWithProviders(<CatalogPage />);
    expect(await screen.findByText("Dùng chung một bộ mã", {}, T)).toBeTruthy();
    await rowWith("Mã chung");
    await userEvent.click(await screen.findByRole("button", { name: "Thêm bộ mã" }, T));
    const dialog = await dialogTitled("Thêm bộ mã");
    await expectNoA11yViolations(dialog);
    await userEvent.click(within(dialog).getByRole("combobox", { name: /^Loại bộ mã/ }));
    const options = (await screen.findAllByRole("option", {}, T)).map((o) => o.textContent);
    expect(options).toEqual(["Nhà cung cấp", "Khách hàng"]);
  }, 40_000);

  it("đổi chế độ: còn 3 bộ nội bộ → không chuyển về dùng chung được; 1 bộ → dùng chung → lại sang mỗi bộ phận (Mã chung thành Kho)", async () => {
    const view = renderWithProviders(<CatalogPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Đổi chế độ" }, T));
    let dialog = await dialogTitled("Đổi chế độ danh mục");
    expect(within(dialog).getByText(/Hiện có 3 bộ/)).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Đổi chế độ" })).toHaveProperty("disabled", true);
    await userEvent.click(within(dialog).getByRole("button", { name: "Hủy" }));
    view.unmount();

    // Chỉ còn bộ XNK (và các bộ nhà cung cấp).
    const c = getDb().catalog;
    c.codeSets = c.codeSets.filter((s) => s.id !== SEED_SETS.ACC && s.id !== SEED_SETS.WH);
    renderWithProviders(<CatalogPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Đổi chế độ" }, T));
    dialog = await dialogTitled("Đổi chế độ danh mục");
    await expectNoA11yViolations(dialog);
    expect(within(dialog).getByText(/Bộ “XNK” thành bộ Mã chung/)).toBeTruthy();
    await userEvent.click(within(dialog).getByRole("button", { name: "Đổi chế độ" }));
    expect(await screen.findByText("Đã đổi chế độ danh mục", {}, T)).toBeTruthy();
    expect(await screen.findByText("Dùng chung một bộ mã", {}, T)).toBeTruthy();
    expect(getDb().catalog.codeSets.find((s) => s.id === SEED_SETS.XNK)?.kind).toBe("SHARED");

    await userEvent.click(screen.getByRole("button", { name: "Đổi chế độ" }));
    dialog = await dialogTitled("Đổi chế độ danh mục");
    await userEvent.click(within(dialog).getByRole("radio", { name: "Bộ Kho" }));
    expect(within(dialog).getByText(/tạo thêm bộ XNK mặc định/)).toBeTruthy();
    // Danh sách bộ mã tải lại sau lần đổi trước (bộ "Mã chung" mới có) → nút mới mở.
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Đổi chế độ" })).toHaveProperty("disabled", false), T);
    await userEvent.click(within(dialog).getByRole("button", { name: "Đổi chế độ" }));
    await waitFor(() => expect(getDb().catalog.settings.mode).toBe("PER_DEPARTMENT"), T);
    expect(await screen.findByText("Mỗi bộ phận một bộ mã", {}, { timeout: 10_000 })).toBeTruthy();
    const after = getDb().catalog.codeSets;
    expect(after.find((s) => s.id === SEED_SETS.XNK)?.kind).toBe("WAREHOUSE");
    expect(after.some((s) => s.kind === "CUSTOMS" && s.isDefault)).toBe(true);
  }, 40_000);

  it("sửa người phụ trách bộ Kho (chọn nhiều thành viên)", async () => {
    renderWithProviders(<CatalogPage />);
    await rowWith("Kho");
    await userEvent.click(await screen.findByRole("button", { name: "Sửa bộ mã – Kho" }, T));
    const dialog = await dialogTitled("Sửa bộ mã");
    await expectNoA11yViolations(dialog);
    await userEvent.click(within(dialog).getByRole("combobox", { name: /^Người phụ trách/ }));
    await userEvent.click(await screen.findByRole("option", { name: /Phạm Anh Tuấn/ }, T));
    await userEvent.keyboard("{Escape}");
    await userEvent.click(within(dialog).getByRole("button", { name: "Lưu" }));
    expect(await screen.findByText("Đã lưu bộ mã Kho", {}, T)).toBeTruthy();
    expect(getDb().catalog.owners[SEED_SETS.WH]).toEqual(["usr_ha", "usr_tuan"]);
    const row = await rowWith("Kho");
    await within(row).findByText(/Phạm Anh Tuấn/, {}, T);
  }, 40_000);

  it("người không phải Quản trị: không có nút Đổi chế độ, Thêm bộ mã, Sửa", async () => {
    getDb().currentUserId = "usr_ha";
    renderWithProviders(<CatalogPage />);
    await rowWith("Kho");
    expect(screen.queryByRole("button", { name: "Đổi chế độ" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Thêm bộ mã" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Sửa bộ mã – Kho" })).toBeNull();
  }, 30_000);

  it.each([
    ["en", "One code set per department", "Change mode", "Code set list"],
    ["zh", "每个部门一个编码集", "更改模式", "编码集列表"],
  ] as const)("ngôn ngữ %s: dòng chế độ và bảng đã dịch", async (locale, mode, button, tableName) => {
    renderWithProviders(<CatalogPage />, locale);
    expect(await screen.findByText(mode, {}, T)).toBeTruthy();
    expect(await screen.findByRole("button", { name: button }, T)).toBeTruthy();
    expect(await screen.findByRole("table", { name: tableName }, T)).toBeTruthy();
  }, 30_000);
});
