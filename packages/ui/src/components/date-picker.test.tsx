import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../test/a11y.js";
import { UiLocaleProvider } from "../lib/i18n.js";
import {
  DatePicker,
  DateRangePicker,
  dateToIso,
  formatIsoDate,
  isoToDate,
  parseTypedDate,
  type IsoDateRange,
} from "./date-picker.js";
import { Field } from "./field.js";

// jsdom thiếu các API Radix Popper dùng.
beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Element.prototype.scrollIntoView ??= function () {};
});

const ORIGINAL_TZ = process.env.TZ;
afterEach(() => {
  process.env.TZ = ORIGINAL_TZ;
});

function Controlled({ initial = null, onChange = vi.fn(), min, max }: { initial?: string | null; onChange?: (v: string | null) => void; min?: string; max?: string }) {
  const [v, setV] = useState<string | null>(initial);
  return (
    <Field label="Ngày hóa đơn" hint="Theo invoice">
      <DatePicker value={v} onChange={(n) => { setV(n); onChange(n); }} {...(min ? { min } : {})} {...(max ? { max } : {})} />
    </Field>
  );
}

describe("chuyển đổi ngày", () => {
  it("ISO ↔ Date giữ nguyên ngày ở mọi múi giờ (không lệch do UTC)", () => {
    for (const tz of ["Asia/Ho_Chi_Minh", "America/Los_Angeles", "Pacific/Kiritimati", "UTC"]) {
      process.env.TZ = tz;
      for (const iso of ["2024-12-15", "2024-01-01", "2024-02-29", "2024-12-31"]) {
        expect(dateToIso(isoToDate(iso)!), `${tz} ${iso}`).toBe(iso);
      }
    }
  });

  it("từ chối ISO sai hoặc ngày không tồn tại", () => {
    expect(isoToDate("2024-02-31")).toBeUndefined();
    expect(isoToDate("15/12/2024")).toBeUndefined();
    expect(isoToDate(null)).toBeUndefined();
  });

  it("đọc ngày gõ tay theo ngôn ngữ, chấp nhận / . - và 1 chữ số", () => {
    expect(parseTypedDate("15/12/2024", "vi")).toBe("2024-12-15");
    expect(parseTypedDate("5.1.2024", "vi")).toBe("2024-01-05");
    expect(parseTypedDate("15-12-2024", "vi")).toBe("2024-12-15");
    expect(parseTypedDate("12/15/2024", "en")).toBe("2024-12-15");
    expect(parseTypedDate("31/02/2024", "vi")).toBeNull();
    expect(parseTypedDate("15/12/24", "vi")).toBeNull();
    expect(parseTypedDate("abc", "vi")).toBeNull();
  });

  it("hiển thị theo ngôn ngữ", () => {
    expect(formatIsoDate("2024-12-05", "vi")).toBe("05/12/2024");
    expect(formatIsoDate("2024-12-05", "en")).toBe("12/05/2024");
    expect(formatIsoDate(null, "vi")).toBe("");
  });
});

