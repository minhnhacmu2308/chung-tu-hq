import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../test/a11y.js";
import { Field } from "./field.js";
import { Select } from "./inputs.js";

const PORTS = ["Hải Phòng", "Đà Nẵng", "Cát Lái", "Cái Mép", "Quy Nhơn", "Nội Bài", "Tân Sơn Nhất"].map((label, i) => ({ value: `P${i}`, label }));

describe("Select – ô tìm kiếm", () => {
  it("từ 6 lựa chọn: mở danh sách có ô tìm (tiêu điểm vào ô tìm), lọc không dấu, ↓ Enter chọn, tiêu điểm về nút", async () => {
    const onChange = vi.fn();
    render(<Field label="Cảng"><Select placeholder="Chọn…" options={PORTS} onChange={onChange} /></Field>);
    const trigger = screen.getByLabelText("Cảng");
    await userEvent.click(trigger);
    const search = screen.getByRole("combobox", { name: "Tìm trong danh sách" });
    expect(search).toHaveFocus();
    await userEvent.type(search, "da nang");
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Đà Nẵng"]);
    await userEvent.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledOnce();
    expect(trigger).toHaveTextContent("Đà Nẵng");
    expect(trigger).toHaveFocus();
  });

  it("gõ nhiều từ, ↑↓ chỉ đi qua mục đang hiện; không khớp → \"Không có kết quả\"", async () => {
    render(<Select aria-label="Cảng" options={PORTS} />);
    await userEvent.click(screen.getByRole("combobox", { name: "Cảng" }));
    const search = screen.getByRole("combobox", { name: "Tìm trong danh sách" });
    await userEvent.type(search, "ca");
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Cát Lái", "Cái Mép"]);
    await userEvent.keyboard("{ArrowDown}{Enter}");
    expect(screen.getByRole("combobox", { name: "Cảng" })).toHaveTextContent("Cái Mép");
    await userEvent.click(screen.getByRole("combobox", { name: "Cảng" }));
    await userEvent.type(screen.getByRole("combobox", { name: "Tìm trong danh sách" }), "xyz");
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    expect(screen.getByText("Không có kết quả")).toBeInTheDocument();
  });

  it("dưới 6 lựa chọn không có ô tìm; searchable ép bật/tắt", async () => {
    const { rerender } = render(<Select aria-label="Tiền tệ" options={PORTS.slice(0, 3)} />);
    await userEvent.click(screen.getByRole("combobox", { name: "Tiền tệ" }));
    expect(screen.queryByRole("combobox", { name: "Tìm trong danh sách" })).toBeNull();
    await userEvent.keyboard("{Escape}");
    rerender(<Select aria-label="Tiền tệ" options={PORTS} searchable={false} />);
    await userEvent.click(screen.getByRole("combobox", { name: "Tiền tệ" }));
    expect(screen.queryByRole("combobox", { name: "Tìm trong danh sách" })).toBeNull();
  });

  it("không vi phạm a11y khi đang mở có ô tìm", async () => {
    render(<Field label="Cảng"><Select options={PORTS} /></Field>);
    await userEvent.click(screen.getByLabelText("Cảng"));
    await expectNoA11yViolations(document.body);
  });
});
