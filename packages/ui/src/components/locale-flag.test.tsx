import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoA11yViolations } from "../../test/a11y.js";
import { LocaleFlag } from "./locale-flag.js";

describe("LocaleFlag", () => {
  it("có label thì là ảnh có tên; không label thì ẩn khỏi trình đọc màn hình", async () => {
    const { container } = render(
      <div>
        <LocaleFlag locale="vi" label="Tiếng Việt" />
        <LocaleFlag locale="en" />
        <LocaleFlag locale="zh" />
      </div>,
    );
    expect(screen.getByRole("img", { name: "Tiếng Việt" })).toBeInTheDocument();
    expect(screen.getByTitle("Tiếng Việt")).toBeInTheDocument();
    expect(container.querySelectorAll('svg[aria-hidden="true"]')).toHaveLength(2);
    await expectNoA11yViolations(container);
  });

  it("mỗi ngôn ngữ vẽ một lá cờ khác nhau", () => {
    const html = (["vi", "en", "zh"] as const).map((l) => render(<LocaleFlag locale={l} />).container.innerHTML);
    expect(new Set(html).size).toBe(3);
  });
});