describe("DatePicker", () => {
  it("ô nhập có tên từ Field, gợi ý liên kết, hiện dd/MM/yyyy", () => {
    render(<Controlled initial="2024-12-15" />);
    const input = screen.getByRole("textbox", { name: "Ngày hóa đơn" });
    expect(input).toHaveValue("15/12/2024");
    expect(input).toHaveAccessibleDescription("Theo invoice");
  });

  it("gõ tay rồi rời ô → trả ISO", async () => {
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);
    const input = screen.getByRole("textbox", { name: "Ngày hóa đơn" });
    await userEvent.type(input, "15/12/2024");
    await userEvent.tab();
    expect(onChange).toHaveBeenCalledWith("2024-12-15");
    expect(input).toHaveValue("15/12/2024");
  });

  it("gõ sai → aria-invalid + thông báo, không gọi onChange", async () => {
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);
    const input = screen.getByRole("textbox", { name: "Ngày hóa đơn" });
    await userEvent.type(input, "32/13/2024{Enter}");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("Ngày không hợp lệ");
    expect(input).toHaveAccessibleDescription(/Ngày không hợp lệ/);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("ngày ngoài khoảng min/max → báo lỗi", async () => {
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} min="2024-12-05" max="2024-12-20" />);
    await userEvent.type(screen.getByRole("textbox"), "01/12/2024{Enter}");
    expect(screen.getByRole("alert")).toHaveTextContent("ngoài khoảng");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("chọn trên lịch → ISO đúng ngày bấm, đóng lịch; tuần bắt đầu Thứ Hai", async () => {
    process.env.TZ = "America/Los_Angeles"; // múi giờ âm – nơi toISOString hay làm lệch 1 ngày
    const onChange = vi.fn();
    render(<Controlled initial="2024-12-15" onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "Mở lịch" }));
    expect(document.querySelector("th")).toHaveAttribute("aria-label", "Thứ Hai");
    await userEvent.click(screen.getByRole("button", { name: /ngày 20 tháng 12 năm 2024/ }));
    expect(onChange).toHaveBeenCalledWith("2024-12-20");
    expect(screen.queryByRole("grid")).not.toBeInTheDocument();
  });

  it("ngày trước min bị khóa trên lịch", async () => {
    render(<Controlled initial="2024-12-15" min="2024-12-05" />);
    await userEvent.click(screen.getByRole("button", { name: "Mở lịch" }));
    expect(screen.getByRole("button", { name: /ngày 3 tháng 12 năm 2024/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /ngày 6 tháng 12 năm 2024/ })).toBeEnabled();
  });

  it("nút xóa đưa về null", async () => {
    const onChange = vi.fn();
    render(<Controlled initial="2024-12-15" onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "Xóa ngày" }));
    expect(onChange).toHaveBeenCalledWith(null);
    expect(screen.getByRole("textbox")).toHaveValue("");
  });

  it("tiếng Anh: MM/dd/yyyy, tuần bắt đầu Chủ nhật, nhãn tiếng Anh", async () => {
    const onChange = vi.fn();
    render(
      <UiLocaleProvider locale="en">
        <DatePicker aria-label="Invoice date" value="2024-12-15" onChange={onChange} />
      </UiLocaleProvider>,
    );
    const input = screen.getByRole("textbox", { name: "Invoice date" });
    expect(input).toHaveValue("12/15/2024");
    await userEvent.click(screen.getByRole("button", { name: "Open calendar" }));
    expect(document.querySelector("th")).toHaveAttribute("aria-label", "Sunday");
  });

  it("không vi phạm a11y khi đóng, khi lỗi và khi mở lịch", async () => {
    const { container } = render(<Controlled initial="2024-12-15" />);
    await expectNoA11yViolations(container);
    await userEvent.clear(screen.getByRole("textbox"));
    await userEvent.type(screen.getByRole("textbox"), "xx{Enter}");
    await expectNoA11yViolations(container);
    await userEvent.click(screen.getByRole("button", { name: "Mở lịch" }));
    await expectNoA11yViolations(document.body);
  });
});

