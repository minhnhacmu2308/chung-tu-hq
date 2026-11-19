import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../test/a11y.js";
import { Field } from "./field.js";
import { PasswordInput } from "./inputs.js";

describe("PasswordInput", () => {
  it("mặc định ẩn chữ; bấm nút mắt thì hiện, bấm lại thì ẩn; không submit form", async () => {
    const onSubmit = vi.fn((e: { preventDefault: () => void }) => e.preventDefault());
    const { container } = render(
      <form onSubmit={onSubmit}>
        <Field label="Mật khẩu"><PasswordInput defaultValue="bi-mat" autoComplete="current-password" /></Field>
      </form>,
    );
    const input = screen.getByLabelText("Mật khẩu");
    const toggle = screen.getByRole("button", { name: "Hiện mật khẩu" });
    expect(input).toHaveAttribute("type", "password");
    expect(toggle).toHaveAttribute("aria-pressed", "false");

    await userEvent.click(toggle);
    expect(input).toHaveAttribute("type", "text");
    expect(input).toHaveValue("bi-mat");
    expect(toggle).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(toggle);
    expect(input).toHaveAttribute("type", "password");
    expect(onSubmit).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it("dùng được bằng bàn phím: Tab tới nút, Space bật/tắt", async () => {
    render(<PasswordInput aria-label="Mật khẩu" />);
    await userEvent.tab();
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Hiện mật khẩu" })).toHaveFocus();
    await userEvent.keyboard(" ");
    expect(screen.getByLabelText("Mật khẩu")).toHaveAttribute("type", "text");
  });

  it("disabled thì nút cũng tắt; labels ghi đè nhãn", () => {
    render(<PasswordInput aria-label="Mật khẩu" disabled labels={{ show: "Show" }} />);
    expect(screen.getByRole("button", { name: "Show" })).toBeDisabled();
  });
});
