import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../test/a11y.js";
import { UiLocaleProvider } from "../lib/i18n.js";
import { Button } from "./button.js";
import { FeedGroup, FeedItem } from "./feed.js";
import { SearchInput } from "./inputs.js";

describe("FeedGroup + FeedItem", () => {
  it("nhóm có tên theo nhãn; mục có liên kết phủ dòng mang tên tiêu đề + 'Chưa đọc'; không vi phạm a11y", async () => {
    const { container } = render(
      <FeedGroup label="Hôm nay">
        <FeedItem title="HS-NK-001 đã thông quan" description="Số tờ khai 107621548840" meta="5 phút trước" icon={<svg />} tone="success" unread href="/dossiers/1" />
        <FeedItem title="Bảo trì hệ thống" icon={<svg />} />
      </FeedGroup>,
    );
    expect(screen.getByRole("region", { name: "Hôm nay" })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    const link = screen.getByRole("link", { name: "HS-NK-001 đã thông quan (Chưa đọc)" });
    expect(link).toHaveAttribute("href", "/dossiers/1");
    expect(link.closest("li")).toHaveAttribute("data-unread", "true");
    expect(link.closest("li")).toHaveClass("bg-primary-subtle/50");
    // Không href → nút; đã đọc → không có chữ "Chưa đọc".
    expect(screen.getByRole("button", { name: "Bảo trì hệ thống" })).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it("bấm mục gọi onOpen; nút thao tác bấm riêng không mở mục", async () => {
    const onOpen = vi.fn();
    const onAction = vi.fn();
    render(
      <FeedGroup label="Hôm qua">
        <FeedItem title="Mục A" icon={<svg />} onOpen={onOpen} actions={<Button size="icon-sm" variant="ghost" aria-label="Xóa" onClick={onAction}>x</Button>} />
      </FeedGroup>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Mục A" }));
    expect(onOpen).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole("button", { name: "Xóa" }));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("nhãn 'Chưa đọc' theo ngôn ngữ và ghi đè được qua labels", () => {
    render(
      <UiLocaleProvider locale="en">
        <ul>
          <FeedItem title="A" icon={<svg />} unread />
          <FeedItem title="B" icon={<svg />} unread labels={{ unread: "New" }} />
        </ul>
      </UiLocaleProvider>,
    );
    expect(screen.getByRole("button", { name: "A (Unread)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "B (New)" })).toBeInTheDocument();
  });
});

describe("SearchInput", () => {
  it("ô type=search có tên truy cập, gõ được; className áp cho khung", async () => {
    const onChange = vi.fn();
    const { container } = render(<SearchInput aria-label="Tìm thông báo" placeholder="Tìm…" className="w-40" onChange={onChange} />);
    const box = screen.getByRole("searchbox", { name: "Tìm thông báo" });
    await userEvent.type(box, "ab");
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(container.firstElementChild).toHaveClass("w-40");
    await expectNoA11yViolations(container);
  });
});
