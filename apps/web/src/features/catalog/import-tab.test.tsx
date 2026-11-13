// @vitest-environment jsdom
import { dismissToast } from "@kb/ui";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ExcelJS from "exceljs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb, resetDb } from "@/mocks/db";
import { SEED_SETS } from "@/mocks/seed/catalog";
import { expectNoA11yViolations, renderWithProviders } from "@/test/dom";
import { CatalogPage } from "./catalog-page";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace, back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/products",
  useSearchParams: () => new URLSearchParams("tab=import"),
}));

const T = { timeout: 8000 };
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** File mẫu của bộ XNK: dòng 3 trùng mã dòng 2, dòng 5 ĐVT "Cái" chưa có trong danh mục ĐVT Hải quan. */
async function sampleFile() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Danh mục");
  ws.addRow(["Mã vật tư", "Tên vật tư", "ĐVT", "Mã HS"]);
  ws.addRow(["VT-9001", "Bu lông lục giác M8", "PCE", "73181510"]);
  ws.addRow(["vt 9001", "Bu lông lục giác M8 (trùng)", "PCE", "73181510"]);
  ws.addRow(["30210", "Ổ bi đũa côn 30210", "PCE", "84822000"]);
  ws.addRow(["VT-9002", "Đai ốc M8", "Cái", ""]);
  const buf = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
  return new File([buf], "danh-muc-xnk.xlsx", { type: XLSX });
}

async function chooseSet(name: RegExp) {
  await userEvent.click(await screen.findByRole("combobox", { name: "Bộ mã nhận dữ liệu" }, T));
  await userEvent.click(await screen.findByRole("option", { name }, T));
}
async function upload(container: HTMLElement) {
  const input = await waitFor(() => {
    const el = container.querySelector<HTMLInputElement>("input[type=file]");
    if (!el || el.disabled) throw new Error("dropzone chưa sẵn sàng");
    return el;
  }, T);
  await userEvent.upload(input, await sampleFile());
}

beforeEach(() => {
  dismissToast();
  resetDb();
  replace.mockClear();
});

