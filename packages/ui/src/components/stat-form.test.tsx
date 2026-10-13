import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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
});

describe("Select / Checkbox tự vẽ", () => {
  it("vẫn là control gốc của trình duyệt (bàn phím, trình đọc màn hình dùng như cũ)", async () => {
    const { container } = render(
      <>
        <Field label="Điều kiện giao hàng"><Select options={[{ value: "CIF", label: "CIF" }, { value: "FOB", label: "FOB" }]} defaultValue="CIF" /></Field>
        <Checkbox label="Ghi nhớ đăng nhập" defaultChecked />
      </>,
    );
    const select = screen.getByRole("combobox", { name: "Điều kiện giao hàng" });
    expect(select.tagName).toBe("SELECT");
    expect(select).toHaveValue("CIF");
    const box = screen.getByRole("checkbox", { name: "Ghi nhớ đăng nhập" });
    expect(box).toBeChecked();
    expect(box).toHaveClass("kb-checkbox");
    await expectNoA11yViolations(container);
  });
});