describe("DateRangePicker", () => {
  function Range({ onChange = vi.fn(), initial = { from: null, to: null }, hint }: { onChange?: (v: IsoDateRange) => void; initial?: IsoDateRange; hint?: string }) {
    const [v, setV] = useState<IsoDateRange>(initial);
    return (
      <Field label="Kỳ báo cáo" {...(hint ? { hint } : {})}>
        <DateRangePicker value={v} onChange={(n) => { setV(n); onChange(n); }} min="2024-12-01" max="2024-12-31" numberOfMonths={1} />
      </Field>
    );
  }
  const fromBox = () => screen.getByRole("textbox", { name: "Kỳ báo cáo Từ ngày" });
  const toBox = () => screen.getByRole("textbox", { name: "Kỳ báo cáo Đến ngày" }); // ô Đến ngày cũng được đọc kèm nhãn Field

  it("hai ô nhập có tên riêng, nhãn Field gắn vào ô Từ ngày, gợi ý liên kết cả hai", async () => {
    render(<Range initial={{ from: "2024-12-10", to: "2024-12-15" }} hint="Theo tháng" />);
    expect(fromBox()).toHaveValue("10/12/2024");
    expect(toBox()).toHaveValue("15/12/2024");
    expect(fromBox()).toHaveAccessibleDescription("Theo tháng");
    expect(toBox()).toHaveAccessibleDescription("Theo tháng");
    await userEvent.click(screen.getByText("Kỳ báo cáo"));
    expect(fromBox()).toHaveFocus();
  });

  it("gõ tay hai ô (rời ô / Enter) → trả 2 ISO", async () => {
    const onChange = vi.fn();
    render(<Range onChange={onChange} />);
    await userEvent.type(fromBox(), "10.12.2024");
    await userEvent.tab();
    expect(onChange).toHaveBeenLastCalledWith({ from: "2024-12-10", to: null });
    expect(fromBox()).toHaveValue("10/12/2024");
    await userEvent.type(toBox(), "15/12/2024{Enter}");
    expect(onChange).toHaveBeenLastCalledWith({ from: "2024-12-10", to: "2024-12-15" });
  });

  it.each([
    ["sai định dạng", "32/12/2024", "Đến ngày: Ngày không hợp lệ (dd/mm/yyyy)"],
    ["ngoài min/max", "05/01/2025", "Đến ngày: Ngày nằm ngoài khoảng cho phép"],
    ["Từ > Đến", "05/12/2024", "Đến ngày: Từ ngày phải trước hoặc bằng Đến ngày"],
  ])("lỗi %s → aria-invalid + thông báo gắn đúng ô, không gọi onChange", async (_case, typed, message) => {
    const onChange = vi.fn();
    render(<Range onChange={onChange} initial={{ from: "2024-12-10", to: null }} />);
    await userEvent.type(toBox(), `${typed}{Enter}`);
    expect(toBox()).toHaveAttribute("aria-invalid", "true");
    expect(fromBox()).not.toHaveAttribute("aria-invalid");
    expect(screen.getByRole("alert")).toHaveTextContent(message);
    expect(toBox()).toHaveAccessibleDescription(message);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("chọn trên lịch: từ ngày → đến ngày trả 2 ISO, đóng lịch, ô nhập đồng bộ", async () => {
    process.env.TZ = "America/Los_Angeles";
    const onChange = vi.fn();
    render(<Range onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "Mở lịch" }));
    await userEvent.click(screen.getByRole("button", { name: /ngày 10 tháng 12 năm 2024/ }));
    expect(onChange).toHaveBeenLastCalledWith({ from: "2024-12-10", to: null });
    expect(screen.getByRole("grid")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /ngày 15 tháng 12 năm 2024/ }));
    expect(onChange).toHaveBeenLastCalledWith({ from: "2024-12-10", to: "2024-12-15" });
    expect(screen.queryByRole("grid")).not.toBeInTheDocument();
    expect(fromBox()).toHaveValue("10/12/2024");
    expect(toBox()).toHaveValue("15/12/2024");
  });

  it("bấm cùng một ngày hai lần → khoảng 1 ngày, đóng lịch", async () => {
    const onChange = vi.fn();
    render(<Range onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "Mở lịch" }));
    await userEvent.click(screen.getByRole("button", { name: /ngày 12 tháng 12 năm 2024/ }));
    await userEvent.click(screen.getByRole("button", { name: /ngày 12 tháng 12 năm 2024/ }));
    expect(onChange).toHaveBeenLastCalledWith({ from: "2024-12-12", to: "2024-12-12" });
    expect(screen.queryByRole("grid")).not.toBeInTheDocument();
  });

  it("bấm ngày cuối trước ngày đầu → tự đảo thứ tự", async () => {
    const onChange = vi.fn();
    render(<Range onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "Mở lịch" }));
    await userEvent.click(screen.getByRole("button", { name: /ngày 20 tháng 12 năm 2024/ }));
    await userEvent.click(screen.getByRole("button", { name: /ngày 8 tháng 12 năm 2024/ }));
    expect(onChange).toHaveBeenLastCalledWith({ from: "2024-12-08", to: "2024-12-20" });
  });

  it("đã gõ Từ ngày → mở lịch hiện đúng tháng, cú bấm đầu chọn Đến ngày", async () => {
    const onChange = vi.fn();
    render(<Range onChange={onChange} />);
    await userEvent.type(fromBox(), "05/12/2024{Enter}");
    fromBox().focus();
    await userEvent.keyboard("{Alt>}{ArrowDown}{/Alt}");
    expect(screen.getByRole("gridcell", { selected: true })).toHaveTextContent("5");
    await userEvent.click(screen.getByRole("button", { name: /ngày 9 tháng 12 năm 2024/ }));
    expect(onChange).toHaveBeenLastCalledWith({ from: "2024-12-05", to: "2024-12-09" });
    expect(screen.queryByRole("grid")).not.toBeInTheDocument();
  });

  it("nút xóa đưa cả hai ô về rỗng", async () => {
    const onChange = vi.fn();
    render(<Range onChange={onChange} initial={{ from: "2024-12-10", to: "2024-12-15" }} />);
    await userEvent.click(screen.getByRole("button", { name: "Xóa ngày" }));
    expect(onChange).toHaveBeenLastCalledWith({ from: null, to: null });
    expect(fromBox()).toHaveValue("");
    expect(toBox()).toHaveValue("");
  });

  it("tiếng Anh: MM/dd/yyyy, nhãn From/To, thông báo lỗi tiếng Anh", async () => {
    const onChange = vi.fn();
    render(
      <UiLocaleProvider locale="en">
        <DateRangePicker aria-label="Period" value={{ from: "2024-12-10", to: null }} onChange={onChange} />
      </UiLocaleProvider>,
    );
    const from = screen.getByRole("textbox", { name: "Period – From" });
    const to = screen.getByRole("textbox", { name: "Period – To" });
    expect(from).toHaveValue("12/10/2024");
    await userEvent.type(to, "12/05/2024{Enter}");
    expect(screen.getByRole("alert")).toHaveTextContent("To: Start date must be on or before end date");
    await userEvent.clear(to);
    await userEvent.type(to, "12/20/2024{Enter}");
    expect(onChange).toHaveBeenLastCalledWith({ from: "2024-12-10", to: "2024-12-20" });
    expect(screen.getByRole("button", { name: "Open calendar" })).toBeInTheDocument();
  });

  it("không vi phạm a11y khi đóng, khi lỗi và khi mở lịch", async () => {
    const { container } = render(<Range hint="Theo tháng" />);
    await expectNoA11yViolations(container);
    await userEvent.type(fromBox(), "xx{Enter}");
    await expectNoA11yViolations(container);
    await userEvent.click(screen.getByRole("button", { name: "Mở lịch" }));
    await expectNoA11yViolations(document.body);
  });
});

describe("DateRangePicker trong Field – tên truy cập của ô Đến ngày", () => {
  it("ô Đến ngày được đọc kèm nhãn Field", async () => {
    const { Field } = await import("./field.js");
    render(<Field label="Kỳ báo cáo"><DateRangePicker value={{ from: null, to: null }} onChange={() => {}} /></Field>);
    expect(screen.getByRole("textbox", { name: "Kỳ báo cáo Đến ngày" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Kỳ báo cáo Từ ngày" })).toBeInTheDocument();
  });
});
