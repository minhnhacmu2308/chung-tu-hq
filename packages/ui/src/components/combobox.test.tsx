import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../test/a11y.js";
import { UiLocaleProvider } from "../lib/i18n.js";
import { buildSearchIndex, Combobox, foldVietnamese, matchesSearch, searchOptions, type ComboboxOption } from "./combobox.js";
import { Field } from "./field.js";

// jsdom thiếu các API mà Radix Popper / cmdk dùng.
beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Element.prototype.scrollIntoView ??= function () {};
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => {};
});

const PORTS: ComboboxOption[] = [
  { value: "VNHPH", label: "Hải Phòng", description: "VNHPH" },
  { value: "VNCLI", label: "Cát Lái", description: "TP. Hồ Chí Minh" },
  { value: "VNDAD", label: "Đà Nẵng", description: "VNDAD" },
  { value: "VNSGN", label: "Tân Sơn Nhất", description: "Sân bay", disabled: true },
];

function Single({ onChange = vi.fn(), clearable = false, error }: { onChange?: (v: string | null) => void; clearable?: boolean; error?: string }) {
  const [v, setV] = useState<string | null>(null);
  return (
    <Field label="Cảng dỡ hàng" hint="Theo B/L" {...(error ? { error } : {})}>
      <Combobox options={PORTS} value={v} clearable={clearable} onChange={(n) => { setV(n); onChange(n); }} />
    </Field>
  );
}

function Multi({ onChange = vi.fn() }: { onChange?: (v: string[]) => void }) {
  const [v, setV] = useState<string[]>([]);
  return (
    <Field label="Cảng">
      <Combobox multiple options={PORTS} value={v} onChange={(n) => { setV(n); onChange(n); }} />
    </Field>
  );
}

describe("foldVietnamese / matchesSearch", () => {
  it("bỏ dấu, đ → d, chữ thường", () => {
    expect(foldVietnamese("  Hải  Phòng ")).toBe("hai phong");
    expect(foldVietnamese("Đà Nẵng")).toBe("da nang");
  });
  it("khớp không dấu, mọi từ đều phải có", () => {
    expect(matchesSearch({ label: "Hải Phòng" }, "hai phong")).toBe(true);
    expect(matchesSearch({ label: "Hải Phòng" }, "phong hai")).toBe(true);
    expect(matchesSearch({ label: "Cát Lái", description: "TP. Hồ Chí Minh" }, "ho chi minh")).toBe(true);
    expect(matchesSearch({ label: "Hải Phòng" }, "hai nang")).toBe(false);
  });
});

describe("Combobox – chọn một", () => {
  it("trigger là combobox có tên từ Field, hiện placeholder, gắn gợi ý", () => {
    render(<Single />);
    const cb = screen.getByRole("combobox", { name: "Cảng dỡ hàng" });
    expect(cb).toHaveAttribute("aria-expanded", "false");
    expect(cb).toHaveTextContent("Chọn…");
    expect(cb).toHaveAccessibleDescription("Theo B/L");
  });

  it("mở danh sách, lọc không dấu, chọn bằng chuột → đóng và hiện nhãn", async () => {
    const onChange = vi.fn();
    render(<Single onChange={onChange} />);
    const cb = screen.getByRole("combobox", { name: "Cảng dỡ hàng" });
    await userEvent.click(cb);
    expect(cb).toHaveAttribute("aria-expanded", "true");
    const list = screen.getByRole("listbox");
    expect(within(list).getAllByRole("option")).toHaveLength(4);

    await userEvent.type(screen.getByPlaceholderText("Tìm kiếm…"), "hai phong");
    expect(within(list).getByRole("option", { name: /Hải Phòng/ })).toBeInTheDocument();
    expect(within(list).queryByRole("option", { name: /Cát Lái/ })).not.toBeInTheDocument();

    await userEvent.click(within(list).getByRole("option", { name: /Hải Phòng/ }));
    expect(onChange).toHaveBeenCalledWith("VNHPH");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(cb).toHaveTextContent("Hải Phòng");
  });

  it("dùng bàn phím: Enter mở, gõ lọc, mũi tên + Enter chọn", async () => {
    const onChange = vi.fn();
    render(<Single onChange={onChange} />);
    screen.getByRole("combobox", { name: "Cảng dỡ hàng" }).focus();
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard("da");
    await userEvent.keyboard("{ArrowDown}{ArrowUp}{Enter}");
    expect(onChange).toHaveBeenCalledWith("VNDAD");
  });

  it("không chọn được mục disabled; Escape đóng danh sách", async () => {
    const onChange = vi.fn();
    render(<Single onChange={onChange} />);
    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.click(screen.getByRole("option", { name: /Tân Sơn Nhất/ }));
    expect(onChange).not.toHaveBeenCalled();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("clearable: nút xóa đưa về null", async () => {
    const onChange = vi.fn();
    render(<Single onChange={onChange} clearable />);
    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.click(screen.getByRole("option", { name: /Cát Lái/ }));
    await userEvent.click(screen.getByRole("button", { name: "Xóa lựa chọn" }));
    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(screen.getByRole("combobox")).toHaveTextContent("Chọn…");
  });

  it("lỗi từ Field → aria-invalid trên trigger", () => {
    render(<Single error="Bắt buộc" />);
    expect(screen.getByRole("combobox")).toHaveAttribute("aria-invalid", "true");
  });

  it("disabled: không mở được", async () => {
    render(<Combobox aria-label="Cảng" options={PORTS} value={null} onChange={() => {}} disabled />);
    const cb = screen.getByRole("combobox", { name: "Cảng" });
    expect(cb).toBeDisabled();
    await userEvent.click(cb);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});

describe("Combobox – chọn nhiều", () => {
  it("chọn nhiều giữ danh sách mở, hiện chip, bỏ chip bằng nút", async () => {
    const onChange = vi.fn();
    render(<Multi onChange={onChange} />);
    await userEvent.click(screen.getByRole("combobox", { name: "Cảng" }));
    await userEvent.click(screen.getByRole("option", { name: /Hải Phòng/ }));
    await userEvent.click(screen.getByRole("option", { name: /Cát Lái/ }));
    expect(onChange).toHaveBeenLastCalledWith(["VNHPH", "VNCLI"]);
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Hải Phòng.*đã chọn/ })).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByRole("button", { name: "Bỏ Hải Phòng" }));
    expect(onChange).toHaveBeenLastCalledWith(["VNCLI"]);
  });
});

