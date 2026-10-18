import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { expectNoA11yViolations } from "../../test/a11y.js";
import { Abbreviation } from "./abbreviation.js";
import { Field } from "./field.js";
import { Input } from "./inputs.js";

describe("Abbreviation – chữ viết tắt bấm vào xem tên đầy đủ", () => {
  it("hiện chữ viết tắt; tên truy cập gồm cả chữ viết tắt và tên đầy đủ", () => {
    render(<Abbreviation short="Mã PLHH" full="Mã phân loại hàng hóa" />);
    const btn = screen.getByRole("button", { name: "Mã PLHH (Mã phân loại hàng hóa)" });
    expect(btn).toHaveTextContent("Mã PLHH");
  });

  it("bấm (chuột hoặc Enter) mở khung tên đầy đủ, Esc đóng", async () => {
    render(<Abbreviation short="Mã PLHH" full="Mã phân loại hàng hóa" />);
    await userEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("dialog")).toHaveTextContent("Mã phân loại hàng hóa");
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    screen.getByRole("button").focus();
    await userEvent.keyboard("{Enter}");
    expect(screen.getByRole("dialog")).toHaveTextContent("Mã phân loại hàng hóa");
  });

  it("đặt trong nhãn Field: ô nhập có tên truy cập đầy đủ, bấm chữ viết tắt không đẩy con trỏ vào ô", async () => {
    render(
      <Field label={<>1.5 · <Abbreviation short="Mã PLHH" full="Mã phân loại hàng hóa" /></>}>
        <Input />
      </Field>,
    );
    const input = screen.getByRole("textbox", { name: /1\.5 · Mã PLHH \(Mã phân loại hàng hóa\)/ });
    await userEvent.click(screen.getByRole("button", { name: /Mã PLHH/ }));
    expect(input).not.toHaveFocus();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("không vi phạm a11y (đóng và mở)", async () => {
    const { container } = render(
      <Field label={<>1.5 · <Abbreviation short="Mã PLHH" full="Mã phân loại hàng hóa" /></>}>
        <Input />
      </Field>,
    );
    await expectNoA11yViolations(container);
    await userEvent.click(screen.getByRole("button"));
    await expectNoA11yViolations(document.body);
  });
});
