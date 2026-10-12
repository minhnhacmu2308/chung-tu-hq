import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, afterEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../test/a11y.js";
import { UiLocaleProvider } from "../lib/i18n.js";
import { dismissToast, toast, Toaster } from "./toast.js";

afterEach(() => act(() => dismissToast()));

// jsdom thiếu API mà Radix dùng
beforeAll(() => {
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => {};
});

describe("Toast", () => {
  it("gọi toast() từ code ngoài React → hiện thông báo có tiêu đề và mô tả", () => {
    render(<Toaster />);
    act(() => {
      toast({ tone: "success", title: "Đã lưu hồ sơ", description: "HS-NK-2609-021" });
    });
    expect(screen.getByText("Đã lưu hồ sơ")).toBeInTheDocument();
    expect(screen.getByText("HS-NK-2609-021")).toBeInTheDocument();
  });

  it("danger đọc ngay (assertive), success lịch sự (polite)", () => {
    render(<Toaster />);
    act(() => {
      toast({ tone: "danger", title: "Truyền tờ khai lỗi" });
      toast({ tone: "success", title: "Đã lưu" });
    });
    const danger = screen.getByText("Truyền tờ khai lỗi").closest("[data-tone]")!;
    const success = screen.getByText("Đã lưu").closest("[data-tone]")!;
    expect(danger).toHaveAttribute("data-tone", "danger");
    // Radix gắn aria-live theo type: foreground → assertive, background → polite (trên vùng thông báo ẩn)
    expect(document.querySelector('[aria-live="assertive"]')).not.toBeNull();
    expect(success).toHaveAttribute("data-tone", "success");
  });

  it("nhiều toast xếp chồng; nút đóng có nhãn và đóng đúng toast", async () => {
    render(<Toaster />);
    act(() => {
      toast({ title: "Một" });
      toast({ title: "Hai" });
    });
    expect(screen.getAllByRole("button", { name: "Đóng thông báo" })).toHaveLength(2);
    const one = screen.getByText("Một").closest("li")!;
    await userEvent.click(within(one as HTMLElement).getByRole("button", { name: "Đóng thông báo" }));
    expect(screen.queryByText("Một")).not.toBeInTheDocument();
    expect(screen.getByText("Hai")).toBeInTheDocument();
  });

  it("nút hành động gọi onClick", async () => {
    const onClick = vi.fn();
    render(<Toaster />);
    act(() => {
      toast({ tone: "warning", title: "Đã xoá 1 chứng từ", action: { label: "Hoàn tác", onClick } });
    });
    await userEvent.click(screen.getByRole("button", { name: "Hoàn tác" }));
    expect(onClick).toHaveBeenCalled();
  });

  it("nhãn tiếng Anh dưới UiLocaleProvider en", () => {
    render(
      <UiLocaleProvider locale="en">
        <Toaster />
      </UiLocaleProvider>,
    );
    act(() => {
      toast({ title: "Saved" });
    });
    expect(screen.getByRole("button", { name: "Dismiss notification" })).toBeInTheDocument();
  });

  it("không vi phạm a11y", async () => {
    const { container } = render(<Toaster />);
    act(() => {
      toast({ tone: "info", title: "Đang tra cứu HS", action: { label: "Xem", onClick: () => {} } });
    });
    await expectNoA11yViolations(container);
  });
});