describe("Combobox – tải từ server", () => {
  it("không tự lọc; gọi onSearchChange; hiện đang tải", async () => {
    const onSearchChange = vi.fn();
    const { rerender } = render(<Combobox aria-label="Đối tác" options={PORTS} value={null} onChange={() => {}} onSearchChange={onSearchChange} />);
    await userEvent.click(screen.getByRole("combobox", { name: "Đối tác" }));
    await userEvent.type(screen.getByPlaceholderText("Tìm kiếm…"), "xyz");
    expect(onSearchChange).toHaveBeenLastCalledWith("xyz");
    expect(screen.getAllByRole("option")).toHaveLength(4); // server quyết định danh sách
    rerender(<Combobox aria-label="Đối tác" options={[]} value={null} onChange={() => {}} onSearchChange={onSearchChange} loading />);
    expect(screen.getByText("Đang tải…")).toBeInTheDocument();
  });
});

describe("Combobox – tiếng Anh", () => {
  it("nhãn theo UiLocaleProvider en", async () => {
    render(
      <UiLocaleProvider locale="en">
        <Combobox aria-label="Port" options={PORTS} value={null} onChange={() => {}} />
      </UiLocaleProvider>,
    );
    const cb = screen.getByRole("combobox", { name: "Port" });
    expect(cb).toHaveTextContent("Select…");
    await userEvent.click(cb);
    await userEvent.type(screen.getByPlaceholderText("Search…"), "zzz");
    expect(screen.getByText("No results")).toBeInTheDocument();
  });
});

// 20.000 đối tác: "Công ty TNHH Số 00001"…; mỗi 1.000 mục có 1 mục ở Đà Nẵng.
const MANY: ComboboxOption[] = Array.from({ length: 20_000 }, (_, i) => {
  const n = String(i + 1).padStart(5, "0");
  return { value: `P${n}`, label: `Công ty TNHH Số ${n}`, description: i % 1000 === 0 ? "Đà Nẵng" : "Hà Nội" };
});

describe("searchOptions – danh sách rất dài", () => {
  it("giới hạn số mục, đếm tổng số khớp, giữ thứ tự gốc", () => {
    const index = buildSearchIndex(MANY);
    const { shown, total } = searchOptions(index, "", 100);
    expect(shown).toHaveLength(100);
    expect(total).toBe(20_000);
    expect(shown[0]?.value).toBe("P00001");
    expect(searchOptions(index, "da nang", 100).total).toBe(20);
  });

  it("mục đang chọn nằm ngoài giới hạn vẫn có trong danh sách", () => {
    const { shown } = searchOptions(buildSearchIndex(MANY), "", 100, new Set(["P19999"]));
    expect(shown).toHaveLength(101);
    expect(shown.at(-1)?.value).toBe("P19999");
  });

  it("lọc 20.000 mục đã bỏ dấu sẵn < 50ms", () => {
    const index = buildSearchIndex(MANY);
    searchOptions(index, "cong", 100); // làm nóng JIT
    const t0 = performance.now();
    const { total } = searchOptions(index, "c", 100);
    const elapsed = performance.now() - t0;
    expect(total).toBe(20_000);
    expect(elapsed).toBeLessThan(50);
  });
});

