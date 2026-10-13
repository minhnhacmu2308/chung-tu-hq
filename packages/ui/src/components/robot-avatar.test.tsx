import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../test/a11y.js";
import { RobotAvatar } from "./robot-avatar.js";

// jsdom không vẽ canvas → thay robot-heads bằng canvas giả ghi lại props nhận được.
vi.mock("robot-heads", () => ({
  RobotHead: (p: Record<string, unknown>) => (
    <canvas data-state={p.state} data-color={p.color} data-trim={p.trimColor} data-screen={p.screenColor} data-size={p.size} />
  ),
}));

/** Giả lập trình duyệt resolve token màu: span dò nào có data-token thì trả màu tương ứng. */
let tokenColors: Record<string, string>;
beforeEach(() => {
  tokenColors = { primary: "rgb(10, 20, 30)", "primary-fg": "rgb(250, 250, 250)", "primary-subtle": "rgb(200, 210, 220)" };
  const orig = window.getComputedStyle.bind(window);
  vi.spyOn(window, "getComputedStyle").mockImplementation((el, pseudo) => {
    const d = orig(el, pseudo);
    const token = (el as Element).getAttribute?.("data-token");
    if (token) Object.defineProperty(d, "color", { value: tokenColors[token] ?? "", configurable: true });
    return d;
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.removeAttribute("data-theme");
});

describe("RobotAvatar", () => {
  it("vẽ robot ẩn với trình đọc màn hình, truyền trạng thái và kích thước", () => {
    const { container } = render(<RobotAvatar state="thinking" size={64} />);
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
    const canvas = container.querySelector("canvas");
    expect(canvas).toHaveAttribute("data-state", "thinking");
    expect(canvas).toHaveAttribute("data-size", "64");
  });

  it("lấy màu vỏ, màn hình, viền từ token primary / primary-fg / primary-subtle", () => {
    const { container } = render(<RobotAvatar />);
    const canvas = container.querySelector("canvas");
    expect(canvas).toHaveAttribute("data-color", "rgb(10, 20, 30)");
    expect(canvas).toHaveAttribute("data-screen", "rgb(250, 250, 250)");
    expect(canvas).toHaveAttribute("data-trim", "rgb(200, 210, 220)");
  });

  it("đọc lại màu khi <html> đổi data-theme", async () => {
    const { container } = render(<RobotAvatar />);
    tokenColors.primary = "rgb(1, 1, 1)";
    document.documentElement.setAttribute("data-theme", "dark");
    await waitFor(() => expect(container.querySelector("canvas")).toHaveAttribute("data-color", "rgb(1, 1, 1)"));
  });

  it("không vi phạm a11y", async () => {
    const { container } = render(<RobotAvatar state="idle" />);
    await expectNoA11yViolations(container);
  });
});
