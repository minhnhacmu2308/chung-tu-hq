import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../test/a11y.js";
import { Button } from "./button.js";
import { UiLocaleProvider } from "../lib/i18n.js";
import { createDataTableColumnHelper, DataTable, type DataTableProps } from "./data-table.js";
import { RecordCard } from "./record-card.js";
import { chooseOption } from "../../test/select.js";

type HoSo = { id: string; code: string; partner: string; value: number };
const col = createDataTableColumnHelper<HoSo>();
const COLUMNS = col.columns([
  col.accessor("code", { header: "Mã hồ sơ" }),
  col.accessor("partner", { header: "Đối tác" }),
  col.accessor("value", { header: "Trị giá", meta: { align: "end" }, cell: (c) => c.getValue().toLocaleString("vi-VN") }),
]);
const DATA: HoSo[] = [
  { id: "a", code: "HS-002", partner: "Korea Bearing", value: 20850 },
  { id: "b", code: "HS-001", partner: "Artemide", value: 6230 },
  { id: "c", code: "HS-003", partner: "SLAMP", value: 4986 },
];

function setup(props: Partial<DataTableProps<HoSo>> = {}) {
  return render(<DataTable aria-label="Hồ sơ khai báo" columns={COLUMNS} data={DATA} getRowId={(r) => r.id} {...props} />);
}
const bodyRows = () => within(screen.getByRole("table")).getAllByRole("row").slice(1);
const firstCells = () => bodyRows().map((r) => within(r).getAllByRole("cell")[0]!.textContent);

describe("DataTable – hiển thị", () => {
  it("bảng có tên, tiêu đề cột và đủ dòng; cột số canh phải", () => {
    setup({ pagination: false });
    const table = screen.getByRole("table", { name: "Hồ sơ khai báo" });
    expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Mã hồ sơ", "Đối tác", "Trị giá"]);
    expect(bodyRows()).toHaveLength(3);
    expect(within(bodyRows()[0]!).getAllByRole("cell")[2]).toHaveClass("text-right");
  });

  it("caption thay cho aria-label, mặc định chỉ cho trình đọc màn hình", () => {
    render(<DataTable caption="Danh sách hồ sơ" columns={COLUMNS} data={DATA} getRowId={(r) => r.id} pagination={false} />);
    expect(screen.getByRole("table", { name: "Danh sách hồ sơ" })).toBeInTheDocument();
    expect(screen.getByText("Danh sách hồ sơ")).toHaveClass("sr-only");
  });
});

describe("DataTable – sắp xếp", () => {
  it("bấm tiêu đề cột: tăng dần → giảm dần, aria-sort cập nhật", async () => {
    setup({ pagination: false });
    const header = screen.getByRole("columnheader", { name: /Mã hồ sơ/ });
    expect(header).toHaveAttribute("aria-sort", "none");
    await userEvent.click(within(header).getByRole("button"));
    expect(header).toHaveAttribute("aria-sort", "ascending");
    expect(firstCells()).toEqual(["HS-001", "HS-002", "HS-003"]);
    await userEvent.click(within(header).getByRole("button"));
    expect(header).toHaveAttribute("aria-sort", "descending");
    expect(firstCells()).toEqual(["HS-003", "HS-002", "HS-001"]);
  });

  it("sắp xếp bằng bàn phím (Enter trên nút tiêu đề)", async () => {
    setup({ pagination: false });
    within(screen.getByRole("columnheader", { name: /Trị giá/ })).getByRole("button").focus();
    await userEvent.keyboard("{Enter}");
    // cột số: lần đầu theo mặc định của thư viện (số → giảm dần trước)
    const sorted = screen.getByRole("columnheader", { name: /Trị giá/ }).getAttribute("aria-sort");
    expect(["ascending", "descending"]).toContain(sorted);
    const values = bodyRows().map((r) => within(r).getAllByRole("cell")[2]!.textContent);
    expect(values).toEqual(sorted === "ascending" ? ["4.986", "6.230", "20.850"] : ["20.850", "6.230", "4.986"]);
  });

  it("initialSorting được áp dụng ngay", () => {
    setup({ pagination: false, initialSorting: [{ id: "partner", desc: false }] });
    expect(bodyRows().map((r) => within(r).getAllByRole("cell")[1]!.textContent)).toEqual(["Artemide", "Korea Bearing", "SLAMP"]);
  });
});

