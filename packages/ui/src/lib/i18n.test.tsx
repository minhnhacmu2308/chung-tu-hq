import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { AppearancePanel } from "../components/appearance-panel.js";
import { AssistantPanel, ChatComposer } from "../components/assistant.js";
import { DatePicker, formatIsoDate, parseTypedDate } from "../components/date-picker.js";
import { Dialog, DialogContent } from "../components/dialog.js";
import { StatusBadge, statusLabel } from "../components/feedback.js";
import { Sidebar } from "../components/sidebar.js";
import { Spinner } from "../components/spinner.js";
import { Stepper } from "../components/workflow.js";
import { DEFAULT_APPEARANCE } from "../theme/appearance.js";
import { defineMessages, fill, pickMessages, UI_LOCALES, UiLocaleProvider, useMessages } from "./i18n.js";

const en = (ui: ReactNode) => render(<UiLocaleProvider locale="en">{ui}</UiLocaleProvider>);
const zh = (ui: ReactNode) => render(<UiLocaleProvider locale="zh">{ui}</UiLocaleProvider>);

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
    expect(screen.getByRole("group", { name: /Primary color.*locked by organization/ })).toBeDisabled();
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

describe("Đa ngôn ngữ (ZH – tiếng Trung giản thể)", () => {
  it("Spinner, StatusBadge đổi sang tiếng Trung", () => {
    zh(<><Spinner /><StatusBadge status="CONFLICT" /><StatusBadge status="GREEN_CHANNEL" /></>);
    expect(screen.getByRole("status")).toHaveTextContent("加载中");
    expect(screen.getByText("冲突")).toBeInTheDocument();
    expect(screen.getByText("绿色通道")).toBeInTheDocument();
  });

  it("StatusBadge: label truyền vào vẫn thắng; statusLabel theo ngôn ngữ", () => {
    zh(<StatusBadge status="CONFLICT" label="Tùy chỉnh" />);
    expect(screen.getByText("Tùy chỉnh")).toBeInTheDocument();
    expect(statusLabel("DOSSIER_CLEARED", "vi")).toBe("Đã thông quan");
    expect(statusLabel("DOSSIER_CLEARED", "en")).toBe("Cleared");
    expect(statusLabel("DOSSIER_CLEARED", "zh")).toBe("已通关");
  });

  it("Dialog: nút điều khiển tiếng Trung", () => {
    zh(<Dialog open><DialogContent title="新报告">x</DialogContent></Dialog>);
    expect(screen.getByRole("button", { name: "关闭" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "以右侧面板显示" })).toBeInTheDocument();
  });

  it("Sidebar, Stepper: nhãn điều hướng tiếng Trung", () => {
    zh(
      <>
        <Sidebar brand={{ logo: "K", name: "KhaiBao" }} items={[{ id: "a", label: "概览", href: "#" }]} collapsed={false} onCollapsedChange={() => {}} />
        <Stepper steps={[{ id: "a", label: "创建" }]} currentId="a" />
      </>,
    );
    expect(screen.getByRole("navigation", { name: "主导航" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "收起菜单" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "档案处理步骤" })).toBeInTheDocument();
  });

  it("DatePicker: hiển thị yyyy/MM/dd, gõ yyyy/M/d, tuần bắt đầu thứ Hai, nhãn tiếng Trung", async () => {
    const onChange = vi.fn();
    zh(<DatePicker aria-label="发票日期" value="2024-12-05" onChange={onChange} />);
    const input = screen.getByRole("textbox", { name: "发票日期" });
    expect(input).toHaveValue("2024/12/05");
    expect(input).toHaveAttribute("placeholder", "yyyy/mm/dd");
    await userEvent.clear(input);
    await userEvent.type(input, "2025/1/9{Enter}");
    expect(onChange).toHaveBeenLastCalledWith("2025-01-09");
    await userEvent.click(screen.getByRole("button", { name: "打开日历" }));
    expect(document.querySelector("th")).toHaveAttribute("aria-label", "星期一");
  });

  it("formatIsoDate / parseTypedDate theo zh", () => {
    expect(formatIsoDate("2024-12-05", "zh")).toBe("2024/12/05");
    expect(parseTypedDate("2024/12/5", "zh")).toBe("2024-12-05");
    expect(parseTypedDate("2024-12-05", "zh")).toBe("2024-12-05");
    expect(parseTypedDate("2024年12月5日", "zh")).toBe("2024-12-05");
    expect(parseTypedDate("05/12/2024", "zh")).toBeNull();
    expect(parseTypedDate("2024/02/31", "zh")).toBeNull();
  });

  it("AppearancePanel: nhãn và tên màu tiếng Trung", () => {
    zh(<AppearancePanel value={DEFAULT_APPEARANCE} onChange={() => {}} />);
    expect(screen.getByRole("group", { name: "密度" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "蓝色" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "恢复默认" })).toBeInTheDocument();
  });
});

describe("Tiện ích bộ nhãn", () => {
  const M = defineMessages({
    vi: { save: "Lưu", left: "Còn {n} ngày" },
    en: { save: "Save", left: "{n} days left" },
    zh: { save: "保存", left: "还剩 {n} 天" },
  });

  it("fill: thay tham số, giữ nguyên chỗ không có giá trị, thay mọi lần xuất hiện", () => {
    expect(fill("Còn {n} ngày", { n: 3 })).toBe("Còn 3 ngày");
    expect(fill("{a} / {b}", { a: "x" })).toBe("x / {b}");
    expect(fill("{n}+{n}", { n: 0 })).toBe("0+0");
    expect(fill("Không có tham số", {})).toBe("Không có tham số");
  });

  it("pickMessages: chọn đúng bộ nhãn theo ngôn ngữ", () => {
    expect(pickMessages(M, "vi").save).toBe("Lưu");
    expect(pickMessages(M, "en").save).toBe("Save");
    expect(fill(pickMessages(M, "zh").left, { n: 2 })).toBe("还剩 2 天");
  });

  it("defineMessages: trả lại chính bộ nhãn; đủ cả 3 ngôn ngữ", () => {
    expect(Object.keys(M).sort()).toEqual([...UI_LOCALES].sort());
    // Kiểm tra lúc biên dịch (tsc): thiếu ngôn ngữ hoặc thiếu khóa ở một ngôn ngữ là lỗi.
    // @ts-expect-error thiếu bản zh
    defineMessages({ vi: { a: "A" }, en: { a: "A" } });
    // @ts-expect-error bản zh thiếu khóa b
    defineMessages({ vi: { a: "A", b: "B" }, en: { a: "A", b: "B" }, zh: { a: "A" } });
  });

  it("useMessages: theo ngôn ngữ của provider, overrides ghi đè từng khóa", () => {
    function Probe({ overrides }: { overrides?: { save?: string } }) {
      const t = useMessages(M, overrides);
      return <p>{t.save} · {fill(t.left, { n: 1 })}</p>;
    }
    zh(<><Probe /><Probe overrides={{ save: "存" }} /></>);
    expect(screen.getByText("保存 · 还剩 1 天")).toBeInTheDocument();
    expect(screen.getByText("存 · 还剩 1 天")).toBeInTheDocument();
  });
});
