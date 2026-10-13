import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../test/a11y.js";
import { Loader, LoadingDots, LoadingOverlay, LoadingState, PageLoading, SkeletonCard, SkeletonForm, SkeletonList, SkeletonStats, SkeletonTable, SkeletonText } from "./loading.js";
import { RowActions, type RowAction } from "./row-actions.js";
import { TooltipProvider } from "./tooltip.js";

beforeAll(() => {
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
});

describe("RowActions", () => {
  const setup = (over: Partial<RowAction>[] = []) => {
    const open = vi.fn();
    const cancel = vi.fn();
    const actions: RowAction[] = [
      { id: "open", label: "Mở hồ sơ", icon: <svg />, onSelect: open, ...over[0] },
      { id: "cancel", label: "Hủy hồ sơ", icon: <svg />, tone: "danger", onSelect: cancel, ...over[1] },
    ];
    const utils = render(
      <TooltipProvider>
        <table><tbody><tr className="group"><td><RowActions rowLabel="HS-NK-021" actions={actions} /></td></tr></tbody></table>
      </TooltipProvider>,
    );
    return { open, cancel, ...utils };
  };

  it("icon thao tác nhanh có tên kèm tên dòng, bấm là chạy; chỉ hiện khi rê chuột/focus vào dòng", async () => {
    const { open, container } = setup();
    const quick = container.querySelector("[data-slot=quick-actions]")!;
    expect(quick).toHaveClass("opacity-0", "group-hover:opacity-100", "group-focus-within:opacity-100");
    await userEvent.click(screen.getByRole("button", { name: "Mở hồ sơ – HS-NK-021" }));
    expect(open).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it("nút … luôn có và chứa ĐỦ mọi thao tác (cho cảm ứng và bàn phím)", async () => {
    const { cancel } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Thao tác khác – HS-NK-021" }));
    const menu = await screen.findByRole("menu");
    expect(within(menu).getAllByRole("menuitem").map((i) => i.textContent)).toEqual(["Mở hồ sơ", "Hủy hồ sơ"]);
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Hủy hồ sơ" }));
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("thao tác bị khóa không bấm được; quick=false chỉ nằm trong menu", async () => {
    const { cancel } = setup([{ quick: false }, { disabled: true }]);
    expect(screen.queryByRole("button", { name: "Mở hồ sơ – HS-NK-021" })).not.toBeInTheDocument();
    const btn = screen.getByRole("button", { name: "Hủy hồ sơ – HS-NK-021" });
    expect(btn).toBeDisabled();
    await userEvent.click(btn);
    expect(cancel).not.toHaveBeenCalled();
  });
});

describe("Loading", () => {
  it("Loader và LoadingDots báo trạng thái cho trình đọc màn hình; label=null thì chỉ trang trí", () => {
    const { container } = render(<><Loader /><LoadingDots label="AI đang trả lời" /><Loader label={null} /></>);
    expect(screen.getAllByRole("status")).toHaveLength(2);
    expect(screen.getByText("Đang tải")).toHaveClass("sr-only");
    expect(screen.getByText("AI đang trả lời")).toBeInTheDocument();
    expect(container.querySelectorAll("[aria-hidden=true]").length).toBeGreaterThan(0);
  });

  it("LoadingState nói rõ đang làm gì", async () => {
    const { container } = render(<LoadingState title="Đang đọc chứng từ…" description="AI đang đọc 2/3 chứng từ." />);
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Đang đọc chứng từ…");
    expect(status).toHaveTextContent("AI đang đọc 2/3 chứng từ.");
    await expectNoA11yViolations(container);
  });

  it("LoadingOverlay: giữ nội dung cũ, chặn thao tác (inert) và báo aria-busy khi đang tải", () => {
    const { rerender, container } = render(<LoadingOverlay loading={false}><button>Lưu</button></LoadingOverlay>);
    expect(container.firstElementChild).not.toHaveAttribute("aria-busy");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    rerender(<LoadingOverlay loading label="Đang lưu…"><button>Lưu</button></LoadingOverlay>);
    expect(container.firstElementChild).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status")).toHaveTextContent("Đang lưu…");
    expect(screen.getByText("Lưu").closest("[inert]")).not.toBeNull();
  });

  it("khung tải dựng sẵn: đúng số dòng/ô, ẩn với trình đọc màn hình", () => {
    const { container } = render(
      <>
        <SkeletonText lines={4} />
        <SkeletonStats count={3} />
        <SkeletonCard />
        <SkeletonTable rows={5} cols={4} />
        <SkeletonForm fields={3} />
        <SkeletonList rows={2} />
      </>,
    );
    const [text, stats, , table, form, list] = container.children;
    expect(text!.children).toHaveLength(4);
    expect(stats!.children).toHaveLength(3);
    expect(table!.children).toHaveLength(6); // 1 tiêu đề + 5 dòng
    expect(table!.children[1]!.children).toHaveLength(4);
    expect(form!.children).toHaveLength(3);
    expect(list!.children).toHaveLength(2);
    for (const el of container.children) expect(el).toHaveAttribute("aria-hidden", "true");
  });

  it("PageLoading: một vùng trạng thái có tên, đổi dáng theo variant", async () => {
    const { container, rerender } = render(<PageLoading label="Đang tải hồ sơ" />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText("Đang tải hồ sơ")).toHaveClass("sr-only");
    const dashboard = container.innerHTML;
    rerender(<PageLoading variant="table" />);
    expect(container.innerHTML).not.toBe(dashboard);
    await expectNoA11yViolations(container);
  });
});
