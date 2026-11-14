// @vitest-environment jsdom
import { screen, waitFor, within } from "@testing-library/react";
import { dismissToast } from "@kb/ui";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb, resetDb } from "@/mocks/db";
import { SEED_SETS } from "@/mocks/seed/catalog";
import { expectNoA11yViolations, renderWithProviders } from "@/test/dom";
import { CatalogPage } from "./catalog-page";

let search = new URLSearchParams("tab=queue");
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/products",
  useSearchParams: () => search,
}));

const T = { timeout: 5000 };
const table = () => screen.findByRole("table", { name: "Mục chờ duyệt" }, T);
const rowWith = async (text: string) => {
  const t = await table();
  await within(t).findByText(text, {}, T);
  return within(t).getAllByRole("row").find((r) => r.textContent?.includes(text))!;
};
/** Dòng đã có thao tác (phiên + bộ mã đã tải). */
const readyRow = async (code: string) => {
  await waitFor(async () => within(await rowWith(code)).getByRole("button", { name: `Thao tác khác – ${code}` }), T);
  return rowWith(code);
};
const queueOf = (code: string) => getDb().catalog.queue.find((q) => q.code === code)!;
const aliasOf = (code: string) => getDb().catalog.aliases.find((a) => a.code === code && a.status === "ACTIVE");
/** Mở popup "Chọn mặt hàng khác" của dòng, tìm theo mã rồi chọn mặt hàng có tên `name`. */
async function chooseOther(code: string, search: string, name: string) {
  await userEvent.click(within(await readyRow(code)).getByRole("button", { name: `Chọn mặt hàng khác – ${code}` }));
  const dialog = (await screen.findByText("Chọn mặt hàng để ghép", { selector: "h2" }, T)).closest<HTMLElement>("[role=dialog]")!;
  await userEvent.click(within(dialog).getByRole("combobox", { name: /Hoặc tìm mặt hàng khác|^Mặt hàng/ }));
  await userEvent.type(await screen.findByPlaceholderText("Tìm kiếm…", {}, T), search);
  await userEvent.click(await screen.findByRole("option", { name: new RegExp(name) }, T));
  await userEvent.click(within(dialog).getByRole("button", { name: "Chọn" }));
  await waitFor(() => expect(screen.queryByText("Chọn mặt hàng để ghép", { selector: "h2" })).toBeNull(), T);
}
/** Mở menu "…" của dòng rồi chọn thao tác. */
async function rowMenu(code: string, action: string) {
  await userEvent.click(within(await readyRow(code)).getByRole("button", { name: `Thao tác khác – ${code}` }));
  await userEvent.click(await screen.findByRole("menuitem", { name: action }, T));
}

beforeEach(() => {
  // Kho toast là toàn cục: toast của test trước không được làm test sau "thấy" kết quả sớm.
  dismissToast();
  resetDb();
  search = new URLSearchParams("tab=queue");
});

