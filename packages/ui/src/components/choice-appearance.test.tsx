import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../test/a11y.js";
import { DEFAULT_APPEARANCE, type Appearance, type OrgField } from "../theme/appearance.js";
import { AppearancePanel } from "./appearance-panel.js";
import { ColorSwatchPicker, SegmentedControl } from "./choice.js";

describe("SegmentedControl", () => {
  it("là nhóm radio có tên, chọn được bằng click", async () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl label="Mật độ" value="comfortable" onChange={onChange}
        options={[{ value: "compact", label: "Gọn" }, { value: "comfortable", label: "Chuẩn" }]} />,
    );
    expect(screen.getByRole("group", { name: "Mật độ" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Chuẩn" })).toBeChecked();
    await userEvent.click(screen.getByText("Gọn"));
    expect(onChange).toHaveBeenCalledWith("compact");
  });

  it("disabled: không đổi được", async () => {
    const onChange = vi.fn();
    render(<SegmentedControl label="Bo góc" value="a" disabled onChange={onChange} options={[{ value: "a", label: "A" }, { value: "b", label: "B" }]} />);
    await userEvent.click(screen.getByText("B"));
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("ColorSwatchPicker", () => {
  it("mỗi ô màu có tên đọc được; chọn trả về mã hex", async () => {
    const onChange = vi.fn();
    render(<ColorSwatchPicker label="Màu" value="#0F6B55" onChange={onChange}
      swatches={[{ id: "a", label: "Xanh lá", hex: "#0F6B55" }, { id: "b", label: "Xanh dương", hex: "#2563EB" }]} />);
    expect(screen.getByRole("radio", { name: "Xanh lá" })).toBeChecked();
    await userEvent.click(screen.getByRole("radio", { name: "Xanh dương" }));
    expect(onChange).toHaveBeenCalledWith("#2563EB");
  });
});

describe("AppearancePanel", () => {
  function Harness({ locked = [] as readonly OrgField[], onSpy = vi.fn() }) {
    const [v, setV] = useState<Appearance>(DEFAULT_APPEARANCE);
    return <AppearancePanel value={v} locked={locked} onChange={(n) => { setV(n); onSpy(n); }} />;
  }

  it("đổi tùy chọn → gọi onChange với cấu hình mới", async () => {
    const spy = vi.fn();
    render(<Harness onSpy={spy} />);
    await userEvent.click(screen.getByText("Tối"));
    await userEvent.click(screen.getByText("Gọn"));
    await userEvent.click(screen.getByRole("radio", { name: "Xanh dương" }));
    expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ mode: "dark", density: "compact", brand: "#2563EB" }));
  });

  it("trường doanh nghiệp đã khóa: không đổi được, có ghi chú", async () => {
    const spy = vi.fn();
    render(<Harness locked={["brand"]} onSpy={spy} />);
    expect(screen.getByRole("group", { name: /Màu thương hiệu.*đã khóa/ })).toBeDisabled();
    await userEvent.click(screen.getByRole("radio", { name: "Xanh dương" }));
    expect(spy).not.toHaveBeenCalled();
  });

  it("Đặt lại mặc định giữ nguyên trường bị khóa", async () => {
    const spy = vi.fn();
    function LockedHarness() {
      const [v, setV] = useState<Appearance>({ ...DEFAULT_APPEARANCE, brand: "#2563EB", density: "compact" });
      return <AppearancePanel value={v} locked={["brand"]} onChange={(n) => { setV(n); spy(n); }} />;
    }
    render(<LockedHarness />);
    await userEvent.click(screen.getByRole("button", { name: "Đặt lại mặc định" }));
    expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ brand: "#2563EB", density: DEFAULT_APPEARANCE.density }));
  });

  it("không vi phạm a11y", async () => {
    const { container } = render(<Harness />);
    await expectNoA11yViolations(container);
  });
});

