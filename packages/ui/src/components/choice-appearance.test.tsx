import { render, screen } from "@testing-library/react";
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
