import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../test/a11y.js";
import { ConfirmDialog, type ConfirmDialogProps } from "./confirm-dialog.js";

function Harness(props: Partial<ConfirmDialogProps>) {
  const [open, setOpen] = useState(true);
  return (
    <ConfirmDialog open={open} onOpenChange={setOpen} title="Xóa hẳn hồ sơ?" confirmLabel="Xóa vĩnh viễn" onConfirm={() => {}} {...props}>
      Hồ sơ cùng chứng từ sẽ bị xóa.
    </ConfirmDialog>
  );
}

describe("ConfirmDialog", () => {
  it("danger: vạch đỏ + icon nền đỏ, Alert hậu quả có 'Không thể hoàn tác', nút xác nhận đỏ; không có nút đổi panel", async () => {
    render(<Harness irreversible subject="INV-001" icon={<svg data-testid="ic" />} />);
    const dialog = screen.getByRole("dialog", { name: "Xóa hẳn hồ sơ?" });
    expect(dialog).toHaveClass("border-t-danger");
    expect(screen.getByTestId("ic").parentElement).toHaveClass("bg-danger-subtle");
    const alert = within(dialog).getByRole("alert");
    expect(alert).toHaveTextContent("Không thể hoàn tác");
    expect(alert).toHaveTextContent("Hồ sơ cùng chứng từ sẽ bị xóa.");
    expect(within(dialog).getByText("INV-001")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Xóa vĩnh viễn" })).toHaveClass("bg-danger");
    expect(within(dialog).queryByRole("button", { name: "Hiển thị dạng panel bên phải" })).not.toBeInTheDocument();
    await expectNoA11yViolations(document.body);
  });

  it("focus sẵn ở 'Giữ lại' (Enter vô tình không xóa); Giữ lại đóng, xác nhận gọi onConfirm", async () => {
    const onConfirm = vi.fn();
    render(<Harness onConfirm={onConfirm} />);
    const keep = screen.getByRole("button", { name: "Giữ lại" });
    expect(keep).toHaveFocus();
    await userEvent.click(screen.getByRole("button", { name: "Xóa vĩnh viễn" }));
    expect(onConfirm).toHaveBeenCalledOnce();
    await userEvent.click(keep);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("đang chạy: không đóng được (Escape, Giữ lại bị khóa)", async () => {
    render(<Harness loading />);
    expect(screen.getByRole("button", { name: "Giữ lại" })).toBeDisabled();
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("warning: tông vàng, nút xác nhận chính; nhãn 'Giữ lại' đổi được", () => {
    render(<Harness tone="warning" labels={{ keep: "Không hủy" }} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveClass("border-t-warning");
    expect(within(dialog).getByRole("button", { name: "Xóa vĩnh viễn" })).toHaveClass("bg-primary");
    expect(within(dialog).getByRole("button", { name: "Không hủy" })).toBeInTheDocument();
  });
});
