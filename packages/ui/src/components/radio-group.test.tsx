import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { expectNoA11yViolations } from "../../test/a11y.js";
import { RadioGroup } from "./radio-group.js";

const OPTIONS = [
  { value: "cnc", label: "Máy công cụ (CNC, máy phay, máy tiện)" },
  { value: "3d", label: "Máy in 3D / thiết bị tự động hoá nhẹ" },
  { value: "other", label: "Khác", description: "Ghi rõ ở ô trả lời khác" },
];
function Demo({ initial = null as string | null }) {
  const [v, setV] = useState<string | null>(initial);
  return (
    <>
      <RadioGroup label="Thanh trượt này dùng cho loại máy nào?" description="Chọn một" options={OPTIONS} value={v} onChange={setV} />
      <output>{v ?? "—"}</output>
    </>
  );
}

describe("RadioGroup", () => {
  it("nhóm có tên (legend) + mô tả; mỗi lựa chọn là radio có nhãn và mô tả", () => {
    render(<Demo />);
    const group = screen.getByRole("radiogroup", { name: "Thanh trượt này dùng cho loại máy nào?" });
    expect(group).toHaveAccessibleDescription("Chọn một");
    expect(screen.getAllByRole("radio")).toHaveLength(3);
    expect(screen.getByRole("radio", { name: /Khác/ })).toHaveAccessibleDescription("Ghi rõ ở ô trả lời khác");
  });
  it("bấm chuột chọn; phím mũi tên chuyển lựa chọn", async () => {
    const u = userEvent.setup();
    render(<Demo />);
    await u.click(screen.getByText("Máy in 3D / thiết bị tự động hoá nhẹ"));
    expect(screen.getByRole("status")).toHaveTextContent("3d");
    await u.keyboard("{ArrowDown}");
    expect(screen.getByRole("status")).toHaveTextContent("other");
  });
  it("disabled không chọn được; giá trị ban đầu được đánh dấu", async () => {
    const u = userEvent.setup();
    render(<><RadioGroup label="X" options={OPTIONS} value="cnc" onChange={() => {}} disabled /></>);
    expect(screen.getByRole("radio", { name: /Máy công cụ/ })).toBeChecked();
    await u.click(screen.getByText("Khác"));
    expect(screen.getByRole("radio", { name: /Khác/ })).not.toBeChecked();
  });
  it("giá trị nhiều chữ/có dấu (nhãn làm giá trị) → mô tả vẫn gắn đúng", () => {
    render(<RadioGroup label="Q" options={[{ value: "Khác (ghi rõ)", label: "Khác (ghi rõ)", description: "Ghi rõ ở ô trả lời khác" }]} value={null} onChange={() => {}} />);
    expect(screen.getByRole("radio", { name: /^Khác \(ghi rõ\)/ })).toHaveAccessibleDescription("Ghi rõ ở ô trả lời khác");
  });
  it("xếp ngang (lựa chọn ngắn): báo hướng cho trình đọc màn hình, mặc định dọc; vẫn chọn được, không vi phạm a11y", async () => {
    const u = userEvent.setup();
    const short = [{ value: "KD", label: "Kinh doanh" }, { value: "GC", label: "Gia công" }];
    const onChange = (v: string) => void (document.title = v);
    const { container, rerender } = render(<RadioGroup label="Nhóm loại hình" options={short} value={null} onChange={onChange} />);
    expect(screen.getByRole("radiogroup")).toHaveAttribute("aria-orientation", "vertical");
    rerender(<RadioGroup label="Nhóm loại hình" options={short} value={null} onChange={onChange} orientation="horizontal" />);
    expect(screen.getByRole("radiogroup")).toHaveAttribute("aria-orientation", "horizontal");
    await u.click(screen.getByText("Gia công"));
    expect(document.title).toBe("GC");
    await expectNoA11yViolations(container);
  });
  it("không vi phạm a11y", async () => {
    const { container } = render(<Demo initial="cnc" />);
    await expectNoA11yViolations(container);
  });

  it("framed: khung viền, tên nhóm nằm trên đường viền như FieldFrame", async () => {
    const { container } = render(<RadioGroup framed label="Nhóm loại hình" options={OPTIONS} value={null} onChange={() => {}} />);
    const group = screen.getByRole("radiogroup", { name: "Nhóm loại hình" });
    expect(group).toHaveAttribute("data-frame");
    await expectNoA11yViolations(container);
  });
});
