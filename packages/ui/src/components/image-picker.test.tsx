import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../test/a11y.js";
import { UiLocaleProvider } from "../lib/i18n.js";
import { ImagePicker } from "./image-picker.js";

const fileInput = (c: HTMLElement) => c.querySelector('input[type="file"]') as HTMLInputElement;

describe("ImagePicker", () => {
  it("chưa có ảnh: hiện fallback, nút Tải ảnh lên, không có Gỡ ảnh; gợi ý gắn aria-describedby; không vi phạm a11y", async () => {
    const { container } = render(<ImagePicker name="An Phát" fallback={<svg data-fallback />} hint="PNG/JPG/WebP, tối đa 1 MB" onPick={() => {}} onRemove={() => {}} />);
    expect(container.querySelector("[data-fallback]")).toBeTruthy();
    const upload = screen.getByRole("button", { name: "Tải ảnh lên" });
    expect(upload).toHaveAccessibleDescription("PNG/JPG/WebP, tối đa 1 MB");
    expect(screen.queryByRole("button", { name: "Gỡ ảnh" })).toBeNull();
    expect(fileInput(container)).toHaveAttribute("accept", "image/png,image/jpeg,image/webp");
    await expectNoA11yViolations(container);
  });

  it("có ảnh: xem trước có alt, nút Đổi ảnh + Gỡ ảnh (danger-outline); bấm Gỡ gọi onRemove", async () => {
    const onRemove = vi.fn();
    const { container } = render(<ImagePicker name="An Phát" src="data:image/png;base64,AA==" onPick={() => {}} onRemove={onRemove} />);
    expect(screen.getByRole("img", { name: "Ảnh hiện tại" })).toHaveAttribute("src", "data:image/png;base64,AA==");
    expect(screen.getByRole("button", { name: "Đổi ảnh" })).toBeInTheDocument();
    const remove = screen.getByRole("button", { name: "Gỡ ảnh" });
    await userEvent.click(remove);
    expect(onRemove).toHaveBeenCalledOnce();
    await expectNoA11yViolations(container);
  });

  it("chọn file → onPick với file đó; ô file ẩn khỏi bàn phím (nút là đường vào)", () => {
    const onPick = vi.fn();
    const { container } = render(<ImagePicker name="A" onPick={onPick} />);
    const input = fileInput(container);
    expect(input).toHaveAttribute("tabindex", "-1");
    const f = new File([new Uint8Array([0x89, 0x50])], "logo.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [f] } });
    expect(onPick).toHaveBeenCalledWith(f);
  });

  it("bàn phím: Tab tới Đổi ảnh, Enter mở hộp chọn file; Tab tiếp tới Gỡ ảnh, Space gọi onRemove", async () => {
    const onRemove = vi.fn();
    const { container } = render(<ImagePicker name="A" src="data:image/png;base64,AA==" onPick={() => {}} onRemove={onRemove} />);
    const open = vi.spyOn(fileInput(container), "click");
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Đổi ảnh" })).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(open).toHaveBeenCalledOnce();
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Gỡ ảnh" })).toHaveFocus();
    await userEvent.keyboard(" ");
    expect(onRemove).toHaveBeenCalledOnce();
  });

  it("tròn: dùng Avatar (chữ viết tắt khi chưa có ảnh); lỗi hiện role=alert; khóa khi disabled; nhãn EN", async () => {
    const { container } = render(
      <UiLocaleProvider locale="en">
        <ImagePicker shape="circle" name="Lê Minh Châu" error="Too big" disabled onPick={() => {}} />
      </UiLocaleProvider>,
    );
    expect(screen.getByRole("img", { name: "Lê Minh Châu" })).toHaveTextContent("MC");
    expect(screen.getByRole("alert")).toHaveTextContent("Too big");
    expect(screen.getByRole("button", { name: "Upload image" })).toBeDisabled();
    await expectNoA11yViolations(container);
  });
});
