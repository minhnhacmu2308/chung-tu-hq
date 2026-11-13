import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoA11yViolations } from "../../test/a11y.js";
import { Barcode } from "./barcode.js";

describe("Barcode", () => {
  it("QR: svg role=img có aria-label, màu currentColor, giữ tỉ lệ vuông", async () => {
    const { container, getByRole } = render(<Barcode type="qr" value="KVGS-123" label="Mã QR bản kê" />);
    const svg = getByRole("img", { name: "Mã QR bản kê" });
    expect(svg.tagName.toLowerCase()).toBe("svg");
    expect(svg.getAttribute("viewBox")).toMatch(/^0 0 (\d+) \1$/);
    expect(svg).toHaveAttribute("preserveAspectRatio", "xMidYMid meet");
    expect(container.innerHTML).not.toMatch(/#[0-9a-f]{3,6}|rgb\(/i);
    expect(container.querySelector("path")).toHaveAttribute("fill", "currentColor");
    await expectNoA11yViolations(container);
  });

  it("Code128: svg vạch dùng stroke currentColor", async () => {
    const { container, getByRole } = render(<Barcode type="code128" value="FBIU5802429" label="Mã vạch container" />);
    const svg = getByRole("img", { name: "Mã vạch container" });
    expect(svg.tagName.toLowerCase()).toBe("svg");
    const paths = container.querySelectorAll("path");
    expect(paths.length).toBeGreaterThan(0);
    paths.forEach((p) => expect(p).toHaveAttribute("stroke", "currentColor"));
    expect(container.innerHTML).not.toMatch(/#[0-9a-f]{3,6}/i);
    await expectNoA11yViolations(container);
  });

  it("value rỗng: không render, không throw", () => {
    const { container } = render(<Barcode type="qr" value="" label="x" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("giá trị vượt sức chứa (thư viện throw): không throw, không render", () => {
    const { container } = render(<Barcode type="qr" value={"x".repeat(10000)} label="x" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("cỡ qua token class, không dùng style cứng", () => {
    const { getByRole, rerender } = render(<Barcode type="qr" value="a" label="q" />);
    expect(getByRole("img")).toHaveClass("h-32", "w-32");
    rerender(<Barcode type="qr" value="a" label="q" size="sm" />);
    expect(getByRole("img")).toHaveClass("h-24", "w-24");
    rerender(<Barcode type="qr" value="a" label="q" size="lg" className="mx-auto" />);
    expect(getByRole("img")).toHaveClass("h-48", "w-48", "mx-auto");
    expect(getByRole("img")).not.toHaveAttribute("style");
  });

  const LONG = "KVGS-MOCK|309096721420|FBIU5802429";
  const narrowBarPx = (svg: Element) => {
    const vbW = Number(svg.getAttribute("viewBox")!.split(" ")[2]);
    const unit = Number(svg.getAttribute("width")) / vbW;
    const sw = Math.min(...[...svg.querySelectorAll("path")].map((p) => Number(p.getAttribute("stroke-width"))));
    return sw * unit;
  };

  it("Code128: bề rộng theo số module, vạch hẹp >= 1,5px, cao cố định", () => {
    const a = render(<Barcode type="code128" value="ABC" label="a" />);
    const short = a.getByRole("img", { name: "a" });
    const b = render(<Barcode type="code128" value={LONG} label="b" />);
    const long = b.getByRole("img", { name: "b" });
    expect(Number(long.getAttribute("width"))).toBeGreaterThan(Number(short.getAttribute("width")) * 2);
    expect(long.getAttribute("height")).toBe(short.getAttribute("height"));
    expect(long.getAttribute("preserveAspectRatio")).toBe("none");
    expect(narrowBarPx(long)).toBeGreaterThanOrEqual(1.5);
    expect(narrowBarPx(short)).toBeGreaterThanOrEqual(1.5);
  });

  it.each([["sm", 1.5], ["md", 2], ["lg", 3]] as const)("Code128 cỡ %s: vạch hẹp %s px", (size, px) => {
    const { getByRole } = render(<Barcode type="code128" value={LONG} label="c" size={size} />);
    expect(narrowBarPx(getByRole("img"))).toBeCloseTo(px, 1);
  });

  it("QR: vùng yên tĩnh >= 4 module", () => {
    const { getByRole } = render(<Barcode type="qr" value={LONG} label="q" />);
    const svg = getByRole("img");
    const vb = Number(svg.getAttribute("viewBox")!.split(" ")[2]);
    const nums = svg.querySelector("path")!.getAttribute("d")!.match(/[0-9]+/g)!.map(Number);
    const min = Math.min(...nums);
    const max = Math.max(...nums);
    const mod = 4; // bwip: 1 module = 4 đơn vị viewBox
    expect(min / mod).toBeGreaterThanOrEqual(4);
    expect((vb - max) / mod).toBeGreaterThanOrEqual(4);
  });

  it("ký tự trong value không lọt vào thuộc tính SVG", () => {
    const { container } = render(<Barcode type="qr" value={'"><script>alert(1)</script>'} label="q" />);
    expect(container.querySelector("script")).toBeNull();
    expect(container.innerHTML).not.toContain("alert");
  });
});
