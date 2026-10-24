import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../test/a11y.js";
import { Field, FieldFrame } from "./field.js";
import { Checkbox, Input, Select, Textarea } from "./inputs.js";
import { Button } from "./button.js";
import { chooseOption } from "../../test/select.js";

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
    expect(screen.getByLabelText("Loại hình")).toHaveTextContent("Chọn…");
    await chooseOption(screen.getByLabelText("Loại hình"), "E21");
    expect(screen.getByLabelText("Loại hình")).toHaveTextContent("E21");
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

  it("orientation=\"horizontal\": nhãn bên trái ở vùng nội dung rộng – vẫn gắn nhãn, gợi ý, lỗi đúng chuẩn", async () => {
    const { container } = render(
      <Field label="Số hóa đơn" hint="Theo invoice" error="Thiếu" orientation="horizontal">
        <Input />
      </Field>,
    );
    const input = screen.getByLabelText("Số hóa đơn");
    expect(input).toHaveAccessibleDescription("Theo invoice Thiếu");
    expect(container.firstElementChild).toHaveAttribute("data-orientation", "horizontal");
    await expectNoA11yViolations(container);
  });

  it("mặc định dọc (nhãn trên ô)", () => {
    const { container } = render(<Field label="Tên"><Input /></Field>);
    expect(container.firstElementChild).toHaveAttribute("data-orientation", "vertical");
  });

  it("FieldFrame: khung viền, tên nằm trên đường viền (legend) – là một nhóm có tên", async () => {
    const { container } = render(<FieldFrame legend="1.27 · Số kiện"><Field label="Số lượng kiện"><Input /></Field></FieldFrame>);
    const group = screen.getByRole("group", { name: "1.27 · Số kiện" });
    expect(group.tagName).toBe("FIELDSET");
    expect(group).toHaveAttribute("data-frame");
    await expectNoA11yViolations(container);
  });

  it("framed: ô đứng riêng có khung như nhóm, nhãn trên đường viền vẫn gắn với ô; gợi ý, bắt buộc đúng chuẩn", async () => {
    const { container } = render(<Field label="1.6 · Mã PTVC" hint="Mã 1–9" required framed><Input /></Field>);
    const input = screen.getByRole("textbox", { name: "1.6 · Mã PTVC" });
    expect(input).toBeRequired();
    expect(input).toHaveAccessibleDescription("Mã 1–9");
    expect(container.querySelector("fieldset[data-frame] > legend label")).toHaveTextContent("1.6 · Mã PTVC");
    await expectNoA11yViolations(container);
  });

  it("legendAction: nút (ⓘ) nằm trên đường viền sau tên; tên nhóm chỉ là tên, không lẫn tên nút", async () => {
    const { container } = render(<FieldFrame legend="1.27 · Số kiện" legendAction={<Button size="icon-sm" aria-label="Hướng dẫn khai chỉ tiêu 1.27">i</Button>}><Field label="Số lượng kiện"><Input /></Field></FieldFrame>);
    const group = screen.getByRole("group", { name: "1.27 · Số kiện" });
    expect(group.querySelector("legend")).toContainElement(screen.getByRole("button", { name: "Hướng dẫn khai chỉ tiêu 1.27" }));
    await expectNoA11yViolations(container);
  });

  it("Field framed + labelAction: nút trên đường viền, tên ô nhập không đổi", async () => {
    const { container } = render(<Field label="1.6 · Mã PTVC" framed required labelAction={<Button size="icon-sm" aria-label="Hướng dẫn khai chỉ tiêu 1.6">i</Button>}><Input /></Field>);
    expect(screen.getByRole("textbox", { name: "1.6 · Mã PTVC" })).toBeInTheDocument();
    expect(container.querySelector("legend")).toContainElement(screen.getByRole("button", { name: "Hướng dẫn khai chỉ tiêu 1.6" }));
    await expectNoA11yViolations(container);
  });
});
