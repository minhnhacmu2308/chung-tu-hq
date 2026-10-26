import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoA11yViolations } from "../../test/a11y.js";
import { HtmlPreview } from "./html-preview.js";

describe("HtmlPreview", () => {
  it("iframe có tên, sandbox không cho script, khung mobile hẹp lại", async () => {
    const { container, rerender } = render(<HtmlPreview title="Xem trước email" html="<p>Chào</p>" />);
    const frame = screen.getByTitle("Xem trước email");
    expect(frame.getAttribute("srcdoc")).toBe("<p>Chào</p>");
    expect(frame.getAttribute("sandbox")).not.toContain("allow-scripts");
    expect(frame.className).not.toContain("max-w-sm");
    rerender(<HtmlPreview title="Xem trước email" html="<p>Chào</p>" device="mobile" />);
    expect(screen.getByTitle("Xem trước email").className).toContain("max-w-sm");
    await expectNoA11yViolations(container);
  });
});