describe("Danh mục – tab Chờ duyệt", () => {
  it("tab hiện số mục chờ; bảng có mã · bộ mã, mức, lý do, ghép vào; không vi phạm a11y", async () => {
    const { container } = renderWithProviders(<CatalogPage />);
    expect(await screen.findByRole("tab", { name: /^Chờ duyệt\s*8$/ }, T)).toBeTruthy();
    const row = await readyRow("TH-0010");
    expect(within(row).getByText("Nghi vấn")).toBeTruthy();
    expect(within(row).getByText("ĐVT khác ĐVT gốc, chưa có quy đổi")).toBeTruthy();
    expect(within(row).getAllByText("XNK").length).toBeGreaterThan(0);
    await expectNoA11yViolations(container);
  }, 30_000);

  it("xác nhận một mục có gợi ý → ghép vào mặt hàng gợi ý, mục rời hàng chờ", async () => {
    renderWithProviders(<CatalogPage />);
    const code = "6205-2RSH/C3";
    const row = await readyRow(code);
    const confirm = within(row).getByRole("button", { name: new RegExp(`^Xác nhận ghép vào MH-\\d{6} – ${code.replace("/", "\\/")}$`) });
    await userEvent.click(confirm);
    expect(await screen.findByText(new RegExp(`Đã ghép mã ${code.replace("/", "\\/")} vào MH-`), {}, T)).toBeTruthy();
    await waitFor(async () => expect(within(await table()).queryByText(code)).toBeNull(), T);
    expect(queueOf(code).status).toBe("DONE");
  }, 30_000);

  it("mục không có gợi ý: nút ghi rõ “Tạo mặt hàng mới”, không phải “Xác nhận ghép”", async () => {
    renderWithProviders(<CatalogPage />);
    const row = await readyRow("KT-3L-50");
    expect(within(row).getByRole("button", { name: "Tạo mặt hàng mới – KT-3L-50" })).toBeTruthy();
    expect(within(row).queryByRole("button", { name: /^Xác nhận ghép vào/ })).toBeNull();
  }, 30_000);

  it("thiếu hệ số quy đổi → nút xác nhận khóa; nhập hệ số → xác nhận; bộ XNK là nguồn gốc → mặt hàng đổi ĐVT gốc sang TNE, quy đổi tính lại", async () => {
    renderWithProviders(<CatalogPage />);
    const row = await readyRow("TH-0010");
    const confirm = () => within(row).getByRole("button", { name: /^Xác nhận ghép vào MH-\d{6} – TH-0010$/ });
    expect(confirm()).toHaveProperty("disabled", true);
    await userEvent.type(within(row).getByRole("textbox", { name: "Hệ số quy đổi cho mã TH-0010" }), "1000");
    await waitFor(() => expect(confirm()).toHaveProperty("disabled", false), T);
    await userEvent.click(confirm());
    await waitFor(() => expect(queueOf("TH-0010").status).toBe("DONE"), T);
    const itemId = queueOf("TH-0010").suggestedItemId!;
    const cat = getDb().catalog;
    // 1 TNE = 1000 KGM → gốc mới TNE: 1 KGM = 0,001 TNE; 1 PCE = 471 KGM = 0,471 TNE.
    expect(cat.items.find((i) => i.id === itemId)?.baseUnit).toBe("TNE");
    const conv = Object.fromEntries(cat.conversions.filter((c) => c.itemId === itemId).map((c) => [c.unit, c.factor]));
    expect(conv).toEqual({ KGM: "0.001", PCE: "0.471" });
  }, 30_000);

  it("mục có hệ số từ cột Quy đổi của file → ô hệ số điền sẵn, xác nhận được ngay; không vi phạm a11y", async () => {
    Object.assign(queueOf("TH-0010"), { factor: "1000" });
    const { container } = renderWithProviders(<CatalogPage />);
    const row = await readyRow("TH-0010");
    const box = within(row).getByRole<HTMLInputElement>("textbox", { name: "Hệ số quy đổi cho mã TH-0010" });
    expect(box.value).toBe("1000");
    expect(within(row).getByText("Hệ số 1000 lấy từ cột Quy đổi của file")).toBeTruthy();
    const confirm = within(row).getByRole("button", { name: /^Xác nhận ghép vào MH-\d{6} – TH-0010$/ });
    expect(confirm).toHaveProperty("disabled", false);
    await expectNoA11yViolations(container);
    await userEvent.click(confirm);
    await waitFor(() => expect(queueOf("TH-0010").status).toBe("DONE"), T);
    expect(getDb().catalog.items.find((i) => i.id === queueOf("TH-0010").suggestedItemId)?.baseUnit).toBe("TNE");
  }, 30_000);

  it("xác nhận hàng loạt dùng hệ số của dòng file khi không gõ", async () => {
    Object.assign(queueOf("TH-0010"), { factor: "1000" });
    renderWithProviders(<CatalogPage />);
    await userEvent.click(within(await readyRow("TH-0010")).getByRole("checkbox"));
    await userEvent.click(await screen.findByRole("button", { name: "Xác nhận 1 mục" }, T));
    expect(await screen.findByText("Đã xác nhận 1 mục", {}, T)).toBeTruthy();
    expect(queueOf("TH-0010").status).toBe("DONE");
  }, 30_000);

  it("lý do LINKED_BY_CODE / LINK_NOT_FOUND có nhãn; mục kèm thông tin mặt hàng ghi rõ", async () => {
    const [a, b] = getDb().catalog.queue;
    Object.assign(a!, { reason: "LINK_NOT_FOUND", level: "NONE", itemFields: { kind: "MATERIAL", origin: "VN" } });
    Object.assign(b!, { reason: "LINKED_BY_CODE" });
    renderWithProviders(<CatalogPage />);
    const rowA = await rowWith(a!.code);
    expect(within(rowA).getByText(/Mã nối không khớp mặt hàng nào/)).toBeTruthy();
    expect(within(rowA).getByText(/Kèm thông tin mặt hàng từ file/)).toBeTruthy();
    expect(within(await rowWith(b!.code)).getByText("Nối theo cột Mã nối")).toBeTruthy();
  }, 30_000);

  it("chọn nhiều → “Xác nhận n mục”; có mục tạo mặt hàng mới → hỏi lại (k ghép, m tạo mới); mục lỗi (thiếu hệ số) báo riêng", async () => {
    renderWithProviders(<CatalogPage />);
    for (const code of ["6205-2RSH/C3", "KT-3L-50", "TH-0010"]) {
      await userEvent.click(within(await readyRow(code)).getByRole("checkbox"));
    }
    await userEvent.click(await screen.findByRole("button", { name: "Xác nhận 3 mục" }, T));
    const check = (await screen.findByText("Xác nhận các mục đã chọn?", { selector: "h2" }, T)).closest<HTMLElement>("[role=dialog]")!;
    expect(within(check).getByText(/2 mục ghép vào mặt hàng có sẵn, 1 mục sẽ tạo mặt hàng mới/)).toBeTruthy();
    await expectNoA11yViolations(check);
    expect(queueOf("KT-3L-50").status).toBe("PENDING");
    await userEvent.click(within(check).getByRole("button", { name: "Xác nhận 3 mục" }));
    expect(await screen.findByText("Đã xác nhận 2 mục", {}, T)).toBeTruthy();
    expect(await screen.findByText("1 mục chưa xác nhận được", {}, T)).toBeTruthy();
    // Toast có bản đọc cho trình đọc màn hình → chữ có thể xuất hiện hai lần.
    expect(screen.getAllByText(/TH-0010: ĐVT khác đơn vị gốc/).length).toBeGreaterThan(0);
    expect(queueOf("6205-2RSH/C3").status).toBe("DONE");
    expect(queueOf("KT-3L-50").status).toBe("DONE");
    expect(queueOf("TH-0010").status).toBe("PENDING");
  }, 40_000);

  it("Chọn mặt hàng khác: popup có ứng viên gợi ý kèm lý do + tìm tự do; xác nhận gửi CHOOSE → mã gắn vào mặt hàng đã chọn", async () => {
    renderWithProviders(<CatalogPage />);
    await userEvent.click(within(await readyRow("VT-0020")).getByRole("button", { name: "Chọn mặt hàng khác – VT-0020" }));
    const dialog = (await screen.findByText("Chọn mặt hàng để ghép", { selector: "h2" }, T)).closest<HTMLElement>("[role=dialog]")!;
    const candidates = within(dialog).getByRole("radiogroup", { name: "Ứng viên gợi ý" });
    expect(within(candidates).getAllByRole("radio").length).toBeGreaterThan(0);
    expect(within(candidates).getByText(/Tên gần giống, cùng chương HS · điểm/)).toBeTruthy();
    await expectNoA11yViolations(dialog);
    await userEvent.click(within(dialog).getByRole("button", { name: "Hủy" }));

    await chooseOther("VT-0020", "VT0013", "Vòng bi cầu 6308ZZ");
    const row = await readyRow("VT-0020");
    expect(within(row).getByText("Đã chọn khác")).toBeTruthy();
    // Gợi ý ban đầu là prd_seed_1; mã gắn vào prd_seed_2 = đã gửi CHOOSE với mặt hàng chọn khác.
    expect(queueOf("VT-0020").suggestedItemId).toBe("prd_seed_1");
    await userEvent.click(within(row).getByRole("button", { name: /^Xác nhận ghép vào MH-\d{6} – VT-0020$/ }));
    await waitFor(() => expect(queueOf("VT-0020").status).toBe("DONE"), T);
    expect(aliasOf("VT-0020")?.itemId).toBe("prd_seed_2");
    expect(queueOf("VT-0020").suggestedItemId).toBe("prd_seed_2");
  }, 40_000);

  it("xác nhận hàng loạt có dòng đã chọn khác → dòng đó gửi CHOOSE, không hỏi lại khi không có mục tạo mới", async () => {
    renderWithProviders(<CatalogPage />);
    await chooseOther("NU210", "HGR25", "Thanh trượt dẫn hướng HGR25");
    for (const code of ["NU210", "6205-2RSH/C3"]) await userEvent.click(within(await readyRow(code)).getByRole("checkbox"));
    await userEvent.click(await screen.findByRole("button", { name: "Xác nhận 2 mục" }, T));
    expect(await screen.findByText("Đã xác nhận 2 mục", {}, T)).toBeTruthy();
    expect(screen.queryByText("Xác nhận các mục đã chọn?", { selector: "h2" })).toBeNull();
    expect(aliasOf("NU210")?.itemId).toBe("prd_seed_7");
    expect(aliasOf("6205-2RSH/C3")?.itemId).toBe("prd_seed_1");
  }, 40_000);

  it("Tạo mặt hàng mới thay vì ghép, Bỏ qua (menu …)", async () => {
    renderWithProviders(<CatalogPage />);
    const before = getDb().catalog.items.length;
    await rowMenu("6205-2RSH/C3", "Tạo mặt hàng mới thay vì ghép");
    expect(await screen.findByText("Đã tạo mặt hàng mới cho mã 6205-2RSH/C3", {}, T)).toBeTruthy();
    expect(getDb().catalog.items.length).toBe(before + 1);
    expect(aliasOf("6205-2RSH/C3")?.itemId).not.toBe("prd_seed_1");
    await rowMenu("NU210", "Bỏ qua");
    expect(await screen.findByText("Đã bỏ qua mã NU210", {}, T)).toBeTruthy();
    expect(queueOf("NU210").status).toBe("SKIPPED");
  }, 40_000);

  it("người không phụ trách thấy mục nhưng không có nút duyệt; lọc “Của tôi” chỉ còn bộ mình phụ trách", async () => {
    getDb().currentUserId = "usr_ha"; // DECLARANT, phụ trách bộ Kho
    renderWithProviders(<CatalogPage />);
    const own = await readyRow("VT-0099");
    expect(within(own).getAllByRole("button", { name: /– VT-0099$/ }).length).toBeGreaterThan(0);
    expect(within(own).getByRole("checkbox")).toBeTruthy();
    const other = await rowWith("QCN-750-B");
    expect(within(other).queryByRole("button")).toBeNull();
    expect(within(other).queryByRole("checkbox")).toBeNull();
    await userEvent.click(screen.getByRole("checkbox", { name: "Của tôi" }));
    await waitFor(async () => expect(within(await table()).queryByText("QCN-750-B")).toBeNull(), T);
    expect(await rowWith("VT-0099")).toBeTruthy();
  }, 30_000);

  it("lý do MIGRATION_DUPLICATE_CODE đọc rõ ràng", async () => {
    const q = getDb().catalog.queue[0]!;
    Object.assign(q, { reason: "MIGRATION_DUPLICATE_CODE", codeSetId: SEED_SETS.XNK, sourceRef: "prd_3", importId: null });
    renderWithProviders(<CatalogPage />);
    const row = await rowWith(q.code);
    expect(within(row).getByText(/Trùng mã trong danh mục cũ/)).toBeTruthy();
    expect(within(row).getByText("Danh mục cũ")).toBeTruthy();
  }, 30_000);

  it.each([
    ["en", /^Pending review\s*8$/, "Items pending review", "Doubtful"],
    ["zh", /^待审核\s*8$/, "待审核项", "存疑"],
  ] as const)("ngôn ngữ %s: tab, bảng, mức ghép đã dịch", async (locale, tab, tableName, level) => {
    renderWithProviders(<CatalogPage />, locale);
    expect(await screen.findByRole("tab", { name: tab }, T)).toBeTruthy();
    const t = await screen.findByRole("table", { name: tableName }, T);
    expect((await within(t).findAllByText(level, {}, T)).length).toBeGreaterThan(0);
  }, 30_000);
});
