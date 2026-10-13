import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../test/a11y.js";
import { AssistantLauncher, AssistantPanel, AssistantWelcome, ChatComposer, ChatMessage, SuggestionChips, type AssistantMode } from "./assistant.js";

// jsdom không vẽ canvas → thay robot-heads bằng canvas giả ghi lại trạng thái.
vi.mock("robot-heads", () => ({ RobotHead: (p: Record<string, unknown>) => <canvas data-state={p.state} /> }));

function Harness({ onSend = vi.fn(), onClose = vi.fn() }) {
  const [mode, setMode] = useState<AssistantMode>("docked");
  return (
    <AssistantPanel
      open
      onOpenChange={onClose}
      mode={mode}
      onModeChange={setMode}
      name="Verdi"
      tag="THACO"
      historyCount={20}
      composer={<ChatComposer onSend={onSend} accept=".pdf" onMicClick={() => {}} />}
    >
      <AssistantWelcome role="Trợ lý chứng từ" name="Verdi" description="Kéo chứng từ vào đây" />
      <SuggestionChips suggestions={["Lô này thiếu chứng từ gì?"]} onPick={(s) => onSend(s, [])} />
      <ChatMessage role="user">Xin chào</ChatMessage>
    </AssistantPanel>
  );
}

describe("AssistantPanel", () => {
  it("là vùng có tên, chuyển được 3 chế độ hiển thị", async () => {
    render(<Harness />);
    const panel = screen.getByRole("complementary", { name: "Verdi" });
    expect(panel).toHaveAttribute("data-mode", "docked");
    await userEvent.click(screen.getByRole("button", { name: "Toàn màn hình" }));
    expect(panel).toHaveAttribute("data-mode", "fullscreen");
    expect(screen.getByRole("button", { name: "Toàn màn hình" })).toHaveAttribute("aria-pressed", "true");
  });

  it("nút đóng gọi onOpenChange(false); nút lịch sử có số đếm", async () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    expect(screen.getByRole("button", { name: "Lịch sử hội thoại (20)" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Đóng trợ lý" }));
    expect(onClose).toHaveBeenCalledWith(false);
  });

  it("bấm gợi ý gửi câu hỏi đó", async () => {
    const onSend = vi.fn();
    render(<Harness onSend={onSend} />);
    await userEvent.click(screen.getByRole("button", { name: "Lô này thiếu chứng từ gì?" }));
    expect(onSend).toHaveBeenCalledWith("Lô này thiếu chứng từ gì?", []);
  });
});

describe("ChatComposer", () => {
  it("Enter gửi, Shift+Enter xuống dòng, xóa ô sau khi gửi", async () => {
    const onSend = vi.fn();
    render(<ChatComposer onSend={onSend} />);
    const box = screen.getByRole("textbox", { name: "Nội dung tin nhắn" });
    await userEvent.type(box, "Dòng 1{Shift>}{Enter}{/Shift}Dòng 2{Enter}");
    expect(onSend).toHaveBeenCalledWith("Dòng 1\nDòng 2", []);
    expect(box).toHaveValue("");
  });

  it("không gửi khi rỗng hoặc đang chờ AI", async () => {
    const onSend = vi.fn();
    const { rerender } = render(<ChatComposer onSend={onSend} />);
    expect(screen.getByRole("button", { name: "Gửi" })).toBeDisabled();
    rerender(<ChatComposer onSend={onSend} busy />);
    await userEvent.type(screen.getByRole("textbox"), "abc{Enter}");
    expect(onSend).not.toHaveBeenCalled();
  });

  it("đính kèm file rồi gửi kèm", async () => {
    const onSend = vi.fn();
    render(<ChatComposer onSend={onSend} accept=".pdf" />);
    const file = new File(["%PDF"], "invoice.pdf", { type: "application/pdf" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, file);
    expect(screen.getByText("invoice.pdf")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Gửi" }));
    expect(onSend).toHaveBeenCalledWith("", [file]);
  });

  it("toàn bộ panel không vi phạm a11y", async () => {
    const { container } = render(<Harness />);
    await expectNoA11yViolations(container);
  });
});

describe("AssistantLauncher", () => {
  it("là nút có tên, chứa robot theo trạng thái, bấm thì gọi onClick", async () => {
    const onClick = vi.fn();
    const { container } = render(<AssistantLauncher onClick={onClick} state="thinking" />);
    const button = screen.getByRole("button", { name: "Mở trợ lý AI" });
    expect(container.querySelector("canvas")).toHaveAttribute("data-state", "thinking");
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it("mặc định robot ở trạng thái idle", () => {
    const { container } = render(<AssistantLauncher />);
    expect(container.querySelector("canvas")).toHaveAttribute("data-state", "idle");
  });
});
