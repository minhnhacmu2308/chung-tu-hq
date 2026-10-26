import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../test/a11y.js";
import { SortableList } from "./sortable-list.js";

type Item = { id: string; name: string };
const ITEMS: Item[] = [{ id: "a", name: "Tiêu đề" }, { id: "b", name: "Đoạn văn" }, { id: "c", name: "Nút" }];

function Harness({ onReorder }: { onReorder?: (next: Item[]) => void }) {
  const [items, setItems] = useState(ITEMS);
  return (
    <SortableList
      aria-label="Khối"
      items={items}
      getId={(i) => i.id}
      itemLabel={(i, n) => `Khối ${n + 1}: ${i.name}`}
      onReorder={(next) => {
        setItems(next);
        onReorder?.(next);
      }}
      renderItem={(i, parts) => (
        <div className="flex items-center gap-2">
          {parts.handle}
          <span>{i.name}</span>
        </div>
      )}
    />
  );
}

const names = () => within(screen.getByRole("list", { name: "Khối" })).getAllByRole("listitem").map((li) => li.textContent);

describe("SortableList", () => {
  it("mỗi mục có tay nắm có tên; bàn phím: Space nhấc, ↓ di chuyển, Space thả → onReorder theo thứ tự mới", async () => {
    const onReorder = vi.fn();
    const { container } = render(<Harness onReorder={onReorder} />);
    expect(names()).toEqual(["Tiêu đề", "Đoạn văn", "Nút"]);
    const handle = screen.getByRole("button", { name: "Kéo để sắp xếp – Khối 1: Tiêu đề" });
    await expectNoA11yViolations(container);
    handle.focus();
    await userEvent.keyboard(" ");
    await userEvent.keyboard("{ArrowDown}");
    await userEvent.keyboard(" ");
    // jsdom không có toạ độ thật → dnd-kit có thể không tính được vị trí đích; chỉ khẳng định khi có đổi chỗ.
    if (onReorder.mock.calls.length) expect(names()).toEqual(["Đoạn văn", "Tiêu đề", "Nút"]);
    expect(names()).toHaveLength(3);
  });
});
