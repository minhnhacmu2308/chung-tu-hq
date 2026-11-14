// @vitest-environment jsdom
import { dismissToast } from "@kb/ui";
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
  // Kho toast là toàn cục: toast của test trước không được làm test sau "thấy" kết quả sớm.
  dismissToast();
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

  it("thiết lập mỗi bộ phận: chọn bộ nguồn gốc (mặc định XNK) → Kho thành nguồn gốc; dùng chung → Mã chung là nguồn gốc (giải thích)", async () => {
    emptyCatalog();
    const view = renderWithProviders(<CatalogPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Thiết lập danh mục" }, T));
    let wizard = await dialogTitled("Thiết lập danh mục");
    await userEvent.click(within(wizard).getByRole("radio", { name: /Mỗi bộ phận một bộ mã/ }));
    await userEvent.click(within(wizard).getByRole("button", { name: "Tiếp tục" }));
    const group = within(wizard).getByRole("radiogroup", { name: "Bộ nào là bộ nguồn gốc?" });
    expect(within(group).getByRole("radio", { name: /^XNK/ })).toHaveProperty("checked", true);
    expect(within(wizard).getByText(/Bộ nguồn gốc quyết định ĐVT gốc, tên, mã HS/)).toBeTruthy();
    await userEvent.click(within(group).getByRole("radio", { name: /^Kho/ }));
    await expectNoA11yViolations(wizard);
    await userEvent.click(within(wizard).getByRole("button", { name: "Thiết lập" }));
    expect(await screen.findByText("Đã thiết lập danh mục", {}, T)).toBeTruthy();
    await waitFor(() => expect(getDb().catalog.codeSets.filter((s) => s.isSource).map((s) => s.kind)).toEqual(["WAREHOUSE"]), T);
    expect(within(await rowWith("Kho")).getByText("Nguồn gốc")).toBeTruthy();
    view.unmount();

    emptyCatalog();
    renderWithProviders(<CatalogPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Thiết lập danh mục" }, T));
    wizard = await dialogTitled("Thiết lập danh mục");
    await userEvent.click(within(wizard).getByRole("radio", { name: /Dùng chung một bộ mã/ }));
    await userEvent.click(within(wizard).getByRole("button", { name: "Tiếp tục" }));
    expect(within(wizard).queryByRole("radiogroup", { name: "Bộ nào là bộ nguồn gốc?" })).toBeNull();
    expect(within(wizard).getByText(/Bộ “Mã chung” là bộ nguồn gốc/)).toBeTruthy();
    await userEvent.click(within(wizard).getByRole("button", { name: "Thiết lập và nhập file" }));
    await waitFor(() => expect(getDb().catalog.codeSets.filter((s) => s.isSource).map((s) => s.kind)).toEqual(["SHARED"]), T);
  }, 60_000);

  it("bộ XNK mẫu có nhãn Nguồn gốc; bộ nhà cung cấp không có thao tác Đặt làm nguồn gốc", async () => {
    renderWithProviders(<CatalogPage />);
    expect(within(await rowWith("XNK")).getByText("Nguồn gốc")).toBeTruthy();
    const skf = await rowWith("SKF KOREA LTD");
    expect(within(skf).queryByText("Nguồn gốc")).toBeNull();
    await userEvent.click(await screen.findByRole("button", { name: "Thao tác khác – SKF KOREA LTD" }, T));
    await screen.findAllByRole("menuitem", {}, T);
    expect(screen.queryByRole("menuitem", { name: "Đặt làm nguồn gốc" })).toBeNull();
  }, 30_000);

  it("Đặt Kho làm nguồn gốc: xem trước số liệu + mặt hàng thiếu hệ số, đổi gốc theo hệ số (9 số lẻ), bổ sung hệ số rồi Áp dụng lại", async () => {
    renderWithProviders(<CatalogPage />);
    await rowWith("Kho");
    await userEvent.click(await screen.findByRole("button", { name: "Thao tác khác – Kho" }, T));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Đặt làm nguồn gốc" }, T));
    const dialog = await dialogTitled("Đặt “Kho” làm bộ nguồn gốc");
    expect(await within(dialog).findByText("Bộ nguồn gốc hiện tại: XNK.", {}, T)).toBeTruthy();
    expect(within(dialog).getByText(/làm tròn 9 chữ số thập phân/)).toBeTruthy();
    const blocked = await within(dialog).findByRole("table", { name: "Mặt hàng thiếu hệ số" }, T);
    const canvas = within(blocked).getAllByRole("row").find((r) => r.textContent?.includes("Vải canvas cotton"))!;
    expect(within(canvas).getByText("VAI-C15")).toBeTruthy();
    expect(within(canvas).getByText("MTR → KGM")).toBeTruthy();
    expect(within(dialog).getByText(/mặt hàng chưa đổi được ĐVT gốc/)).toBeTruthy();
    await expectNoA11yViolations(dialog);

    // Bấm dòng thiếu hệ số → panel mặt hàng thay chỗ popup; đóng panel → popup hiện lại.
    await userEvent.click(within(canvas).getByText("VAI-C15"));
    expect(await screen.findByText("Chi tiết mặt hàng", { selector: "h2" }, T)).toBeTruthy();
    expect(screen.queryByText("Đặt “Kho” làm bộ nguồn gốc", { selector: "h2" })).toBeNull();
    await userEvent.keyboard("{Escape}");
    const reopened = await dialogTitled("Đặt “Kho” làm bộ nguồn gốc");

    await userEvent.click(within(reopened).getByRole("button", { name: "Đặt làm nguồn gốc" }));
    expect((await screen.findAllByText("Đã đặt bộ Kho làm nguồn gốc", {}, T)).length).toBeGreaterThan(0);
    const cat = getDb().catalog;
    expect(cat.codeSets.filter((s) => s.isSource).map((s) => s.id)).toEqual([SEED_SETS.WH]);
    // Vòng bi 6308ZZ: Kho tính theo DZN (1 DZN = 12 PCE) → gốc DZN, 1 PCE = 1/12 DZN làm tròn 9 số lẻ.
    expect(cat.items.find((i) => i.id === "prd_seed_2")?.baseUnit).toBe("DZN");
    expect(cat.conversions.filter((c) => c.itemId === "prd_seed_2")).toEqual([{ itemId: "prd_seed_2", unit: "PCE", factor: "0.083333333" }]);
    // Còn mặt hàng thiếu hệ số → popup giữ mở, nút đổi thành Áp dụng lại.
    expect(await within(reopened).findByText("Đã đặt làm nguồn gốc – còn mặt hàng thiếu hệ số", {}, T)).toBeTruthy();
    const reapply = within(reopened).getByRole("button", { name: "Áp dụng lại" });

    // Bổ sung hệ số cho mặt hàng còn thiếu (như thêm quy đổi ở panel mặt hàng) rồi áp dụng lại.
    const stuck = cat.items.find((i) => i.name.startsWith("Vải canvas cotton"))!;
    cat.conversions.push({ itemId: stuck.id, unit: "KGM", factor: "2" });
    await userEvent.click(reapply);
    expect((await screen.findAllByText("Đã áp dụng lại bộ nguồn gốc Kho", {}, T)).length).toBeGreaterThan(0);
    await waitFor(() => expect(screen.queryByText("Áp dụng lại bộ nguồn gốc “Kho”", { selector: "h2" })).toBeNull(), T);
    expect(getDb().catalog.items.find((i) => i.id === stuck.id)?.baseUnit).toBe("KGM");
    expect(getDb().catalog.conversions.find((c) => c.itemId === stuck.id && c.unit === "MTR")?.factor).toBe("0.5");
  }, 60_000);

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
