import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../test/a11y.js";
import { createRef } from "react";
import { UiLocaleProvider } from "../lib/i18n.js";
import { PaperColumns, PaperField, PaperLabel, PaperSheet, PaperStack, type PaperFieldState } from "./paper.js";
import { Tooltip } from "./tooltip.js";

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

  it("PaperSheet là container 'paper'; PaperColumns hai cột theo bề rộng trang và khi in", () => {
    render(<PaperSheet page={1} total={1}><PaperColumns><span>trái</span><span>phải</span></PaperColumns></PaperSheet>);
    expect(screen.getByRole("region", { name: "Trang 1 / 1" })).toHaveClass("@container/paper");
    const cols = screen.getByText("trái").parentElement!;
    expect(cols).toHaveClass("col-span-12", "grid-cols-1", "paper-wide:grid-cols-2", "print:grid-cols-2");
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
    const btn = screen.getByRole("button", { name: /Chọn ô Mã loại hình/ });
    await userEvent.click(btn);
    expect(onSelect).toHaveBeenCalledTimes(1);
    btn.focus();
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard(" ");
    expect(onSelect).toHaveBeenCalledTimes(3);
  });

  it("tên của nút gồm tên ô, giá trị và trạng thái (không bị aria-label che)", () => {
    render(<PaperField label="Mã loại hình" value="A11" ariaLabel="Mã loại hình" state="missing" compareTo="B22" onSelect={() => {}} />);
    const btn = screen.getByRole("button");
    expect(btn).not.toHaveAttribute("aria-label");
    const name = btn.textContent ?? "";
    expect(name).toContain("A11");
    expect(name).toContain("Còn thiếu");
    expect(screen.getByRole("button", { name: /Mã loại hình.*A11.*Còn thiếu/ })).toBeInTheDocument();
  });

  it("selected => aria-pressed=true", () => {
    const { rerender } = render(<PaperField label="a" value="b" ariaLabel="ô" onSelect={() => {}} selected />);
    expect(screen.getByRole("button", { name: /^ô/ })).toHaveAttribute("aria-pressed", "true");
    rerender(<PaperField label="a" value="b" ariaLabel="ô" onSelect={() => {}} />);
    expect(screen.getByRole("button", { name: /^ô/ })).toHaveAttribute("aria-pressed", "false");
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

  it("compareTo: tên trợ năng có tiền tố 'ước tính' (EN: 'estimate')", () => {
    const { rerender } = render(<PaperField label="a" value="900" ariaLabel="Trị giá" compareTo="886" onSelect={() => {}} />);
    expect(screen.getByRole("button", { name: /Trị giá.*900.*ước tính 886/ })).toBeInTheDocument();
    expect(screen.getByText("ước tính")).toHaveClass("sr-only");
    rerender(<UiLocaleProvider locale="en"><PaperField label="a" value="900" ariaLabel="Value" compareTo="886" onSelect={() => {}} /></UiLocaleProvider>);
    expect(screen.getByRole("button", { name: /Value.*900.*estimate 886/ })).toBeInTheDocument();
  });

  it("ref trỏ tới phần tử gốc (button / div); thuộc tính DOM khác được truyền xuống", () => {
    const btnRef = createRef<HTMLElement>();
    const { rerender } = render(<PaperField ref={btnRef} label="a" value="b" ariaLabel="ô" onSelect={() => {}} data-x="1" aria-describedby="mo-ta" />);
    expect(btnRef.current).toBe(screen.getByRole("button"));
    expect(btnRef.current).toHaveAttribute("data-x", "1");
    expect(btnRef.current).toHaveAttribute("aria-describedby", "mo-ta");
    const divRef = createRef<HTMLElement>();
    rerender(<PaperField ref={divRef} label="a" value="b" ariaLabel="ô" />);
    expect(divRef.current?.tagName).toBe("DIV");
  });

  it("onClick của nơi gọi (vd Tooltip) chạy cùng onSelect; làm đích Tooltip asChild được", async () => {
    const onSelect = vi.fn();
    const onClick = vi.fn();
    render(<PaperField label="a" value="b" ariaLabel="ô" onSelect={onSelect} onClick={onClick} />);
    await userEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("Tooltip asChild: focus ô thì hiện gợi ý", async () => {
    render(<Tooltip content="1.6 · Mã phương thức" delay={0}><PaperField label="a" value="2" ariaLabel="ô" onSelect={() => {}} /></Tooltip>);
    await userEvent.tab();
    expect(screen.getByRole("button")).toHaveFocus();
    expect(await screen.findByRole("tooltip")).toHaveTextContent("1.6 · Mã phương thức");
  });

  it("align end: căn phải giá trị", () => {
    render(<PaperField label="a" value="1.000" ariaLabel="ô" align="end" />);
    expect(screen.getByText("1.000").parentElement).toHaveClass("justify-end", "text-right");
  });

  it("span áp lưới 12 cột", () => {
    const { container } = render(<PaperField label="a" value="b" ariaLabel="x" span={6} />);
    expect(container.firstElementChild).toHaveClass("col-span-6");
  });

  it("compact: bản đủ chỉ hiện trên trang giấy rộng, bản ngắn trên trang hẹp; in luôn bản ngắn (data-paper-*)", () => {
    render(<PaperField label="Mã loại hình" value="E21 · Nhập nguyên liệu" compact="E21" ariaLabel="ô" />);
    const full = screen.getByText("E21 · Nhập nguyên liệu");
    const short = screen.getByText("E21");
    expect(full).toHaveAttribute("data-paper-full");
    expect(full).toHaveClass("hidden", "paper-wide:inline");
    expect(short).toHaveAttribute("data-paper-compact");
    expect(short).toHaveClass("paper-wide:hidden");
  });

  it("không có compact → không có bản ngắn", () => {
    const { container } = render(<PaperField label="a" value="b" ariaLabel="ô" />);
    expect(container.querySelector("[data-paper-compact], [data-paper-full]")).toBeNull();
  });

  it("keepTogether: chỉ xuống dòng sau dấu phân cách (<wbr>), không bẻ giữa cụm, không cắt bớt", () => {
    const { container, rerender } = render(<PaperField label="Ngày" value="18/10/2026" ariaLabel="ô" keepTogether />);
    const date = screen.getByText("18/10/2026");
    expect(date).toHaveTextContent("18/10/2026");
    expect(date.querySelectorAll("wbr")).toHaveLength(2);
    expect(date).toHaveClass("break-normal");
    expect(date).not.toHaveClass("break-words", "whitespace-nowrap", "text-ellipsis", "overflow-hidden");

    rerender(<PaperField label="Giờ" value="00:02:17" ariaLabel="ô" keepTogether />);
    expect(screen.getByText("00:02:17").querySelectorAll("wbr")).toHaveLength(2);

    // Số tờ khai 12 số: không có điểm ngắt nào bên trong – cả cụm xuống dòng (nếu cần), không bị tách.
    rerender(<PaperField label="Số tờ khai" value="107621548840" ariaLabel="ô" keepTogether />);
    const id = screen.getByText("107621548840");
    expect(id.querySelectorAll("wbr")).toHaveLength(0);
    expect(id).toHaveClass("break-normal");

    // Có bản ngắn: cả hai bản đều được chèn điểm ngắt.
    rerender(<PaperField label="Mã" value="A-1 · Tên" compact="A-1" ariaLabel="ô" keepTogether />);
    expect(container.querySelector("[data-paper-compact]")!.querySelectorAll("wbr")).toHaveLength(1);

    rerender(<PaperField label="Ngày" value="18/10/2026" ariaLabel="ô" />);
    expect(screen.getByText("18/10/2026")).toHaveClass("break-words");
    expect(screen.getByText("18/10/2026").querySelectorAll("wbr")).toHaveLength(0);
  });

  it("PaperLabel: nhãn cột nhóm lặp, aria-hidden, theo lưới", () => {
    const { container } = render(<PaperLabel span={4} align="end">Tổng tiền thuế</PaperLabel>);
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
    expect(container.firstElementChild).toHaveClass("col-span-4", "text-right");
  });

  it.each<PaperFieldState>(["none", "error", "missing", "estimate", "edited"])("axe không vi phạm: %s (có và không onSelect)", async (state) => {
    const { container } = render(
      <div>
        <PaperField label="Nhãn" value="Giá trị" ariaLabel="Ô một" state={state} compareTo="1" />
        <PaperField label="Nhãn 2" value="Giá trị" ariaLabel="Ô hai" state={state} onSelect={() => {}} selected align="end" />
      </div>,
    );
    await expectNoA11yViolations(container);
  });
});