describe("AppearancePanel – vị trí menu", () => {
  function Harness({ onSpy }: { onSpy: (a: Appearance) => void }) {
    const [v, setV] = useState<Appearance>(DEFAULT_APPEARANCE);
    return <AppearancePanel value={v} onChange={(n) => { setV(n); onSpy(n); }} />;
  }

  it("ba lựa chọn có hình mô phỏng; chọn bằng chuột và bàn phím; không vi phạm a11y", async () => {
    const onSpy = vi.fn();
    const { container } = render(<Harness onSpy={onSpy} />);
    const group = screen.getByRole("group", { name: "Vị trí menu" });
    const radios = within(group).getAllByRole("radio");
    expect(radios.map((r) => r.closest("label")!.textContent)).toEqual(["Bên trái", "Phía trên", "Bên phải"]);
    expect(within(group).getByRole("radio", { name: "Bên trái" })).toBeChecked();
    // Mỗi lựa chọn kèm một hình mô phỏng chỉ để nhìn (ẩn với trình đọc màn hình).
    expect(group.querySelectorAll("label > [aria-hidden=true]")).toHaveLength(3);

    await userEvent.click(within(group).getByRole("radio", { name: "Phía trên" }));
    expect(onSpy).toHaveBeenLastCalledWith(expect.objectContaining({ menuPosition: "top" }));
    await userEvent.keyboard("{ArrowRight}");
    expect(onSpy).toHaveBeenLastCalledWith(expect.objectContaining({ menuPosition: "right" }));
    await expectNoA11yViolations(container);
  });

  it("Đặt lại mặc định đưa menu về bên trái", async () => {
    const onSpy = vi.fn();
    render(<Harness onSpy={onSpy} />);
    await userEvent.click(screen.getByRole("radio", { name: "Bên phải" }));
    await userEvent.click(screen.getByRole("button", { name: "Đặt lại mặc định" }));
    expect(onSpy).toHaveBeenLastCalledWith(expect.objectContaining({ menuPosition: "left" }));
  });
});

describe("AppearancePanel – hình mô phỏng", () => {
  it("mọi nhóm lựa chọn đều có hình mô phỏng cho từng phương án, ẩn với trình đọc màn hình", () => {
    render(<AppearancePanel value={DEFAULT_APPEARANCE} onChange={() => {}} />);
    for (const name of ["Ngôn ngữ", "Giao diện", "Vị trí menu", "Mật độ", "Cỡ chữ", "Bo góc", "Nền trang", "Dải xám", "Mô tả trang", "Hiệu ứng con trỏ"]) {
      const group = screen.getByRole("group", { name });
      const radios = within(group).getAllByRole("radio");
      expect(radios.length).toBeGreaterThanOrEqual(2);
      expect(group.querySelectorAll("label > [aria-hidden=true]")).toHaveLength(radios.length);
    }
  });

  it("hình Sáng/Tối ép color-scheme tại chỗ; hình dải xám dùng đúng bảng xám của nó (không theo cấu hình hiện tại)", () => {
    render(<AppearancePanel value={{ ...DEFAULT_APPEARANCE, mode: "dark", gray: "gray" }} onChange={() => {}} />);
    const mode = screen.getByRole("group", { name: "Giao diện" });
    const light = within(mode).getByRole("radio", { name: "Sáng" }).closest("label")!;
    expect(light.querySelector('[class*="color-scheme:light"]')).not.toBeNull();
    expect(light.querySelector('[class*="color-scheme:dark"]')).toBeNull();
    const system = within(mode).getByRole("radio", { name: "Theo hệ thống" }).closest("label")!;
    expect(system.querySelector('[class*="color-scheme:light"]')).not.toBeNull();
    expect(system.querySelector('[class*="color-scheme:dark"]')).not.toBeNull();
    const gray = screen.getByRole("group", { name: "Dải xám" });
    expect(within(gray).getByRole("radio", { name: "Slate" }).closest("label")!.querySelector("[data-gray-preview=slate]")).not.toBeNull();
  });
});

describe("AppearancePanel – ngôn ngữ", () => {
  it("ba ngôn ngữ, mỗi tên viết bằng chính ngôn ngữ đó; chọn 中文 gọi onChange với locale zh", async () => {
    const onChange = vi.fn();
    render(<AppearancePanel value={DEFAULT_APPEARANCE} onChange={onChange} />);
    const group = screen.getByRole("group", { name: "Ngôn ngữ" });
    expect(within(group).getAllByRole("radio").map((r) => r.closest("label")!.textContent)).toEqual([
      expect.stringContaining("Tiếng Việt"),
      expect.stringContaining("English"),
      expect.stringContaining("中文"),
    ]);
    expect(within(group).getByRole("radio", { name: "Tiếng Việt" })).toBeChecked();
    await userEvent.click(within(group).getByRole("radio", { name: "中文" }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ locale: "zh" }));
  });
});

describe("AppearancePanel – chia nhóm", () => {
  it("ba tab; đổi tab đổi nhóm đang hiện", async () => {
    render(<AppearancePanel value={DEFAULT_APPEARANCE} onChange={() => {}} />);
    const tabs = screen.getAllByRole("tab").map((t) => t.textContent);
    expect(tabs).toEqual(["Chung", "Bố cục & chữ", "Màu sắc"]);
    const density = screen.getByRole("group", { name: "Mật độ" }).closest("[role=tabpanel]")!;
    expect(density).toHaveAttribute("data-state", "inactive");
    await userEvent.click(screen.getByRole("tab", { name: "Bố cục & chữ" }));
    expect(density).toHaveAttribute("data-state", "active");
  });
});
