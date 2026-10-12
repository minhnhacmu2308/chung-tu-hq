import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { AppearancePanel } from "../components/appearance-panel.js";
import { AssistantPanel, ChatComposer } from "../components/assistant.js";
import { Dialog, DialogContent } from "../components/dialog.js";
import { StatusBadge } from "../components/feedback.js";
import { Sidebar } from "../components/sidebar.js";
import { Spinner } from "../components/spinner.js";
import { Stepper } from "../components/workflow.js";
import { DEFAULT_APPEARANCE } from "../theme/appearance.js";
import { UiLocaleProvider } from "./i18n.js";

const en = (ui: ReactNode) => render(<UiLocaleProvider locale="en">{ui}</UiLocaleProvider>);

describe("Đa ngôn ngữ (EN)", () => {
  it("mặc định tiếng Việt khi không có provider", () => {
    render(<Spinner />);
    expect(screen.getByRole("status")).toHaveTextContent("Đang tải");
  });

  it("Spinner, StatusBadge đổi sang tiếng Anh", () => {
    en(<><Spinner /><StatusBadge status="CONFLICT" /></>);
    expect(screen.getByRole("status")).toHaveTextContent("Loading");
    expect(screen.getByText("Conflict")).toBeInTheDocument();
  });

  it("Dialog: nút điều khiển tiếng Anh", () => {
    en(<Dialog open><DialogContent title="New report">x</DialogContent></Dialog>);
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show as side panel" })).toBeInTheDocument();
  });

  it("Sidebar, Stepper: nhãn điều hướng tiếng Anh", () => {
    en(
      <>
        <Sidebar brand={{ logo: "K", name: "KhaiBao" }} items={[{ id: "a", label: "Overview", href: "#" }]} collapsed={false} onCollapsedChange={() => {}} />
        <Stepper steps={[{ id: "a", label: "Create" }]} currentId="a" />
      </>,
    );
    expect(screen.getByRole("navigation", { name: "Main navigation" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Collapse menu" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Dossier steps" })).toBeInTheDocument();
  });

  it("Trợ lý AI: chế độ hiển thị và ô soạn tin tiếng Anh", () => {
    en(
      <AssistantPanel open onOpenChange={() => {}} mode="docked" onModeChange={() => {}} name="Assistant" composer={<ChatComposer onSend={() => {}} />}>
        x
      </AssistantPanel>,
    );
    expect(screen.getByRole("button", { name: "Full screen" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Message" })).toHaveAttribute("placeholder", "Ask a question or drop files here…");
    expect(screen.getByRole("button", { name: "Send" })).toBeInTheDocument();
  });

  it("AppearancePanel: nhãn và tên màu tiếng Anh; labels prop vẫn ghi đè được", async () => {
    en(<AppearancePanel value={DEFAULT_APPEARANCE} onChange={() => {}} locked={["brand"]} labels={{ reset: "Restore" }} />);
    expect(screen.getByRole("group", { name: "Density" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Blue" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: /Brand color.*locked by organization/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Restore" })).toBeInTheDocument();
    await userEvent.click(screen.getByText("Dark"));
  });
});

describe("Ghi chú chỉnh màu thương hiệu theo ngôn ngữ", () => {
  it("ghép câu từ dữ liệu có cấu trúc", async () => {
    const { createBrandTheme } = await import("../theme/brand-theme.js");
    const { adjustments } = createBrandTheme("#EA580C");
    const { rerender } = render(<AppearancePanel value={DEFAULT_APPEARANCE} onChange={() => {}} brandAdjustments={adjustments} />);
    expect(screen.getByText(/Giao diện sáng: #EA580C → #[0-9A-F]{6} \(đủ tương phản 4\.5:1\)/)).toBeInTheDocument();
    rerender(<UiLocaleProvider locale="en"><AppearancePanel value={DEFAULT_APPEARANCE} onChange={() => {}} brandAdjustments={adjustments} /></UiLocaleProvider>);
    expect(screen.getByText(/Light theme: #EA580C → #[0-9A-F]{6} \(meets 4\.5:1 contrast\)/)).toBeInTheDocument();
  });
});