describe("Combobox – danh sách rất dài", () => {
  it("20.000 mục: chỉ render tối đa maxResults option + báo còn bao nhiêu", async () => {
    render(<Combobox aria-label="Đối tác" options={MANY} value={null} onChange={() => {}} />);
    await userEvent.click(screen.getByRole("combobox", { name: "Đối tác" }));
    await userEvent.type(screen.getByPlaceholderText("Tìm kiếm…"), "c");
    const list = screen.getByRole("listbox");
    expect(within(list).getAllByRole("option").length).toBeLessThanOrEqual(100);
    expect(screen.getByRole("status")).toHaveTextContent("Còn 19.900 kết quả – gõ thêm để thu hẹp");
    expect(list).toHaveAccessibleDescription(/Còn 19.900 kết quả/);
  });

  it("gõ thêm thu hẹp → hết dòng báo; chọn mục ngoài 100 đầu vẫn hiện đúng nhãn", async () => {
    const onChange = vi.fn();
    function Pick() {
      const [v, setV] = useState<string | null>(null);
      return <Combobox aria-label="Đối tác" options={MANY} value={v} maxResults={50} onChange={(n) => { setV(n); onChange(n); }} />;
    }
    render(<Pick />);
    const cb = screen.getByRole("combobox", { name: "Đối tác" });
    await userEvent.click(cb);
    await userEvent.type(screen.getByPlaceholderText("Tìm kiếm…"), "da nang");
    expect(screen.getAllByRole("option")).toHaveLength(20);
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    await userEvent.click(screen.getByRole("option", { name: /Số 19001/ }));
    expect(onChange).toHaveBeenCalledWith("P19001");
    expect(cb).toHaveTextContent("Công ty TNHH Số 19001");
    // Mở lại không tìm: mục đã chọn vẫn có trong danh sách và được đánh dấu.
    await userEvent.click(cb);
    expect(screen.getByRole("option", { name: /Số 19001.*đã chọn/ })).toBeInTheDocument();
  });

  it("chọn nhiều: chip của mục ngoài giới hạn hiện đúng nhãn", () => {
    render(<Combobox multiple aria-label="Đối tác" options={MANY} value={["P15000", "P00002"]} onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Bỏ Công ty TNHH Số 15000" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bỏ Công ty TNHH Số 00002" })).toBeInTheDocument();
  });

  it("tiếng Anh: dòng báo bằng tiếng Anh", async () => {
    render(
      <UiLocaleProvider locale="en">
        <Combobox aria-label="Partner" options={MANY} value={null} onChange={() => {}} />
      </UiLocaleProvider>,
    );
    await userEvent.click(screen.getByRole("combobox", { name: "Partner" }));
    expect(screen.getByRole("status")).toHaveTextContent("19,900 more results – keep typing to narrow down");
  });

  it("server mode: không lọc lại nhưng vẫn giới hạn số mục render", async () => {
    render(<Combobox aria-label="Đối tác" options={MANY.slice(0, 300)} value={null} onChange={() => {}} onSearchChange={() => {}} />);
    await userEvent.click(screen.getByRole("combobox", { name: "Đối tác" }));
    expect(screen.getAllByRole("option")).toHaveLength(100);
    expect(screen.getByRole("status")).toHaveTextContent("Còn 200 kết quả");
  });

  it("không vi phạm a11y khi có dòng báo còn kết quả", async () => {
    render(<Combobox aria-label="Đối tác" options={MANY.slice(0, 500)} value={null} onChange={() => {}} />);
    await userEvent.click(screen.getByRole("combobox", { name: "Đối tác" }));
    await expectNoA11yViolations(document.body);
  });
});

describe("Combobox – a11y", () => {
  it("không vi phạm khi đóng và khi mở", async () => {
    const { container } = render(<Single clearable />);
    await expectNoA11yViolations(container);
    await userEvent.click(screen.getByRole("combobox"));
    await expectNoA11yViolations(document.body);
  });
});