describe("DataTable – chọn dòng", () => {
  it("chọn tất cả → báo đủ id; bỏ một dòng → checkbox tiêu đề ở trạng thái một phần", async () => {
    const onSelectionChange = vi.fn();
    setup({ pagination: false, selectable: true, onSelectionChange, rowLabel: (r) => r.code });
    const all = screen.getByRole("checkbox", { name: "Chọn tất cả" }) as HTMLInputElement;
    await userEvent.click(all);
    expect(onSelectionChange).toHaveBeenLastCalledWith(expect.arrayContaining(["a", "b", "c"]));
    await userEvent.click(screen.getByRole("checkbox", { name: "Chọn dòng HS-001" }));
    expect(onSelectionChange.mock.lastCall![0]).toHaveLength(2);
    expect(all.indeterminate).toBe(true);
    expect(screen.getByRole("checkbox", { name: "Chọn dòng HS-002" }).closest("tr")).toHaveAttribute("aria-selected", "true");
  });
});

describe("DataTable – bấm dòng & hành động", () => {
  it("bấm dòng hoặc Enter/Space trên dòng gọi onRowClick", async () => {
    const onRowClick = vi.fn();
    setup({ pagination: false, onRowClick });
    await userEvent.click(screen.getByText("Artemide"));
    bodyRows()[2]!.focus();
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard(" ");
    expect(onRowClick.mock.calls.map((c) => c[0].id)).toEqual(["b", "c", "c"]);
  });

  it("bấm checkbox hay nút hành động trong dòng KHÔNG kích hoạt onRowClick", async () => {
    const onRowClick = vi.fn();
    const onEdit = vi.fn();
    setup({
      pagination: false,
      onRowClick,
      selectable: true,
      rowLabel: (r) => r.code,
      rowActions: (r) => <button type="button" onClick={() => onEdit(r.id)}>Sửa {r.code}</button>,
    });
    await userEvent.click(screen.getByRole("checkbox", { name: "Chọn dòng HS-001" }));
    await userEvent.click(screen.getByRole("button", { name: "Sửa HS-003" }));
    expect(onEdit).toHaveBeenCalledWith("c");
    expect(onRowClick).not.toHaveBeenCalled();
    expect(screen.getByRole("columnheader", { name: "Thao tác" })).toBeInTheDocument();
  });
});

describe("DataTable – thao tác dòng nổi khi rê chuột", () => {
  it("không chừa cột: ô thao tác rộng 0; cụm nút nổi (absolute) ẩn tới khi rê chuột / Tab vào dòng / menu đang mở; cảm ứng luôn hiện", () => {
    setup({ pagination: false, rowLabel: (r) => r.code, rowActions: (r) => <button type="button">Sửa {r.code}</button> });
    const header = screen.getByRole("columnheader", { name: "Thao tác" });
    expect(header.className).toMatch(/\bw-0\b/);
    expect(header.className).toMatch(/\bp-0\b/);
    const overlay = screen.getByRole("button", { name: "Sửa HS-001" }).closest("[data-slot=row-actions-overlay]")!;
    expect(overlay).not.toBeNull();
    expect(overlay.className).toMatch(/\babsolute\b/);
    expect(overlay.className).toContain("opacity-0");
    expect(overlay.className).toContain("group-hover:opacity-100");
    expect(overlay.className).toContain("group-focus-within:opacity-100");
    expect(overlay.className).toContain("[@media(hover:none)]:opacity-100");
    const cell = overlay.closest("td")!;
    expect(cell.className).toMatch(/\bw-0\b/);
    expect(cell.className).toMatch(/\bp-0\b/);
  });
});

