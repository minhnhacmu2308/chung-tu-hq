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
import { readFileBuffer } from "./read-xlsx";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace, back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/products",
  useSearchParams: () => new URLSearchParams("tab=import"),
}));

const saved: { blob: Blob; name: string }[] = [];
vi.mock("@/lib/xlsx-download", () => ({ saveBlob: (blob: Blob, name: string) => saved.push({ blob, name }) }));

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
async function upload(container: HTMLElement, file?: File) {
  const input = await waitFor(() => {
    const el = container.querySelector<HTMLInputElement>("input[type=file]");
    if (!el || el.disabled) throw new Error("dropzone chưa sẵn sàng");
    return el;
  }, T);
  await userEvent.upload(input, file ?? (await sampleFile()));
}

/** File có cột Mã nối, thông tin mặt hàng (xuất xứ, thuế NK) và một cột không dùng. */
async function richFile() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("DM");
  ws.addRow(["Mã vật tư", "Tên vật tư", "ĐVT", "Mã nối", "Xuất xứ", "Thuế NK", "Người lập"]);
  ws.addRow(["VT-9101", "Bu lông M12", "PCE", "", "CN", "5", "An"]);
  ws.addRow(["VT-9102", "Ổ bi đũa côn 30210", "PCE", "MH-000003", "DE", "7", "An"]);
  const buf = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
  return new File([buf], "dm-moi.xlsx", { type: XLSX });
}
/** Bấm "Nhập 2 dòng" khi đã mở (danh mục ĐVT Hải quan tải xong). */
async function clickImport() {
  const btn = await screen.findByRole("button", { name: "Nhập 2 dòng" }, T);
  await waitFor(() => expect(btn).toHaveProperty("disabled", false), T);
  await userEvent.click(btn);
}
/** Chọn trường cho một cột ở bước Ghép cột. */
async function mapColumn(column: string, field: string | RegExp) {
  await userEvent.click(screen.getByRole("combobox", { name: column }));
  await userEvent.click(await screen.findByRole("option", { name: field }, T));
}

beforeEach(() => {
  dismissToast();
  resetDb();
  replace.mockClear();
  window.localStorage.clear();
  saved.length = 0;
});

