import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../test/a11y.js";
import { Field } from "./field.js";
import { FormSection } from "./form-section.js";
import { Checkbox, Input, Select } from "./inputs.js";
import { StatCard } from "./stat-card.js";

describe("StatCard", () => {
  it("hiện nhãn, con số, dòng phụ; vùng có tên theo nhãn; icon chỉ để trang trí", async () => {
    const { container } = render(<StatCard label="Hồ sơ đang mở" value={8} hint="7 nhập · 1 xuất" icon={<svg />} />);
    const card = screen.getByRole("region", { name: "Hồ sơ đang mở" });
    expect(card).toHaveTextContent("8");
    expect(card).toHaveTextContent("7 nhập · 1 xuất");
    expect(container.querySelector("svg")!.parentElement).toHaveAttribute("aria-hidden", "true");
    await expectNoA11yViolations(container);
  });

  it("chuỗi đã định dạng hiển thị nguyên văn; hintTone=danger tô dòng phụ; loading hiện khung tải thay con số", () => {
    const { rerender } = render(<StatCard label="Tỷ lệ luồng xanh" value="67%" hint="1 hồ sơ đã quá hạn" hintTone="danger" />);
    expect(screen.getByText("67%")).toBeInTheDocument();
    expect(screen.getByText("1 hồ sơ đã quá hạn")).toHaveClass("text-danger-subtle-fg");
    rerender(<StatCard label="Tỷ lệ luồng xanh" value="67%" loading />);
    expect(screen.queryByText("67%")).not.toBeInTheDocument();
  });

  it("tone đổi màu ô icon", () => {
    const { container } = render(<StatCard label="Quá hạn" value={4} tone="danger" icon={<svg />} />);
    expect(container.querySelector("svg")!.parentElement).toHaveClass("bg-danger-subtle", "text-danger-subtle-fg");
  });
});