describe("DataTable – trạng thái", () => {
  it("loading: aria-busy, dòng skeleton, thông báo cho trình đọc màn hình, ẩn phân trang", () => {
    setup({ loading: true, loadingRows: 4 });
    expect(screen.getByRole("table")).toHaveAttribute("aria-busy", "true");
    expect(bodyRows()).toHaveLength(4);
    expect(screen.getByRole("status")).toHaveTextContent("Đang tải dữ liệu");
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  it("rỗng: EmptyState với tiêu đề/mô tả/hành động truyền vào", () => {
    setup({ data: [], emptyTitle: "Chưa có hồ sơ", emptyDescription: "Tạo hồ sơ đầu tiên", emptyAction: <button type="button">Tạo hồ sơ</button> });
    expect(screen.getByText("Chưa có hồ sơ")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tạo hồ sơ" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });
});

describe("DataTable – phân trang", () => {
  const MANY: HoSo[] = Array.from({ length: 25 }, (_, i) => ({ id: `r${i}`, code: `HS-${String(i + 1).padStart(3, "0")}`, partner: "P", value: i }));

  it("client: cắt trang theo initialPageSize, chuyển trang hiển thị dòng tiếp theo", async () => {
    setup({ data: MANY, pagination: { initialPageSize: 10 } });
    expect(bodyRows()).toHaveLength(10);
    expect(screen.getByText("1–10 / 25")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Trang 3" }));
    expect(firstCells()).toEqual(["HS-021", "HS-022", "HS-023", "HS-024", "HS-025"]);
  });

  it("controlled + rowCount (server): không tự cắt dữ liệu, báo trang mới ra ngoài", async () => {
    const onChange = vi.fn();
    function Server() {
      const [page, setPage] = useState({ pageIndex: 0, pageSize: 10 });
      return (
        <DataTable
          aria-label="Server"
          columns={COLUMNS}
          data={MANY.slice(0, 10)}
          getRowId={(r) => r.id}
          pagination={{ mode: "controlled", ...page, rowCount: 95, onChange: (p) => { setPage(p); onChange(p); } }}
        />
      );
    }
    render(<Server />);
    expect(screen.getByText("1–10 / 95")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Trang sau" }));
    expect(onChange).toHaveBeenLastCalledWith({ pageIndex: 1, pageSize: 10 });
    expect(screen.getByText("11–20 / 95")).toBeInTheDocument();
  });
});

describe("DataTable – đa ngôn ngữ & a11y", () => {
  it("tiếng Anh: nhãn chọn tất cả, rỗng", () => {
    render(
      <UiLocaleProvider locale="en">
        <DataTable aria-label="Files" columns={COLUMNS} data={[]} getRowId={(r) => r.id} selectable />
      </UiLocaleProvider>,
    );
    expect(screen.getByRole("checkbox", { name: "Select all" })).toBeInTheDocument();
    expect(screen.getByText("No data")).toBeInTheDocument();
  });

  it("không vi phạm a11y (chọn dòng + bấm dòng + phân trang)", async () => {
    const { container } = setup({ selectable: true, onRowClick: () => {}, rowLabel: (r) => r.code, rowActions: (r) => <button type="button">Sửa {r.code}</button> });
    await expectNoA11yViolations(container);
  });
});

/* ===================== Tìm kiếm, lọc, ẩn cột, đổi độ rộng ===================== */

type HoSoVn = { id: string; code: string; partner: string; status: string; value: number };
const vcol = createDataTableColumnHelper<HoSoVn>();
const VN_COLUMNS = vcol.columns([
  vcol.accessor("code", { header: "Mã hồ sơ", size: 160, minSize: 120, maxSize: 300, meta: { filter: "text", hideable: false } }),
  vcol.accessor("partner", { header: "Đối tác", meta: { filter: "text" } }),
  vcol.accessor("status", { header: "Trạng thái", meta: { filter: "select" } }),
  vcol.accessor("value", { header: "Trị giá", meta: { align: "end" } }),
]);
const VN_DATA: HoSoVn[] = [
  { id: "a", code: "HS-001", partner: "Công ty Đông Hải", status: "Đã duyệt", value: 100 },
  { id: "b", code: "HS-002", partner: "Hải Phòng Logistics", status: "Chờ duyệt", value: 200 },
  { id: "c", code: "HS-003", partner: "Artemide", status: "Đã duyệt", value: 300 },
  { id: "d", code: "HS-004", partner: "Thương mại Hưng Thịnh", status: "Nháp", value: 400 },
];

function setupVn(props: Partial<DataTableProps<HoSoVn>> = {}) {
  return render(
    <DataTable aria-label="Danh sách hồ sơ" columns={VN_COLUMNS} data={VN_DATA} getRowId={(r) => r.id} pagination={false} {...props} />,
  );
}
const vnTable = () => screen.getByRole("table", { name: "Danh sách hồ sơ" });
// Dòng dữ liệu = các dòng trong tbody (thead có thêm dòng ô lọc)
const vnCodes = () =>
  within(vnTable())
    .getAllByRole("row")
    .filter((r) => r.closest("tbody"))
    .map((r) => within(r).queryAllByRole("cell")[0]?.textContent);

describe("DataTable – tìm kiếm toàn bảng", () => {
  it.each([
    ["hai", ["HS-001", "HS-002"]],
    ["dong hai", ["HS-001"]],
    ["HAI PHONG", ["HS-002"]],
    ["thuong mai", ["HS-004"]],
    ["300", ["HS-003"]],
  ])("gõ không dấu '%s' vẫn tìm đúng dòng có dấu", async (q, codes) => {
    setupVn({ searchable: true });
    await userEvent.type(screen.getByRole("searchbox", { name: "Tìm trong bảng" }), q);
    expect(vnCodes()).toEqual(codes);
  });

  it("đang lọc: báo số dòng hiển thị / tổng", async () => {
    setupVn({ searchable: true });
    expect(screen.getByRole("status")).toHaveTextContent("");
    await userEvent.type(screen.getByRole("searchbox", { name: "Tìm trong bảng" }), "duyet");
    expect(screen.getByRole("status")).toHaveTextContent("Hiển thị 3/4 dòng");
  });

  it("mặc định không có thanh công cụ, không có dòng ô lọc", () => {
    setup({ pagination: false });
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cột" })).not.toBeInTheDocument();
    expect(screen.queryByRole("separator")).not.toBeInTheDocument();
  });
});

/** Ô lọc theo cột nằm trong hộp lọc mở từ nút phễu cạnh ô tìm kiếm. */
const openFilters = (name: RegExp = /^Bộ lọc/) => userEvent.click(screen.getByRole("button", { name }));

describe("DataTable – thao tác hàng loạt", () => {
  it("chọn dòng → thanh nổi giữa đáy màn hình: đếm số dòng, nút thao tác nhận các dòng đã chọn, Bỏ chọn ẩn thanh; không vi phạm a11y", async () => {
    const onBulk = vi.fn();
    setupVn({ selectable: true, rowLabel: (r) => r.code, selectionActions: (rows) => <Button onClick={() => onBulk(rows.map((r) => r.code))}>Xuất</Button> });
    expect(screen.queryByRole("toolbar", { name: "Thao tác với các dòng đã chọn" })).toBeNull();
    await userEvent.click(screen.getByRole("checkbox", { name: "Chọn dòng HS-001" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Chọn dòng HS-003" }));
    const bar = screen.getByRole("toolbar", { name: "Thao tác với các dòng đã chọn" });
    expect(bar.parentElement).toBe(document.body);
    expect(bar).toHaveTextContent("Đã chọn 2");
    await userEvent.click(within(bar).getByRole("button", { name: "Xuất" }));
    expect(onBulk).toHaveBeenCalledWith(["HS-001", "HS-003"]);
    await expectNoA11yViolations(document.body);
    await userEvent.click(within(bar).getByRole("button", { name: "Bỏ chọn" }));
    expect(screen.queryByRole("toolbar", { name: "Thao tác với các dòng đã chọn" })).toBeNull();
    expect(screen.getByRole("checkbox", { name: "Chọn dòng HS-001" })).not.toBeChecked();
  });

  it("dòng đã chọn bị xóa khỏi dữ liệu → không còn tính, hết dòng thì thanh ẩn", async () => {
    const actions = () => <Button>Xóa</Button>;
    const { rerender } = setupVn({ selectable: true, rowLabel: (r) => r.code, selectionActions: actions });
    await userEvent.click(screen.getByRole("checkbox", { name: "Chọn dòng HS-002" }));
    expect(screen.getByRole("toolbar")).toHaveTextContent("Đã chọn 1");
    rerender(<DataTable aria-label="Danh sách hồ sơ" columns={VN_COLUMNS} data={VN_DATA.filter((r) => r.id !== "b")} getRowId={(r) => r.id} pagination={false} selectable rowLabel={(r) => r.code} selectionActions={actions} />);
    expect(screen.queryByRole("toolbar")).toBeNull();
  });
});

describe("DataTable – lọc theo cột", () => {
  it("không có hàng ô lọc dưới tiêu đề; nút phễu mở hộp lọc, đếm số bộ lọc đang bật; không vi phạm a11y", async () => {
    setupVn();
    expect(screen.queryByRole("combobox", { name: "Lọc theo Trạng thái" })).not.toBeInTheDocument();
    await openFilters();
    const dialog = screen.getByRole("dialog", { name: "Bộ lọc" });
    await chooseOption(within(dialog).getByRole("combobox", { name: "Lọc theo Trạng thái" }), "Đã duyệt");
    expect(screen.getByRole("button", { name: "Bộ lọc (1)" })).toBeInTheDocument();
    await expectNoA11yViolations(document.body);
  });

  it("ô lọc chữ: chứa chuỗi, không phân biệt dấu", async () => {
    setupVn();
    await openFilters();
    await userEvent.type(screen.getByRole("searchbox", { name: "Lọc theo Đối tác" }), "hung thinh");
    expect(vnCodes()).toEqual(["HS-004"]);
  });

  it("ô lọc chọn: lấy các giá trị khác nhau của cột, lọc đúng bằng", async () => {
    setupVn();
    await openFilters();
    const select = screen.getByRole("combobox", { name: "Lọc theo Trạng thái" });
    await userEvent.click(select);
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Tất cả", "Chờ duyệt", "Đã duyệt", "Nháp"]);
    await userEvent.click(screen.getByRole("option", { name: "Đã duyệt" }));
    expect(vnCodes()).toEqual(["HS-001", "HS-003"]);
    expect(select).toHaveTextContent("Đã duyệt");
    await chooseOption(select, "Tất cả");
    expect(vnCodes()).toHaveLength(4);
  });

  it("ô lọc chọn dùng filterOptions truyền vào (nhãn khác giá trị)", async () => {
    const columns = vcol.columns([
      vcol.accessor("code", { header: "Mã hồ sơ" }),
      vcol.accessor("status", {
        header: "Trạng thái",
        meta: { filter: "select", filterOptions: [{ value: "Nháp", label: "Bản nháp" }] },
      }),
    ]);
    setupVn({ columns });
    await openFilters();
    await chooseOption(screen.getByRole("combobox", { name: "Lọc theo Trạng thái" }), "Bản nháp");
    expect(vnCodes()).toEqual(["HS-004"]);
  });

  it("kết hợp tìm kiếm + lọc cột; 'Xóa bộ lọc' trả lại đủ dòng và làm trống các ô", async () => {
    setupVn({ searchable: true });
    const search = screen.getByRole("searchbox", { name: "Tìm trong bảng" });
    await userEvent.type(search, "hai");
    await openFilters();
    await chooseOption(screen.getByRole("combobox", { name: "Lọc theo Trạng thái" }), "Chờ duyệt");
    expect(vnCodes()).toEqual(["HS-002"]);
    await userEvent.click(screen.getByRole("button", { name: "Xóa bộ lọc" }));
    expect(vnCodes()).toHaveLength(4);
    expect(search).toHaveValue("");
    if (!screen.queryByRole("dialog", { name: "Bộ lọc" })) await openFilters();
    expect(screen.getByRole("combobox", { name: "Lọc theo Trạng thái" })).toHaveTextContent("Tất cả");
    expect(screen.queryByRole("button", { name: "Xóa bộ lọc" })).not.toBeInTheDocument();
  });

  it("rỗng do lọc: trạng thái riêng có nút 'Xóa bộ lọc' (khác rỗng do không có dữ liệu)", async () => {
    setupVn({ searchable: true, emptyTitle: "Chưa có hồ sơ" });
    await userEvent.type(screen.getByRole("searchbox", { name: "Tìm trong bảng" }), "khong ton tai");
    expect(screen.getByText("Không có kết quả phù hợp")).toBeInTheDocument();
    expect(screen.queryByText("Chưa có hồ sơ")).not.toBeInTheDocument();
    await userEvent.click(within(vnTable()).getByRole("button", { name: "Xóa bộ lọc" }));
    expect(vnCodes()).toHaveLength(4);
  });

  it("lọc từ ngoài bảng (filtered) mà hết dòng → 'Không có kết quả phù hợp'; 'Xóa bộ lọc' gọi onClearFilters", async () => {
    const onClearFilters = vi.fn();
    const { rerender } = render(
      <DataTable aria-label="Hồ sơ khai báo" columns={COLUMNS} data={[]} getRowId={(r) => r.id} emptyTitle="Chưa có hồ sơ" filtered onClearFilters={onClearFilters} />,
    );
    expect(screen.getByText("Không có kết quả phù hợp")).toBeInTheDocument();
    expect(screen.queryByText("Chưa có hồ sơ")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Xóa bộ lọc" }));
    expect(onClearFilters).toHaveBeenCalledOnce();
    // Không lọc → vẫn là "chưa có dữ liệu"; lọc mà không có cách xóa → không hiện nút
    rerender(<DataTable aria-label="Hồ sơ khai báo" columns={COLUMNS} data={[]} getRowId={(r) => r.id} emptyTitle="Chưa có hồ sơ" />);
    expect(screen.getByText("Chưa có hồ sơ")).toBeInTheDocument();
    rerender(<DataTable aria-label="Hồ sơ khai báo" columns={COLUMNS} data={[]} getRowId={(r) => r.id} filtered />);
    expect(screen.getByText("Không có kết quả phù hợp")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Xóa bộ lọc" })).not.toBeInTheDocument();
  });

  it("phân trang theo số dòng đã lọc và quay về trang đầu khi đổi bộ lọc", async () => {
    const many: HoSoVn[] = Array.from({ length: 25 }, (_, i) => ({
      id: `r${i}`,
      code: `HS-${String(i + 1).padStart(3, "0")}`,
      partner: i % 2 ? "Đông Hải" : "Artemide",
      status: "Nháp",
      value: i,
    }));
    setupVn({ data: many, searchable: true, pagination: { initialPageSize: 10 } });
    await userEvent.click(screen.getByRole("button", { name: "Trang 2" }));
    await userEvent.type(screen.getByRole("searchbox", { name: "Tìm trong bảng" }), "dong");
    expect(screen.getByText("1–10 / 12")).toBeInTheDocument();
    expect(vnCodes()[0]).toBe("HS-002");
  });
});

describe("DataTable – ẩn/hiện cột", () => {
  it("menu 'Cột': bỏ tick ẩn cột, tick lại hiện cột; menu vẫn mở", async () => {
    setupVn({ columnToggle: true });
    await userEvent.click(screen.getByRole("button", { name: "Cột" }));
    const partner = screen.getByRole("menuitemcheckbox", { name: "Đối tác" });
    expect(partner).toHaveAttribute("aria-checked", "true");
    await userEvent.click(partner);
    expect(within(vnTable()).queryByRole("columnheader", { name: /Đối tác/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("searchbox", { name: "Lọc theo Đối tác" })).not.toBeInTheDocument();
    expect(screen.getByRole("menuitemcheckbox", { name: "Đối tác" })).toHaveAttribute("aria-checked", "false");
    await userEvent.click(screen.getByRole("menuitemcheckbox", { name: "Đối tác" }));
    expect(within(vnTable()).getByRole("columnheader", { name: /Đối tác/ })).toBeInTheDocument();
  });

  it("cột hideable=false không ẩn được (mục bị khóa); bàn phím mở menu được", async () => {
    setupVn({ columnToggle: true });
    screen.getByRole("button", { name: "Cột" }).focus();
    await userEvent.keyboard("{Enter}");
    const code = screen.getByRole("menuitemcheckbox", { name: "Mã hồ sơ" });
    expect(code).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(code);
    expect(within(vnTable()).getByRole("columnheader", { name: /Mã hồ sơ/ })).toBeInTheDocument();
  });

  it("điều khiển từ ngoài: columnVisibility + onColumnVisibilityChange", async () => {
    const onChange = vi.fn();
    function Controlled() {
      const [vis, setVis] = useState<Record<string, boolean>>({ status: false });
      return (
        <DataTable
          aria-label="Danh sách hồ sơ"
          columns={VN_COLUMNS}
          data={VN_DATA}
          getRowId={(r) => r.id}
          pagination={false}
          columnToggle
          columnVisibility={vis}
          onColumnVisibilityChange={(v) => {
            setVis(v);
            onChange(v);
          }}
        />
      );
    }
    render(<Controlled />);
    expect(within(vnTable()).queryByRole("columnheader", { name: /Trạng thái/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Cột" }));
    await userEvent.click(screen.getByRole("menuitemcheckbox", { name: "Trạng thái" }));
    expect(onChange).toHaveBeenLastCalledWith({ status: true });
    expect(within(vnTable()).getByRole("columnheader", { name: /Trạng thái/ })).toBeInTheDocument();
  });
});

describe("DataTable – đổi độ rộng cột", () => {
  const handle = () => screen.getByRole("separator", { name: "Đổi độ rộng cột Mã hồ sơ" });
  const header = () => within(vnTable()).getByRole("columnheader", { name: /Mã hồ sơ/ });

  it("tay kéo có role separator dọc, giá trị = độ rộng hiện tại; bảng table-layout fixed", () => {
    setupVn({ resizable: true });
    expect(handle()).toHaveAttribute("aria-orientation", "vertical");
    expect(handle()).toHaveAttribute("aria-valuenow", "160");
    expect(handle()).toHaveAttribute("aria-valuemin", "120");
    expect(handle()).toHaveAttribute("aria-valuemax", "300");
    expect(header()).toHaveStyle({ width: "160px" });
    expect(vnTable()).toHaveClass("table-fixed");
  });

  it("mũi tên phải/trái đổi độ rộng, không vượt min/max", async () => {
    setupVn({ resizable: true });
    handle().focus();
    await userEvent.keyboard("{ArrowRight}{ArrowRight}");
    expect(handle()).toHaveAttribute("aria-valuenow", "180");
    expect(header()).toHaveStyle({ width: "180px" });
    await userEvent.keyboard("{ArrowLeft}{ArrowLeft}{ArrowLeft}{ArrowLeft}{ArrowLeft}{ArrowLeft}{ArrowLeft}");
    expect(handle()).toHaveAttribute("aria-valuenow", "120");
    await userEvent.keyboard("{Shift>}{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}{/Shift}");
    expect(handle()).toHaveAttribute("aria-valuenow", "300");
  });

  it("nhấp đúp tay kéo trả về độ rộng mặc định; không kích hoạt sắp xếp", async () => {
    setupVn({ resizable: true });
    handle().focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(handle()).toHaveAttribute("aria-valuenow", "170");
    await userEvent.dblClick(handle());
    expect(handle()).toHaveAttribute("aria-valuenow", "160");
    expect(header()).toHaveAttribute("aria-sort", "none");
  });

  it("kéo chuột đổi độ rộng", () => {
    // jsdom 26 chưa có PointerEvent → dựng tạm từ MouseEvent để có clientX/button
    if (!("PointerEvent" in window)) {
      class PointerEventPolyfill extends MouseEvent {
        pointerId: number;
        constructor(type: string, init: PointerEventInit = {}) {
          super(type, init);
          this.pointerId = init.pointerId ?? 0;
        }
      }
      vi.stubGlobal("PointerEvent", PointerEventPolyfill);
    }
    setupVn({ resizable: true });
    fireEvent.pointerDown(handle(), { button: 0, clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(handle(), { clientX: 140, pointerId: 1 });
    fireEvent.pointerUp(handle(), { clientX: 140, pointerId: 1 });
    expect(handle()).toHaveAttribute("aria-valuenow", "200");
    fireEvent.pointerMove(handle(), { clientX: 400, pointerId: 1 });
    expect(handle()).toHaveAttribute("aria-valuenow", "200");
    vi.unstubAllGlobals();
  });

  it("điều khiển từ ngoài: columnSizing + onColumnSizingChange", async () => {
    const onChange = vi.fn();
    setupVn({ resizable: true, columnSizing: { code: 200 }, onColumnSizingChange: onChange });
    expect(handle()).toHaveAttribute("aria-valuenow", "200");
    handle().focus();
    await userEvent.keyboard("{ArrowLeft}");
    expect(onChange).toHaveBeenLastCalledWith({ code: 190 });
  });
});

describe("DataTable – tính năng mở rộng: tiếng Anh & a11y", () => {
  it("tiếng Anh: nhãn thanh công cụ, ô lọc, tay kéo, rỗng do lọc", async () => {
    render(
      <UiLocaleProvider locale="en">
        <DataTable aria-label="Files" columns={VN_COLUMNS} data={VN_DATA} getRowId={(r) => r.id} pagination={false} searchable columnToggle resizable />
      </UiLocaleProvider>,
    );
    expect(screen.getByRole("button", { name: "Columns" })).toBeInTheDocument();
    expect(screen.getByRole("separator", { name: "Resize column Đối tác" })).toBeInTheDocument();
    await openFilters(/^Filters/);
    expect(screen.getByRole("combobox", { name: "Filter by Trạng thái" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await userEvent.type(screen.getByRole("searchbox", { name: "Search table" }), "artemide");
    expect(screen.getByRole("status")).toHaveTextContent("Showing 1 of 4 rows");
    await userEvent.type(screen.getByRole("searchbox", { name: "Search table" }), "xyz");
    expect(screen.getByText("No matching results")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Clear filters" })).toHaveLength(2);
  });

  it("không vi phạm a11y khi bật đủ tìm kiếm + lọc + ẩn cột + đổi độ rộng", async () => {
    const { container } = setupVn({
      searchable: true,
      columnToggle: true,
      resizable: true,
      selectable: true,
      rowLabel: (r) => r.code,
      pagination: { initialPageSize: 10 },
    });
    await userEvent.type(screen.getByRole("searchbox", { name: "Tìm trong bảng" }), "hai");
    await expectNoA11yViolations(container);
  });
});

describe("DataTable – dạng thẻ", () => {
  const FILTER_COLUMNS = col.columns([
    col.accessor("code", { header: "Mã hồ sơ" }),
    col.accessor("partner", { header: "Đối tác", meta: { filter: "select" } }),
    col.accessor("value", { header: "Trị giá" }),
  ]);
  const card = (r: HoSo, parts: { select: React.ReactNode; actions: React.ReactNode }) => (
    <RecordCard title={r.code} subtitle={r.partner} select={parts.select} actions={parts.actions} fields={[{ label: "Trị giá", value: r.value }]} />
  );
  const cardTitles = () => within(screen.getByRole("list", { name: "Hồ sơ khai báo" })).getAllByRole("listitem").map((li) => li.querySelector("[data-slot=record-card] .font-semibold")!.textContent);

  it("không có renderCard → không có nút chuyển kiểu hiển thị", () => {
    setup();
    expect(screen.queryByRole("radio", { name: /Thẻ/ })).toBeNull();
  });

  it("chuyển Bảng ↔ Thẻ; thẻ dùng chung tìm kiếm, phân trang; không vi phạm a11y", async () => {
    const { container } = setup({ renderCard: card, searchable: true, pagination: { initialPageSize: 2 } });
    expect(screen.getByRole("table")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: /Thẻ/ }));
    expect(screen.queryByRole("table")).toBeNull();
    expect(cardTitles()).toHaveLength(2);
    expect(screen.getByRole("navigation")).toBeInTheDocument();
    await userEvent.type(screen.getByRole("searchbox", { name: "Tìm trong bảng" }), "slamp");
    expect(cardTitles()).toEqual(["HS-003"]);
    await expectNoA11yViolations(container);
    await userEvent.click(screen.getByRole("radio", { name: /Bảng/ }));
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it("dạng thẻ: sắp xếp bằng chọn cột + đổi chiều; ô lọc theo cột thu gọn sau nút Bộ lọc (đếm bộ lọc đang bật)", async () => {
    render(<DataTable aria-label="Hồ sơ khai báo" columns={FILTER_COLUMNS} data={DATA} getRowId={(r) => r.id} renderCard={card} defaultView="cards" pagination={false} />);
    expect(cardTitles()).toEqual(["HS-002", "HS-001", "HS-003"]);
    await chooseOption(screen.getByRole("combobox", { name: "Sắp xếp theo" }), "Mã hồ sơ");
    expect(cardTitles()).toEqual(["HS-001", "HS-002", "HS-003"]);
    await userEvent.click(screen.getByRole("button", { name: /Đổi chiều sắp xếp/ }));
    expect(cardTitles()).toEqual(["HS-003", "HS-002", "HS-001"]);
    expect(screen.queryByRole("combobox", { name: "Lọc theo Đối tác" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Bộ lọc" }));
    await chooseOption(screen.getByRole("combobox", { name: "Lọc theo Đối tác" }), "Artemide");
    expect(cardTitles()).toEqual(["HS-001"]);
    expect(screen.getByRole("button", { name: "Bộ lọc (1)" })).toHaveAttribute("aria-expanded", "true");
  });

  it("dạng thẻ: bấm / Enter trên thẻ gọi onRowClick; ô chọn và thao tác không kích hoạt thẻ", async () => {
    const onRowClick = vi.fn();
    const onSelectionChange = vi.fn();
    setup({
      renderCard: card, defaultView: "cards", pagination: false, selectable: true, onRowClick, onSelectionChange,
      rowLabel: (r) => r.code, rowActions: (r) => <button type="button">Mở {r.code}</button>,
    });
    await userEvent.click(screen.getByText("Korea Bearing"));
    expect(onRowClick).toHaveBeenCalledWith(DATA[0]);
    screen.getByRole("listitem", { name: "HS-001" }).focus();
    await userEvent.keyboard("{Enter}");
    expect(onRowClick).toHaveBeenLastCalledWith(DATA[1]);
    await userEvent.click(screen.getByRole("checkbox", { name: "Chọn dòng HS-003" }));
    expect(onSelectionChange).toHaveBeenLastCalledWith(["c"]);
    expect(screen.getByRole("listitem", { name: "HS-003" })).toHaveAttribute("data-selected");
    await userEvent.click(screen.getByRole("button", { name: "Mở HS-002" }));
    expect(onRowClick).toHaveBeenCalledTimes(2);
  });

  it("nhớ kiểu hiển thị theo viewStorageKey", async () => {
    window.localStorage.removeItem("kb-table-view:test");
    const { unmount } = setup({ renderCard: card, viewStorageKey: "test" });
    await userEvent.click(screen.getByRole("radio", { name: /Thẻ/ }));
    expect(window.localStorage.getItem("kb-table-view:test")).toBe("cards");
    unmount();
    setup({ renderCard: card, viewStorageKey: "test" });
    expect(await screen.findByRole("list", { name: "Hồ sơ khai báo" })).toBeInTheDocument();
    window.localStorage.removeItem("kb-table-view:test");
  });

  it("dạng thẻ: rỗng → trạng thái trống; đang tải → khung xương", () => {
    const { rerender } = setup({ renderCard: card, defaultView: "cards", data: [], emptyTitle: "Chưa có hồ sơ" });
    expect(screen.getByText("Chưa có hồ sơ")).toBeInTheDocument();
    rerender(<DataTable aria-label="Hồ sơ khai báo" columns={COLUMNS} data={[]} getRowId={(r) => r.id} renderCard={card} defaultView="cards" loading />);
    expect(screen.getByRole("list", { name: "Hồ sơ khai báo" })).toHaveAttribute("aria-busy", "true");
  });

  it("nhãn tiếng Anh", () => {
    render(
      <UiLocaleProvider locale="en">
        <DataTable aria-label="Dossiers" columns={COLUMNS} data={DATA} getRowId={(r) => r.id} renderCard={card} />
      </UiLocaleProvider>,
    );
    expect(screen.getByRole("radio", { name: /Cards/ })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Table/ })).toBeInTheDocument();
  });
});
