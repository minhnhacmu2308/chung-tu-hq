import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoA11yViolations } from "../../test/a11y.js";
import { RecordCard } from "./record-card.js";

describe("RecordCard", () => {
  it("tiêu đề, phụ đề, trạng thái, lưới trường (nhãn: giá trị), chân thẻ; không vi phạm a11y", async () => {
    const { container } = render(
      <RecordCard
        title="HS-NK-2610-027"
        subtitle="Dongguan Changli Trading"
        leading={<span>NK</span>}
        status={<span>Đang xử lý</span>}
        actions={<button type="button">Thao tác</button>}
        fields={[{ label: "Trị giá", value: "3.205,00 USD" }, { label: "Đối tác", value: "Rất dài", wide: true }]}
        footer="Cập nhật 3 giờ trước"
      />,
    );
    expect(screen.getByText("HS-NK-2610-027")).toBeInTheDocument();
    expect(screen.getByText("Dongguan Changli Trading")).toBeInTheDocument();
    expect(screen.getByText("Trị giá").tagName).toBe("DT");
    expect(screen.getByText("3.205,00 USD").tagName).toBe("DD");
    expect(screen.getByText("Rất dài").parentElement).toHaveClass("col-span-2");
    expect(screen.getByText("Cập nhật 3 giờ trước")).toHaveClass("border-t");
    expect(screen.getByRole("button", { name: "Thao tác" })).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it("không có trường / chân thẻ → không dựng phần trống", () => {
    const { container } = render(<RecordCard title="A" />);
    expect(container.querySelector("dl")).toBeNull();
    expect(container.querySelector(".border-t")).toBeNull();
  });
});
