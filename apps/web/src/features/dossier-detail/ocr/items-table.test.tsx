// @vitest-environment jsdom
// Danh sách hàng hóa ở bước đọc chứng từ: bảng chung (tìm, lọc "Cần kiểm tra", xác nhận nhiều dòng), mô tả không bị cắt,
// Enter lưu và xuống ô cùng cột ở dòng dưới.
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations, renderWithProviders } from "@/test/dom";
import type { ExtractedField } from "@/mocks/types";
import { isMissingOrigin, ItemsTable } from "./items-table";

const cell = (n: number, c: string, value: string, status = "CROSS_CHECKED") =>
  ({ id: `f_${n}_${c}`, documentId: "doc_1", group: "ITEMS", key: `item.${n}.${c}`, label: `${c} ${n}`, value, originalValue: value, status }) as ExtractedField;

function line(n: number, desc: string, suspect = false) {
  return [
    cell(n, "description", desc),
    cell(n, "quantity", String(n * 10)),
    cell(n, "unit", "PCE"),
    cell(n, "unit_price", "1.50"),
    cell(n, "amount", `${n * 15}.00`, suspect ? "CONFLICT" : "CROSS_CHECKED"),
    cell(n, "origin", "CN"),
  ];
}

// 30 dòng, dòng 3 và 7 cần kiểm tra.
const FIELDS = Array.from({ length: 30 }, (_, i) => line(i + 1, i === 0 ? "Double-side LCD fold-out display module for kiosk" : `Hàng ${i + 1}`, i === 2 || i === 6)).flat();

function setup() {
  const props = { onActivate: vi.fn(), onSave: vi.fn(), onConfirm: vi.fn() };
  const r = renderWithProviders(<ItemsTable fields={FIELDS} activeId={null} {...props} />);
  return { ...props, ...r };
}
const table = () => screen.getByRole("table", { name: "Danh sách hàng hóa" });
const rows = () => within(table()).getAllByRole("row").slice(1);

