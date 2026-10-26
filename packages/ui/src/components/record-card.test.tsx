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

  it("tone → đầu thẻ nền dịu + họa tiết + hình chìm (chỉ trang trí, ẩn với trình đọc màn hình); không vi phạm a11y", async () => {
    const { container } = render(<RecordCard title="HS-NK-2610-027" tone="info" pattern="grid" art={<svg data-testid="art" />} actions={<button type="button">Thao tác</button>} />);
    const head = container.querySelector("[data-slot=record-card-head]")!;
    expect(head).toHaveClass("bg-info-subtle");
    expect(head.querySelector("pattern path")).not.toBeNull();
    expect(screen.getByTestId("art").closest("[aria-hidden=true]")).not.toBeNull();
    expect(head).toContainElement(screen.getByRole("button", { name: "Thao tác" }));
    await expectNoA11yViolations(container);
  });

  it("không có tone → đầu thẻ trơn, không họa tiết", () => {
    const { container } = render(<RecordCard title="A" art={<svg />} />);
    expect(container.querySelector("[data-slot=record-card-head]")).toBeNull();
    expect(container.querySelector("pattern")).toBeNull();
  });

  it("không có trường / chân thẻ → không dựng phần trống", () => {
    const { container } = render(<RecordCard title="A" />);
    expect(container.querySelector("dl")).toBeNull();
    expect(container.querySelector(".border-t")).toBeNull();
  });

  it("titleLines → tiêu đề cắt theo số dòng và giữ đủ chỗ, trạng thái xuống dòng riêng (đầu thẻ trong lưới cao bằng nhau)", () => {
    const { container } = render(<RecordCard title="Tiêu đề rất dài" titleLines={2} subtitle="Người gửi" status={<span>Chưa xếp</span>} tone="info" />);
    const title = screen.getByText("Tiêu đề rất dài");
    expect(title).toHaveClass("line-clamp-2", "min-h-[2lh]");
    expect(title.parentElement!.contains(screen.getByText("Chưa xếp"))).toBe(true);
    expect(title.contains(screen.getByText("Chưa xếp"))).toBe(false);
    expect(screen.getByText("Người gửi")).toHaveClass("line-clamp-1");
    expect(container.querySelector("[data-slot=record-card-head]")).not.toBeNull();
  });
});
