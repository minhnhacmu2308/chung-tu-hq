import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../test/a11y.js";
import { Field } from "./field.js";
import { Checkbox, Input, Select, Textarea } from "./inputs.js";

describe("Field + control", () => {
  it("gắn nhãn với ô nhập (tìm được bằng label)", () => {
    render(<Field label="Số hóa đơn"><Input /></Field>);
    expect(screen.getByLabelText("Số hóa đơn")).toBeInstanceOf(HTMLInputElement);
  });

  it("gợi ý và lỗi được liên kết qua aria-describedby; lỗi đặt aria-invalid", () => {
    render(
      <Field label="MST" hint="10 chữ số" error="MST không hợp lệ">
        <Input />
      </Field>,
    );
    const input = screen.getByLabelText("MST");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("10 chữ số MST không hợp lệ");
    expect(screen.getByRole("alert")).toHaveTextContent("MST không hợp lệ");
  });

  it("required: thêm dấu * (ẩn với trình đọc) và thuộc tính required", () => {
    render(<Field label="Tên" required><Input /></Field>);
    // getByRole dùng tên truy cập thật (bỏ phần aria-hidden "*"), đúng như trình đọc màn hình nghe thấy
    expect(screen.getByRole("textbox", { name: "Tên" })).toBeRequired();
  });

  it("Input dùng ngoài Field vẫn giữ required/aria-invalid tự đặt", () => {
    render(<Input aria-label="X" required aria-invalid />);
    const input = screen.getByLabelText("X");
    expect(input).toBeRequired();
    expect(input).toHaveAttribute("aria-invalid", "true");
  });

  it("gõ được và gọi onChange", async () => {
    const onChange = vi.fn();
    render(<Field label="Ghi chú"><Textarea onChange={onChange} /></Field>);
    await userEvent.type(screen.getByLabelText("Ghi chú"), "abc");
    expect(onChange).toHaveBeenCalledTimes(3);
  });

  it("Select hiển thị placeholder và chọn được", async () => {
    const onChange = vi.fn();
    render(
      <Field label="Loại hình">
        <Select placeholder="Chọn…" onChange={onChange} options={[{ value: "A11", label: "A11" }, { value: "E21", label: "E21" }]} />
      </Field>,
    );
    await userEvent.selectOptions(screen.getByLabelText("Loại hình"), "E21");
    expect(screen.getByLabelText("Loại hình")).toHaveValue("E21");
    expect(onChange).toHaveBeenCalled();
  });

  it("Checkbox bật/tắt bằng click nhãn", async () => {
    render(<Checkbox label="Đã duyệt" />);
    const cb = screen.getByRole("checkbox", { name: "Đã duyệt" });
    await userEvent.click(screen.getByText("Đã duyệt"));
    expect(cb).toBeChecked();
  });

  it("không vi phạm a11y", async () => {
    const { container } = render(
      <form>
        <Field label="Số hóa đơn" hint="Theo invoice" error="Bắt buộc" required><Input /></Field>
        <Field label="Loại hình"><Select options={[{ value: "A11", label: "A11" }]} /></Field>
        <Checkbox label="Đồng ý" />
      </form>,
    );
    await expectNoA11yViolations(container);
  });
});