describe("Danh mục – tab Nhập dữ liệu", () => {
  it("file mẫu: tự nhận cột, báo dòng trùng mã, chọn ĐVT tương ứng, nhập xong hiện tóm tắt đúng số + Xem mục chờ duyệt; không vi phạm a11y", async () => {
    const { container } = renderWithProviders(<CatalogPage />);
    await chooseSet(/^XNK/);
    await upload(container);

    // Ghép cột: nhận theo tên cột.
    expect((await screen.findByRole("combobox", { name: "Mã hàng" }, T)).textContent).toContain("Mã vật tư");
    expect(screen.getByRole("combobox", { name: "Tên hàng" }).textContent).toContain("Tên vật tư");
    expect(screen.getByRole("combobox", { name: "ĐVT" }).textContent).toContain("ĐVT");
    expect(screen.getByRole("combobox", { name: "Mã HS" }).textContent).toContain("Mã HS");

    // Xem trước: dòng trùng mã = dòng dữ liệu thứ 2 (dòng 3 trên Excel); ĐVT lạ.
    const errors = await screen.findByRole("table", { name: "Dòng lỗi" }, T);
    const dup = within(errors).getAllByRole("row").find((r) => r.textContent?.includes("Trùng mã với dòng trước trong file"))!;
    expect(within(dup).getByText("3")).toBeTruthy();
    expect(within(dup).getByText("vt 9001")).toBeTruthy();
    // ĐVT lạ chỉ được báo khi danh mục ĐVT Hải quan đã tải.
    expect(await screen.findByText("2 dòng hợp lệ · 2 dòng lỗi (bỏ qua khi nhập, các dòng khác vẫn nhập)", {}, T)).toBeTruthy();
    await expectNoA11yViolations(container);

    // Chọn ĐVT Hải quan cho "Cái" → dòng đó hết lỗi.
    await userEvent.click(screen.getByRole("combobox", { name: "ĐVT Hải quan cho “Cái” (1 dòng)" }));
    // Ô tìm của bảng lỗi cũng là "Tìm kiếm…" – ô của danh sách ĐVT vừa mở nằm cuối trang.
    await userEvent.type((await screen.findAllByPlaceholderText("Tìm kiếm…", {}, T)).at(-1)!, "PCE");
    await userEvent.click(await screen.findByRole("option", { name: /^PCE/ }, T));
    expect(await screen.findByText("3 dòng hợp lệ · 1 dòng lỗi (bỏ qua khi nhập, các dòng khác vẫn nhập)", {}, T)).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "Nhập 3 dòng hợp lệ (1 dòng lỗi được ghi lại và bỏ qua)" }));
    await screen.findByText("Đã nhập xong", {}, T);
    const done = getDb().catalog.imports[0]!;
    expect(done.codeSetId).toBe(SEED_SETS.XNK);
    expect(done.counts).toEqual({ created: 0, matched: 1, queued: 2, skipped: 0, errors: 1 });
    const stat = (label: string) => screen.getByRole("region", { name: label });
    // Con số chạy đếm: một bản hiển thị (aria-hidden) + một bản cho trình đọc màn hình – chờ cả hai về giá trị cuối.
    const shows = (label: string, n: string) => expect(within(stat(label)).getAllByText(n)).toHaveLength(2);
    await waitFor(() => {
      shows("Mặt hàng mới", "0");
      shows("Tự ghép", "1");
      shows("Chờ duyệt", "2");
      shows("Bỏ qua", "0");
      shows("Dòng lỗi", "1");
    }, T);
    // ĐVT đã chọn được gửi đi thay cho "Cái".
    expect(getDb().catalog.queue.find((q) => q.code === "VT-9002")?.unit).toBe("PCE");

    await userEvent.click(screen.getByRole("button", { name: "Xem 2 mục chờ duyệt" }));
    expect(replace).toHaveBeenCalledWith("/products?tab=queue", { scroll: false });
  }, 60_000);

  it("Lấy từ chứng từ đã đọc (Quản trị): có cả hai nguồn; lấy từ tờ khai đã duyệt → tóm tắt hoặc báo không có dòng mới", async () => {
    renderWithProviders(<CatalogPage />);
    const btn = await screen.findByRole("button", { name: "Từ tờ khai đã duyệt" }, T);
    expect(screen.getByRole("button", { name: "Từ hóa đơn / phiếu đóng gói" })).toBeTruthy();
    await userEvent.click(btn);
    await waitFor(() => expect(screen.queryByText("Đã lấy từ chứng từ") ?? screen.queryByText("Không có dòng hàng nào để lấy")).toBeTruthy(), T);
  }, 30_000);

  it("người khai không phụ trách bộ nào: không có ô nhập file, không có nút lấy từ chứng từ", async () => {
    getDb().currentUserId = "usr_linh";
    renderWithProviders(<CatalogPage />);
    expect(await screen.findByText("Bạn chưa phụ trách bộ mã nào", {}, T)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Từ tờ khai đã duyệt" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Từ hóa đơn / phiếu đóng gói" })).toBeNull();
  }, 30_000);

  it.each([
    ["en", "Import from Excel", "Code set to import into", "Pull from processed documents"],
    ["zh", "从 Excel 导入", "导入到编码集", "从已读取的单据获取"],
  ] as const)("ngôn ngữ %s: tiêu đề, nhãn đã dịch", async (locale, title, setLabel, docs) => {
    renderWithProviders(<CatalogPage />, locale);
    expect(await screen.findByRole("heading", { name: title }, T)).toBeTruthy();
    expect(await screen.findByRole("combobox", { name: setLabel }, T)).toBeTruthy();
    expect(screen.getByRole("heading", { name: docs })).toBeTruthy();
  }, 30_000);
});
