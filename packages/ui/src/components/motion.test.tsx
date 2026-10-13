import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../test/a11y.js";
import { AiBackdrop, AiScanCard } from "./ai-visuals.js";
import { CountUp } from "./count-up.js";
import { Grid, Stack } from "./layout.js";
import { UiLocaleProvider } from "../lib/i18n.js";

describe("CountUp", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("không có matchMedia / bật giảm chuyển động: hiện ngay giá trị cuối, định dạng theo ngôn ngữ", () => {
    const { container } = render(<CountUp value={12345} />);
    expect(container.querySelector("[aria-hidden]")).toHaveTextContent("12.345");
    render(<UiLocaleProvider locale="en"><CountUp value={12345} /></UiLocaleProvider>);
    expect(screen.getAllByText("12,345").length).toBeGreaterThan(0);
  });

  it("chạy từ 0 lên giá trị; trình đọc màn hình luôn nhận giá trị cuối", () => {
    let now = 0;
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => frames.push(cb));
    vi.stubGlobal("cancelAnimationFrame", () => {});
    vi.spyOn(performance, "now").mockImplementation(() => now);

    const { container } = render(<CountUp value={80} duration={100} />);
    const visible = container.querySelector("[aria-hidden]")!;
    expect(visible).toHaveTextContent("0");
    expect(container.querySelector(".sr-only")).toHaveTextContent("80");

    now = 50;
    act(() => frames.shift()!(now));
    const mid = Number(visible.textContent);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(80);

    now = 100;
    act(() => frames.shift()!(now));
    expect(visible).toHaveTextContent("80");
  });
});

describe("AiBackdrop / AiScanCard", () => {
  it("chỉ là trang trí: ẩn với trình đọc màn hình, không vi phạm a11y, chuyển động chỉ bật ở motion-safe", async () => {
    const { container } = render(
      <div className="relative">
        <AiBackdrop />
        <AiScanCard title="COMMERCIAL INVOICE" fields={[{ label: "Số invoice", value: "HP-2610-078" }, { label: "Trị giá", value: "20.850,00 USD" }]} />
        <p>Nội dung thật</p>
      </div>,
    );
    expect(screen.getByText("Nội dung thật")).toBeVisible();
    for (const el of container.querySelectorAll('[class*="animate-"]')) {
      expect(el.getAttribute("class")).toMatch(/motion-safe:animate-/);
      expect(el.closest("[aria-hidden=true]")).not.toBeNull();
    }
    await expectNoA11yViolations(container);
  });

  it("AiScanCard hiện tối đa 4 trường", () => {
    const fields = Array.from({ length: 6 }, (_, i) => ({ label: `Trường ${i}`, value: String(i) }));
    const { container } = render(<AiScanCard title="B/L" fields={fields} />);
    expect(container.querySelectorAll("li")).toHaveLength(4);
  });
});

describe("Stack / Grid stagger", () => {
  it("prop stagger bật hiệu ứng lần lượt; mặc định tắt", () => {
    const { container } = render(
      <>
        <Stack data-testid="a" stagger><p>1</p></Stack>
        <Grid stagger><p>2</p></Grid>
        <Stack><p>3</p></Stack>
      </>,
    );
    const [a, b, c] = container.children;
    expect(a).toHaveClass("stagger-children");
    expect(b).toHaveClass("stagger-children");
    expect(c).not.toHaveClass("stagger-children");
  });
});
