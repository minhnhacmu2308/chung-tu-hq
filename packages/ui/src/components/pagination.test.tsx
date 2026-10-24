import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../test/a11y.js";
import { UiLocaleProvider } from "../lib/i18n.js";
import { getPageItems, Pagination } from "./pagination.js";
import { chooseOption } from "../../test/select.js";

describe("getPageItems", () => {
  it("ít trang: hiện hết, không có dấu …", () => {
    expect(getPageItems(0, 5)).toEqual([0, 1, 2, 3, 4]);
  });

  it.each([
    [0, [0, 1, 2, 3, 4, "ellipsis-end", 9]],
    [5, [0, "ellipsis-start", 4, 5, 6, "ellipsis-end", 9]],
    [9, [0, "ellipsis-start", 5, 6, 7, 8, 9]],
  ] as const)("nhiều trang, trang %i: luôn có đầu, cuối, lân cận và số nút cố định", (current, expected) => {
    expect(getPageItems(current, 10)).toEqual(expected);
  });

  it("0 trang vẫn trả về trang đầu", () => {
    expect(getPageItems(0, 0)).toEqual([0]);
  });
});

describe("Pagination", () => {
  it("hiển thị khoảng dòng theo locale vi và trang hiện tại có aria-current", () => {
    render(<Pagination pageIndex={1} pageSize={20} rowCount={1350} onPageChange={() => {}} />);
    const nav = screen.getByRole("navigation", { name: "Phân trang" });
    expect(within(nav).getByText("21–40 / 1.350")).toBeInTheDocument();
    expect(within(nav).getByRole("button", { name: "Trang 2" })).toHaveAttribute("aria-current", "page");
  });

  it("trang đầu: khóa nút trước; bấm trang/sau gọi onPageChange", async () => {
    const onPageChange = vi.fn();
    render(<Pagination pageIndex={0} pageSize={10} rowCount={95} onPageChange={onPageChange} />);
    expect(screen.getByRole("button", { name: "Trang trước" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Trang sau" }));
    await userEvent.click(screen.getByRole("button", { name: "Trang 10" }));
    expect(onPageChange.mock.calls).toEqual([[1], [9]]);
  });

  it("trang cuối: khóa nút sau; dấu … không đọc bởi trình đọc màn hình", () => {
    render(<Pagination pageIndex={9} pageSize={10} rowCount={95} onPageChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Trang sau" })).toBeDisabled();
    expect(screen.getByText("…").closest("li")).toHaveAttribute("aria-hidden", "true");
  });

  it("dùng bàn phím: Tab tới nút trang rồi Enter", async () => {
    const onPageChange = vi.fn();
    render(<Pagination pageIndex={0} pageSize={10} rowCount={30} onPageChange={onPageChange} />);
    screen.getByRole("button", { name: "Trang 3" }).focus();
    await userEvent.keyboard("{Enter}");
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it("chọn số dòng mỗi trang", async () => {
    const onPageSizeChange = vi.fn();
    render(<Pagination pageIndex={0} pageSize={20} rowCount={300} onPageChange={() => {}} onPageSizeChange={onPageSizeChange} />);
    await chooseOption(screen.getByRole("combobox", { name: "Số dòng mỗi trang" }), "50 / trang");
    expect(onPageSizeChange).toHaveBeenCalledWith(50);
  });

  it("không có dữ liệu: hiện 0–0 / 0, không lỗi", () => {
    render(<Pagination pageIndex={0} pageSize={20} rowCount={0} onPageChange={() => {}} />);
    expect(screen.getByText("0–0 / 0")).toBeInTheDocument();
  });

  it("tiếng Anh: nhãn và định dạng số en-US", () => {
    render(
      <UiLocaleProvider locale="en">
        <Pagination pageIndex={0} pageSize={20} rowCount={1350} onPageChange={() => {}} onPageSizeChange={() => {}} />
      </UiLocaleProvider>,
    );
    expect(screen.getByRole("navigation", { name: "Pagination" })).toBeInTheDocument();
    expect(screen.getByText("1–20 / 1,350")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next page" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Rows per page" })).toBeInTheDocument();
  });

  it("không vi phạm a11y", async () => {
    const { container } = render(<Pagination pageIndex={4} pageSize={10} rowCount={200} onPageChange={() => {}} onPageSizeChange={() => {}} />);
    await expectNoA11yViolations(container);
  });
});

describe("Pagination – số dòng mỗi trang", () => {
  it("giá trị hiện tại không nằm trong danh sách vẫn được hiển thị đúng", async () => {
    const { Pagination } = await import("./pagination.js");
    render(<Pagination pageIndex={0} pageSize={8} rowCount={37} onPageChange={() => {}} onPageSizeChange={() => {}} />);
    expect(screen.getByRole("combobox")).toHaveTextContent("8 / trang");
  });
});