describe("ItemsTable", () => {
  it("phân trang 20 dòng/trang, mô tả là ô nhiều dòng giữ nguyên chữ, dòng cần kiểm tra tô vàng, tổng tiền cộng cả 30 dòng", async () => {
    const { container } = setup();
    expect(rows()).toHaveLength(20);
    const desc = screen.getByRole("textbox", { name: "description 1" });
    expect(desc.tagName).toBe("TEXTAREA");
    expect((desc as HTMLTextAreaElement).value).toBe("Double-side LCD fold-out display module for kiosk");
    expect(rows()[2]!.getAttribute("data-tone")).toBe("warning");
    expect(rows()[0]!.hasAttribute("data-tone")).toBe(false);
    // 15 × (1 + … + 30) = 6975
    expect(screen.getByText("Cộng 30 dòng").parentElement!.textContent).toMatch(/6\.975,00/);
    await expectNoA11yViolations(container);
  }, 30_000); // dựng 30 dòng × nhiều ô – máy bận (chạy cả bộ) vượt 5 giây mặc định

  it("activeId ở dòng trang sau (bấm vị trí trên chứng từ) → tự sang trang chứa dòng đó", () => {
    const props = { onActivate: vi.fn(), onSave: vi.fn(), onConfirm: vi.fn() };
    const { rerender } = renderWithProviders(<ItemsTable fields={FIELDS} activeId={null} {...props} />);
    expect(screen.queryByRole("textbox", { name: "quantity 25" })).toBeNull();
    rerender(<ItemsTable fields={FIELDS} activeId="f_25_amount" {...props} />);
    expect(screen.getByRole("textbox", { name: "quantity 25" }).closest("tr")!.getAttribute("data-tone")).toBe("active");
  });

  it("lọc nhanh 'Cần kiểm tra' và tìm kiếm", async () => {
    setup();
    await userEvent.click(screen.getByRole("radio", { name: "Cần kiểm tra (2)" }));
    expect(rows()).toHaveLength(2);
    await userEvent.click(screen.getByRole("radio", { name: "Tất cả (30)" }));
    await userEvent.type(screen.getByRole("searchbox"), "LCD");
    expect(rows()).toHaveLength(1);
  });

  it("chọn nhiều dòng → 'Xác nhận n dòng đúng' xác nhận mọi ô cần kiểm tra của các dòng đó", async () => {
    const { onConfirm } = setup();
    await userEvent.click(screen.getByRole("checkbox", { name: "Chọn dòng Dòng 3" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Chọn dòng Dòng 7" }));
    await userEvent.click(screen.getByRole("button", { name: "Xác nhận 2 dòng đúng" }));
    expect(onConfirm.mock.calls.map((c) => c[0])).toEqual(["f_3_amount", "f_7_amount"]);
  });

  it("sửa ô + Enter → lưu và focus ô cùng cột ở dòng dưới", async () => {
    const { onSave } = setup();
    const qty = screen.getByRole("textbox", { name: "quantity 1" });
    await userEvent.clear(qty);
    await userEvent.type(qty, "65{Enter}");
    expect(onSave).toHaveBeenCalledWith("f_1_quantity", "65");
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "quantity 2" }));
  });

  it("xuất xứ: ô chọn nước; dòng hóa đơn không ghi xuất xứ → ô trống báo lỗi, dòng tô vàng; chọn nước → lưu mã", async () => {
    const fields = [...line(1, "Frozen fish").filter((f) => f.key !== "item.1.origin"), cell(1, "origin", ""), ...line(2, "Squid")];
    const onSave = vi.fn();
    const { container } = renderWithProviders(<ItemsTable fields={fields} activeId={null} onActivate={vi.fn()} onSave={onSave} onConfirm={vi.fn()} />);
    const empty = screen.getByRole("combobox", { name: "origin 1" });
    expect(empty.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByRole("combobox", { name: "origin 2" }).getAttribute("aria-invalid")).not.toBe("true");
    expect(rows()[0]!.getAttribute("data-tone")).toBe("warning");
    expect(isMissingOrigin(fields.find((f) => f.key === "item.1.origin")!)).toBe(true);
    await userEvent.click(empty);
    await userEvent.keyboard("VN");
    await userEvent.click(await screen.findByRole("option", { name: /^VN – / }, { timeout: 5000 }));
    expect(onSave).toHaveBeenCalledWith("f_1_origin", "VN");
    await expectNoA11yViolations(container);
  });

  it("gộp dòng: có dòng giống nhau → đề xuất 'Gộp dòng' (bấm → bật cờ); đã gộp → 'Tách lại'; không có merge → không hiện", async () => {
    const fields = [...line(1, "Frozen fish"), ...line(2, "Squid"), ...line(3, "frozen  FISH")];
    const onChange = vi.fn();
    const { unmount } = renderWithProviders(<ItemsTable fields={fields} activeId={null} onActivate={vi.fn()} onSave={vi.fn()} onConfirm={vi.fn()} merge={{ merged: false, busy: false, onChange }} />);
    expect(screen.getByText("Có 1 nhóm dòng hàng giống nhau – gộp mỗi nhóm thành 1 dòng?")).toBeTruthy();
    expect(screen.getByText("Dòng 1, 3")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Gộp dòng" }));
    expect(onChange).toHaveBeenCalledWith(true);
    unmount();
    const r2 = renderWithProviders(<ItemsTable fields={fields} activeId={null} onActivate={vi.fn()} onSave={vi.fn()} onConfirm={vi.fn()} merge={{ merged: true, busy: false, onChange }} />);
    await userEvent.click(screen.getByRole("button", { name: "Tách lại" }));
    expect(onChange).toHaveBeenLastCalledWith(false);
    r2.unmount();
    renderWithProviders(<ItemsTable fields={fields} activeId={null} onActivate={vi.fn()} onSave={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Gộp dòng" })).toBeNull();
  });
});