describe("FormSection", () => {
  it("là vùng có tên theo tiêu đề, chứa mô tả và các trường", async () => {
    const { container } = render(
      <form>
        <FormSection title="Đối tác" description="Ghi đúng như trên invoice">
          <Field label="Người bán"><Input /></Field>
        </FormSection>
        <FormSection title="Ghi chú"><Field label="Ghi chú nội bộ"><Input /></Field></FormSection>
      </form>,
    );
    const section = screen.getByRole("region", { name: "Đối tác" });
    expect(section).toHaveTextContent("Ghi đúng như trên invoice");
    expect(screen.getByRole("textbox", { name: "Người bán" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ghi chú", level: 3 })).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it("Select: bàn phím (↓ mở, ↑↓ di chuyển bỏ qua mục khoá, Enter chọn, Esc đóng, gõ chữ để nhảy) + onChange(e) như thẻ gốc", async () => {
    const onChange = vi.fn((e: React.ChangeEvent<HTMLSelectElement>) => e.target.value);
    function Controlled() {
      const [v, setV] = React.useState("A11");
      return (
        <Select
          aria-label="Loại hình"
          value={v}
          onChange={(e) => { onChange(e); setV(e.target.value); }}
          options={[{ value: "A11", label: "A11 Nhập kinh doanh" }, { value: "A12", label: "A12 Khoá", disabled: true }, { value: "E21", label: "E21 Gia công" }, { value: "B11", label: "B11 Xuất kinh doanh" }]}
        />
      );
    }
    render(<Controlled />);
    const select = screen.getByRole("combobox", { name: "Loại hình" });
    select.focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(select).toHaveAttribute("aria-expanded", "true");
    expect(select.getAttribute("aria-activedescendant")).toBe(screen.getByRole("option", { name: "A11 Nhập kinh doanh" }).id);
    await userEvent.keyboard("{ArrowDown}");
    expect(select.getAttribute("aria-activedescendant")).toBe(screen.getByRole("option", { name: "E21 Gia công" }).id);
    await userEvent.keyboard("{Enter}");
    expect(select).toHaveAttribute("aria-expanded", "false");
    expect(select).toHaveTextContent("E21 Gia công");
    expect(onChange).toHaveReturnedWith("E21");
    expect(document.activeElement).toBe(select);
    await userEvent.keyboard("{ArrowDown}{Escape}");
    expect(select).toHaveAttribute("aria-expanded", "false");
    expect(select).toHaveTextContent("E21 Gia công");
    // Đóng mà gõ chữ: chọn luôn mục bắt đầu bằng chữ đó, như select gốc.
    await userEvent.keyboard("b");
    expect(select).toHaveTextContent("B11 Xuất kinh doanh");
    expect(onChange).toHaveBeenCalledTimes(2);
  });
});

describe("Select / Checkbox tự vẽ", () => {
  it("Select: nút combobox có nhãn theo Field, danh sách tự vẽ đánh dấu mục đang chọn; Checkbox vẫn là ô gốc", async () => {
    const { container } = render(
      <form aria-label="Giao hàng">
        <Field label="Điều kiện giao hàng"><Select name="incoterm" options={[{ value: "CIF", label: "CIF" }, { value: "FOB", label: "FOB" }]} defaultValue="CIF" /></Field>
        <Checkbox label="Ghi nhớ đăng nhập" defaultChecked />
      </form>,
    );
    const select = screen.getByRole("combobox", { name: "Điều kiện giao hàng" });
    expect(select.tagName).toBe("BUTTON");
    expect(select).toHaveTextContent("CIF");
    await userEvent.click(select);
    expect(select).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("listbox", { name: "Điều kiện giao hàng" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "CIF" })).toHaveAttribute("aria-selected", "true");
    await expectNoA11yViolations(document.body);
    await userEvent.click(screen.getByRole("option", { name: "FOB" }));
    expect(select).toHaveTextContent("FOB");
    // Giá trị vẫn đi theo form như thẻ select gốc.
    expect(new FormData(container.querySelector("form")!).get("incoterm")).toBe("FOB");
    const box = screen.getByRole("checkbox", { name: "Ghi nhớ đăng nhập" });
    expect(box).toBeChecked();
    expect(box).toHaveClass("kb-checkbox");
    await expectNoA11yViolations(container);
  });

  it("Select: bàn phím (↓ mở, ↑↓ di chuyển bỏ qua mục khoá, Enter chọn, Esc đóng, gõ chữ để nhảy) + onChange(e) như thẻ gốc", async () => {
    const onChange = vi.fn((e: React.ChangeEvent<HTMLSelectElement>) => e.target.value);
    function Controlled() {
      const [v, setV] = React.useState("A11");
      return (
        <Select
          aria-label="Loại hình"
          value={v}
          onChange={(e) => { onChange(e); setV(e.target.value); }}
          options={[{ value: "A11", label: "A11 Nhập kinh doanh" }, { value: "A12", label: "A12 Khoá", disabled: true }, { value: "E21", label: "E21 Gia công" }, { value: "B11", label: "B11 Xuất kinh doanh" }]}
        />
      );
    }
    render(<Controlled />);
    const select = screen.getByRole("combobox", { name: "Loại hình" });
    select.focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(select).toHaveAttribute("aria-expanded", "true");
    expect(select.getAttribute("aria-activedescendant")).toBe(screen.getByRole("option", { name: "A11 Nhập kinh doanh" }).id);
    await userEvent.keyboard("{ArrowDown}");
    expect(select.getAttribute("aria-activedescendant")).toBe(screen.getByRole("option", { name: "E21 Gia công" }).id);
    await userEvent.keyboard("{Enter}");
    expect(select).toHaveAttribute("aria-expanded", "false");
    expect(select).toHaveTextContent("E21 Gia công");
    expect(onChange).toHaveReturnedWith("E21");
    expect(document.activeElement).toBe(select);
    await userEvent.keyboard("{ArrowDown}{Escape}");
    expect(select).toHaveAttribute("aria-expanded", "false");
    expect(select).toHaveTextContent("E21 Gia công");
    // Đóng mà gõ chữ: chọn luôn mục bắt đầu bằng chữ đó, như select gốc.
    await userEvent.keyboard("b");
    expect(select).toHaveTextContent("B11 Xuất kinh doanh");
    expect(onChange).toHaveBeenCalledTimes(2);
  });
});