describe("Danh mục – tab Nhập dữ liệu", () => {
  it("file mẫu: tự nhận cột, báo dòng trùng mã, chọn ĐVT tương ứng, nhập xong hiện tóm tắt đúng số + Xem mục chờ duyệt; không vi phạm a11y", async () => {
    const { container } = renderWithProviders(<CatalogPage />);
    await chooseSet(/^XNK/);
    await upload(container);

    // Ghép cột: mỗi cột của file → trường hệ thống, nhận theo tên cột.
    expect((await screen.findByRole("combobox", { name: "Cột A · Mã vật tư" }, T)).textContent).toContain("Mã hàng");
    expect(screen.getByRole("combobox", { name: "Cột B · Tên vật tư" }).textContent).toContain("Tên hàng");
    expect(screen.getByRole("combobox", { name: "Cột C · ĐVT" }).textContent).toContain("ĐVT");
    expect(screen.getByRole("combobox", { name: "Cột D · Mã HS" }).textContent).toContain("Mã HS");
    expect(await screen.findByRole("table", { name: "5 dòng đầu theo ghép cột" }, T)).toBeTruthy();

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

  it("Ghép cột vào bộ nguồn gốc: đoán cột mới (Mã nối, Xuất xứ, Thuế NK), mỗi trường một cột, xem trước 5 dòng, nhớ ghép cột cho lần sau; không vi phạm a11y", async () => {
    const view = renderWithProviders(<CatalogPage />);
    await chooseSet(/^XNK/);
    await upload(view.container, await richFile());
    expect((await screen.findByRole("combobox", { name: "Cột D · Mã nối" }, T)).textContent).toContain("Mã nối");
    expect(screen.getByRole("combobox", { name: "Cột E · Xuất xứ" }).textContent).toContain("Xuất xứ");
    expect(screen.getByRole("combobox", { name: "Cột F · Thuế NK" }).textContent).toContain("Thuế suất NK (%)");
    expect(screen.getByRole("combobox", { name: "Cột G · Người lập" }).textContent).toContain("Bỏ qua");
    // XNK là bộ nguồn gốc → không có cảnh báo bỏ qua cột.
    expect(screen.queryByText(/không phải bộ nguồn gốc/)).toBeNull();
    const preview = await screen.findByRole("table", { name: "5 dòng đầu theo ghép cột" }, T);
    expect(within(preview).getByText("MH-000003")).toBeTruthy();
    expect(within(preview).getByText("DE")).toBeTruthy();

    // Trường đã gán cột khác không chọn được ở cột G (mỗi trường chỉ một cột).
    await userEvent.click(screen.getByRole("combobox", { name: "Cột G · Người lập" }));
    expect((await screen.findByRole("option", { name: "Mã hàng (đang gán cột A)" }, T)).getAttribute("aria-disabled")).toBe("true");
    await userEvent.click(await screen.findByRole("option", { name: "Ghi chú" }, T));
    expect(screen.getByRole("combobox", { name: "Cột G · Người lập" }).textContent).toContain("Ghi chú");
    // Bỏ cột mã → báo thiếu trường bắt buộc, chưa xem trước được.
    await mapColumn("Cột A · Mã vật tư", "Bỏ qua");
    expect(await screen.findByText("Chưa gán cột cho: Mã hàng.", {}, T)).toBeTruthy();
    expect(screen.queryByRole("table", { name: "5 dòng đầu theo ghép cột" })).toBeNull();
    await mapColumn("Cột A · Mã vật tư", "Mã hàng");
    await expectNoA11yViolations(view.container);

    await clickImport();
    await screen.findByText("Đã nhập xong", {}, T);
    const imp = getDb().catalog.imports[0]!;
    expect(imp.columnMap).toMatchObject({ code: 0, name: 1, unit: 2, linkCode: 3, origin: 4, importDutyRate: 5, note: 6 });
    // Dòng 2 nối thẳng vào MH-000003 (Ổ bi đũa côn 30210) qua cột Mã nối; bộ nguồn gốc → xuất xứ, thuế của dòng áp vào mặt hàng.
    const linked = getDb().catalog.aliases.find((a) => a.code === "VT-9102" && a.status === "ACTIVE")!;
    expect(linked.itemId).toBe("prd_seed_3");
    expect(getDb().catalog.items.find((i) => i.id === "prd_seed_3")).toMatchObject({ origin: "DE", importDutyRate: "7", note: "An" });

    // Lần sau (cùng bộ): cột G dùng lại "Ghi chú" đã chọn.
    view.unmount();
    const again = renderWithProviders(<CatalogPage />);
    await chooseSet(/^XNK/);
    await upload(again.container, await richFile());
    expect((await screen.findByRole("combobox", { name: "Cột G · Người lập" }, T)).textContent).toContain("Ghi chú");
    expect(screen.getByText("Đã dùng lại cách ghép cột lần trước của bộ này.")).toBeTruthy();
  }, 90_000);

  it("ĐVT số lượng 2 + tỷ lệ: tự nhận cột, nhập vào bộ nguồn gốc → mặt hàng có ĐVT 2; thiếu tỷ lệ → lỗi dòng đã dịch", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("DM");
    ws.addRow(["Mã vật tư", "Tên vật tư", "ĐVT", "Mã nối", "ĐVT số lượng 2", "Tỷ lệ SL2"]);
    ws.addRow(["VT-9201", "Ổ bi đũa côn 30210", "PCE", "MH-000003", "KGM", "0,35"]);
    ws.addRow(["VT-9202", "Bu lông M16", "PCE", "", "KGM", ""]);
    ws.addRow(["VT-9203", "Bu lông M20", "PCE", "", "", ""]);
    const buf = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
    const view = renderWithProviders(<CatalogPage />);
    await chooseSet(/^XNK/);
    await upload(view.container, new File([buf], "dm-sl2.xlsx", { type: XLSX }));
    expect((await screen.findByRole("combobox", { name: "Cột E · ĐVT số lượng 2" }, T)).textContent).toContain("ĐVT số lượng 2");
    expect(screen.getByRole("combobox", { name: "Cột F · Tỷ lệ SL2" }).textContent).toContain("Tỷ lệ SL2");
    expect(await screen.findByText("ĐVT số lượng 2 khác ĐVT của dòng – cần cột Tỷ lệ SL2", {}, T)).toBeTruthy();
    const btn = await screen.findByRole("button", { name: /^Nhập 2 dòng hợp lệ/ }, T);
    await waitFor(() => expect(btn).toHaveProperty("disabled", false), T);
    await userEvent.click(btn);
    await screen.findByText("Đã nhập xong", {}, T);
    expect(getDb().catalog.imports[0]!.columnMap).toMatchObject({ qty2Unit: 4, qty2Factor: 5 });
    expect(getDb().catalog.items.find((i) => i.id === "prd_seed_3")).toMatchObject({ qty2Unit: "KGM", qty2Factor: "0.35" });
  }, 90_000);

  it("bộ không phải nguồn gốc: cảnh báo, cột thông tin mặt hàng bỏ qua và không gửi đi", async () => {
    const { container } = renderWithProviders(<CatalogPage />);
    await chooseSet(/^Kho/);
    await upload(container, await richFile());
    expect(await screen.findByText("Bộ “Kho (Kho)” không phải bộ nguồn gốc", {}, T)).toBeTruthy();
    expect(screen.getByText(/Các cột thông tin mặt hàng \(Xuất xứ, Thuế suất NK \(%\)\) sẽ bỏ qua/)).toBeTruthy();
    expect(screen.getAllByText("Bỏ qua – bộ này không phải bộ nguồn gốc")).toHaveLength(2);
    // Trường thông tin mặt hàng không gán được cho cột khác.
    await userEvent.click(screen.getByRole("combobox", { name: "Cột G · Người lập" }));
    expect((await screen.findByRole("option", { name: "Loại hàng (chỉ bộ nguồn gốc)" }, T)).getAttribute("aria-disabled")).toBe("true");
    await userEvent.keyboard("{Escape}");
    // Xem trước không có cột Xuất xứ.
    const preview = await screen.findByRole("table", { name: "5 dòng đầu theo ghép cột" }, T);
    expect(within(preview).getByText("MH-000003")).toBeTruthy();
    expect(within(preview).queryByText("DE")).toBeNull();
    await expectNoA11yViolations(container);

    await clickImport();
    await screen.findByText("Đã nhập xong", {}, T);
    const imp = getDb().catalog.imports[0]!;
    expect(imp.codeSetId).toBe(SEED_SETS.WH);
    expect(imp.columnMap).not.toHaveProperty("origin");
    expect(imp.columnMap).not.toHaveProperty("importDutyRate");
    // Mặt hàng được nối không bị đổi xuất xứ (bộ Kho không quyết định thông tin mặt hàng).
    expect(getDb().catalog.items.find((i) => i.id === "prd_seed_3")?.origin).toBe("JP");
    expect(getDb().catalog.items.find((i) => i.id === "prd_seed_3")?.importDutyRate).toBe("3");
  }, 60_000);

  it("file đối chiếu: tải cho bộ Kho, điền mã một dòng rồi nhập lại → dòng chưa điền bỏ qua, dòng đã điền nối thẳng theo Mã nối", async () => {
    const { container } = renderWithProviders(<CatalogPage />);
    await chooseSet(/^Kho/);
    expect(await screen.findByText("Chưa có mã chung với bộ nguồn gốc?", {}, T)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Tải file đối chiếu" }));
    await waitFor(() => expect(saved).toHaveLength(1), T);
    expect(saved[0]!.name).toBe("doi-chieu-ma-Kho.xlsx");

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await readFileBuffer(saved[0]!.blob));
    const ws = wb.worksheets[0]!;
    expect((ws.getRow(1).values as unknown[]).slice(1)).toEqual([
      "Mã nối", "Mã XNK (tham khảo)", "Tên mặt hàng (tham khảo)", "Mã HS (tham khảo)", "ĐVT gốc (tham khảo)", "Mã hàng", "Tên hàng", "ĐVT", "Quy đổi",
    ]);
    const item = getDb().catalog.items.find((i) => i.id === "prd_seed_3")!;
    let filled = 0;
    ws.eachRow((row, n) => {
      if (n === 1) return;
      if (row.getCell(1).value === item.itemNo) {
        expect(row.getCell(2).value).toBe("30210");
        row.getCell(6).value = "KHO-30210";
        filled = n;
      }
    });
    expect(filled).toBeGreaterThan(0);
    // Mặt hàng đã có mã ở bộ Kho được điền sẵn (mã/tên/ĐVT/hệ số) → cũng được nhập lại (cập nhật); dòng trống mã → bỏ qua.
    let withCode = 0;
    ws.eachRow((row, n) => {
      if (n > 1 && String(row.getCell(6).value ?? "").trim()) withCode += 1;
    });
    const rowsTotal = ws.rowCount - 1;
    expect(withCode).toBeLessThan(rowsTotal);
    const buf = (await wb.xlsx.writeBuffer()) as ArrayBuffer;

    await upload(container, new File([buf], "doi-chieu.xlsx", { type: XLSX }));
    expect(await screen.findByText(new RegExp(`^${rowsTotal - withCode} dòng có Mã nối nhưng chưa điền Mã hàng`), {}, T)).toBeTruthy();
    const btn = await screen.findByRole("button", { name: `Nhập ${withCode} dòng` }, T);
    await waitFor(() => expect(btn).toHaveProperty("disabled", false), T);
    await userEvent.click(btn);
    await screen.findByText("Đã nhập xong", {}, T);
    const alias = getDb().catalog.aliases.find((a) => a.codeSetId === SEED_SETS.WH && a.code === "KHO-30210");
    expect(alias?.itemId).toBe("prd_seed_3");
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
