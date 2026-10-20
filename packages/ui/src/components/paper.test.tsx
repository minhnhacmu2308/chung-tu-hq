import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../test/a11y.js";
import { UiLocaleProvider } from "../lib/i18n.js";
import { PaperField, PaperSheet, PaperStack, type PaperFieldState } from "./paper.js";

describe("PaperStack / PaperSheet", () => {
  it("PaperStack là gốc in (data-print-root)", () => {
    const { container } = render(<PaperStack>nội dung</PaperStack>);
    expect(container.firstElementChild).toHaveAttribute("data-print-root");
  });

  it("PaperSheet là vùng có tên 'Trang 2 / 4'", async () => {
    const { container } = render(<PaperSheet page={2} total={4}>nội dung</PaperSheet>);
    const region = screen.getByRole("region", { name: "Trang 2 / 4" });
    expect(region).toHaveAttribute("data-paper-sheet");
    await expectNoA11yViolations(container);
  });

  it("tên trang theo EN và theo labels", () => {
    const { rerender } = render(<UiLocaleProvider locale="en"><PaperSheet page={1} total={3}>x</PaperSheet></UiLocaleProvider>);
    expect(screen.getByRole("region", { name: "Page 1 / 3" })).toBeInTheDocument();
    rerender(<PaperSheet page={1} total={3} labels={{ page: "P.{n}/{total}" }}>x</PaperSheet>);
    expect(screen.getByRole("region", { name: "P.1/3" })).toBeInTheDocument();
  });

  it("watermark hiện và aria-hidden; null thì không có", () => {
    const { rerender } = render(<PaperSheet page={1} total={1} watermark="BẢN NHÁP">x</PaperSheet>);
    expect(screen.getByText("BẢN NHÁP")).toHaveAttribute("aria-hidden", "true");
    rerender(<PaperSheet page={1} total={1} watermark={null}>x</PaperSheet>);
    expect(screen.queryByText("BẢN NHÁP")).not.toBeInTheDocument();
  });

  it("header và id được render", () => {
    render(<PaperSheet page={1} total={1} id="trang-1" header={<h2>Tờ khai</h2>}>x</PaperSheet>);
    expect(screen.getByRole("heading", { name: "Tờ khai" })).toBeInTheDocument();
    expect(document.getElementById("trang-1")).toBeInTheDocument();
  });
});

describe("PaperField", () => {
  it("không có onSelect: không có nút", async () => {
    const { container } = render(<PaperField label="Mã loại hình" value="A11" ariaLabel="Mã loại hình: A11" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("A11")).toBeInTheDocument();
    expect(screen.getByText("Mã loại hình")).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it("có onSelect: là button đúng tên; chuột, Enter, Space đều chọn", async () => {
    const onSelect = vi.fn();
    render(<PaperField label="Mã loại hình" value="A11" ariaLabel="Chọn ô Mã loại hình" onSelect={onSelect} />);
    const btn = screen.getByRole("button", { name: "Chọn ô Mã loại hình" });
    await userEvent.click(btn);
    expect(onSelect).toHaveBeenCalledTimes(1);
    btn.focus();
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard(" ");
    expect(onSelect).toHaveBeenCalledTimes(3);
  });

  it("selected => aria-pressed=true", () => {
    const { rerender } = render(<PaperField label="a" value="b" ariaLabel="ô" onSelect={() => {}} selected />);
    expect(screen.getByRole("button", { name: "ô" })).toHaveAttribute("aria-pressed", "true");
    rerender(<PaperField label="a" value="b" ariaLabel="ô" onSelect={() => {}} />);
    expect(screen.getByRole("button", { name: "ô" })).toHaveAttribute("aria-pressed", "false");
  });

  it("missing: chữ 'Còn thiếu' (data-paper-mark)", () => {
    render(<PaperField label="a" value="" ariaLabel="ô" state="missing" />);
    expect(screen.getByText("Còn thiếu")).toHaveAttribute("data-paper-mark");
  });

  it("estimate: nhãn 'ƯT', giá trị in nghiêng", () => {
    render(<PaperField label="a" value="100" ariaLabel="ô" state="estimate" />);
    expect(screen.getByText("ƯT")).toHaveAttribute("data-paper-mark");
    expect(screen.getByText("100")).toHaveClass("italic");
  });

  it("error: biểu tượng có tên trợ năng 'Có lỗi'", () => {
    render(<PaperField label="a" value="1" ariaLabel="ô" state="error" />);
    expect(screen.getByRole("img", { name: "Có lỗi" })).toHaveAttribute("data-paper-mark");
  });

  it("edited: dấu sr-only 'Đã sửa'", () => {
    render(<PaperField label="a" value="1" ariaLabel="ô" state="edited" />);
    const mark = screen.getByText("Đã sửa");
    expect(mark).toHaveClass("sr-only");
    expect(mark.closest("[data-paper-mark]")).not.toBeNull();
  });

  it("compareTo: số cũ trong <s>", () => {
    render(<PaperField label="a" value="900" ariaLabel="ô" compareTo="886.187.500" />);
    const old = screen.getByText("886.187.500");
    expect(old.tagName).toBe("S");
    expect(old.closest("[data-paper-mark]")).not.toBeNull();
  });

  it("nhãn EN và labels ghi đè", () => {
    const { rerender } = render(<UiLocaleProvider locale="en"><PaperField label="a" value="" ariaLabel="x" state="missing" /></UiLocaleProvider>);
    expect(screen.getByText("Missing")).toBeInTheDocument();
    rerender(<PaperField label="a" value="" ariaLabel="x" state="missing" labels={{ missing: "Thiếu!" }} />);
    expect(screen.getByText("Thiếu!")).toBeInTheDocument();
  });

  it("span áp lưới 12 cột", () => {
    const { container } = render(<PaperField label="a" value="b" ariaLabel="x" span={6} />);
    expect(container.firstElementChild).toHaveClass("col-span-6");
  });

  it.each<PaperFieldState>(["none", "error", "missing", "estimate", "edited"])("axe không vi phạm: %s (có và không onSelect)", async (state) => {
    const { container } = render(
      <div>
        <PaperField label="Nhãn" value="Giá trị" ariaLabel="Ô một" state={state} compareTo="1" />
        <PaperField label="Nhãn 2" value="Giá trị" ariaLabel="Ô hai" state={state} onSelect={() => {}} selected />
      </div>,
    );
    await expectNoA11yViolations(container);
  });
});
