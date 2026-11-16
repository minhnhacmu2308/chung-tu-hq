import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { expectNoA11yViolations } from "../../test/a11y.js";
import { UiLocaleProvider } from "../lib/i18n.js";
import { NoticeChip } from "./notice-chip.js";

const policy = (
  <NoticeChip
    tone="info"
    label="Kiểm dịch"
    title="Quản lý chuyên ngành – Bộ NN&PTNT"
    description="Hàng thuộc diện kiểm dịch."
    count={5}
    meta="Áp dụng cho dòng 1–5"
    items={[{ text: "Bạch tuộc đông lạnh", refs: ["Luật Thú y", "NĐ 15/2018/NĐ-CP"] }]}
  />
);

describe("NoticeChip – lưu ý gọn, bấm xem chi tiết", () => {
  it("nhãn là nút; tên truy cập có mức độ (không chỉ bằng màu) và số đối tượng", () => {
    render(policy);
    const btn = screen.getByRole("button", { name: /Kiểm dịch.*×5.*\(Lưu ý\)/ });
    expect(btn).toHaveAttribute("aria-haspopup", "dialog");
  });

  it("bấm (chuột hoặc Enter) mở thẻ: tiêu đề, câu đầy đủ, mục, căn cứ, dòng cuối; Esc đóng", async () => {
    render(policy);
    await userEvent.click(screen.getByRole("button"));
    const card = screen.getByRole("dialog", { name: "Quản lý chuyên ngành – Bộ NN&PTNT" });
    expect(card).toHaveTextContent("Hàng thuộc diện kiểm dịch.");
    expect(card).toHaveTextContent("Bạch tuộc đông lạnh");
    expect(screen.getByRole("group", { name: "Căn cứ" })).toHaveTextContent("Luật Thú y");
    expect(card).toHaveTextContent("Áp dụng cho dòng 1–5");
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    screen.getByRole("button").focus();
    await userEvent.keyboard("{Enter}");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("không có title → thẻ lấy nhãn làm tiêu đề; count 1 không hiện ×1", async () => {
    render(<NoticeChip tone="danger" label="Khác HS hóa đơn" description="Khác mã HS trên hóa đơn (940511)." count={1} />);
    expect(screen.getByRole("button")).not.toHaveTextContent("×");
    await userEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("dialog", { name: "Khác HS hóa đơn" })).toHaveTextContent("Cần xử lý");
  });

  it("nhãn mức độ theo ngôn ngữ, ghi đè được bằng labels", () => {
    render(
      <UiLocaleProvider locale="en">
        <NoticeChip tone="warning" label="Low confidence" />
        <NoticeChip tone="danger" label="Mismatch" labels={{ danger: "Fix now" }} />
      </UiLocaleProvider>,
    );
    expect(screen.getByRole("button", { name: /Low confidence.*\(Check needed\)/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Mismatch.*\(Fix now\)/ })).toBeInTheDocument();
  });

  it("variant tile: thẻ nhỏ có dòng phụ và số đối tượng, bấm mở cùng thẻ chi tiết", async () => {
    render(<NoticeChip variant="tile" tone="info" label="Kiểm dịch" subtitle="Dòng 1–3" count={3} description="Hàng thuộc diện kiểm dịch." />);
    const btn = screen.getByRole("button", { name: /Kiểm dịch.*Dòng 1–3.*\(Lưu ý\)/ });
    expect(btn).not.toHaveTextContent("×");
    await userEvent.click(btn);
    expect(screen.getByRole("dialog", { name: "Kiểm dịch" })).toHaveTextContent("Hàng thuộc diện kiểm dịch.");
  });

  it("không vi phạm a11y (đóng và mở)", async () => {
    const { container } = render(policy);
    await expectNoA11yViolations(container);
    await userEvent.click(screen.getByRole("button"));
    await expectNoA11yViolations(document.body);
  });
});
