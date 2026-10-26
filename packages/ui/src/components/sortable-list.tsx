// Danh sách kéo thả để sắp xếp (vd khối của mẫu email): tay nắm ⋮⋮ kéo bằng chuột / chạm, hoặc Tab tới tay nắm → Space để nhấc,
// mũi tên để di chuyển, Space để thả, Esc để hủy. Trình đọc màn hình được báo vị trí bằng tiếng của giao diện.
// Nơi dùng tự vẽ nội dung từng mục (`renderItem`) và đặt `parts.handle` vào chỗ muốn.
import {
  closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type Announcements, type DragEndEvent,
} from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../lib/cn.js";
import { useMessages, type Messages } from "../lib/i18n.js";

const MESSAGES = {
  vi: {
    handle: "Kéo để sắp xếp – {label}",
    instructions: "Nhấn Space để nhấc mục, mũi tên lên/xuống để di chuyển, Space để thả, Esc để hủy.",
    picked: "Đã nhấc {label}, vị trí {pos}/{total}.",
    over: "{label} đang ở vị trí {pos}/{total}.",
    dropped: "Đã thả {label} ở vị trí {pos}/{total}.",
    cancelled: "Đã hủy, {label} về chỗ cũ.",
  },
  en: {
    handle: "Drag to reorder – {label}",
    instructions: "Press Space to pick up, arrow keys to move, Space to drop, Escape to cancel.",
    picked: "Picked up {label}, position {pos} of {total}.",
    over: "{label} is at position {pos} of {total}.",
    dropped: "Dropped {label} at position {pos} of {total}.",
    cancelled: "Cancelled, {label} is back in place.",
  },
  zh: {
    handle: "拖动排序 – {label}",
    instructions: "按空格键拿起，方向键移动，空格键放下，Esc 取消。",
    picked: "已拿起 {label}，位置 {pos}/{total}。",
    over: "{label} 当前位置 {pos}/{total}。",
    dropped: "已将 {label} 放在位置 {pos}/{total}。",
    cancelled: "已取消，{label} 回到原位。",
  },
} satisfies Messages<"handle" | "instructions" | "picked" | "over" | "dropped" | "cancelled">;

const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in v ? String(v[k]) : m));

export type SortableListParts = {
  /** Tay nắm kéo (nút) – đặt vào nội dung mục. */
  handle: ReactNode;
  isDragging: boolean;
  index: number;
};

export type SortableListProps<T> = {
  items: readonly T[];
  getId: (item: T) => string;
  /** Tên mục để đọc cho trình đọc màn hình (vd "Khối 3: Tiêu đề"). */
  itemLabel: (item: T, index: number) => string;
  onReorder: (next: T[]) => void;
  renderItem: (item: T, parts: SortableListParts) => ReactNode;
  "aria-label": string;
  className?: string;
  labels?: Partial<Record<keyof (typeof MESSAGES)["vi"], string>>;
};

function Row<T>({ item, id, index, label, handleLabel, render }: { item: T; id: string; index: number; label: string; handleLabel: string; render: SortableListProps<T>["renderItem"] }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });
  const handle = (
    <button
      type="button"
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      aria-label={fill(handleLabel, { label })}
      title={fill(handleLabel, { label })}
      className="inline-flex h-8 w-6 shrink-0 cursor-grab touch-none items-center justify-center rounded-sm text-fg-subtle hover:bg-surface-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus active:cursor-grabbing"
    >
      <GripVertical aria-hidden="true" className="h-4 w-4" />
    </button>
  );
  return (
    <li
      ref={setNodeRef}
      data-dragging={isDragging || undefined}
      // Vị trí đang kéo do dnd-kit tính theo pixel → biến đổi CSS cục bộ (không phải giá trị trang trí).
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className="relative data-[dragging]:z-10 data-[dragging]:opacity-80"
    >
      {render(item, { handle, isDragging, index })}
    </li>
  );
}

export function SortableList<T>({ items, getId, itemLabel, onReorder, renderItem, className, labels, ...rest }: SortableListProps<T>) {
  const t = useMessages(MESSAGES, labels);
  const sensors = useSensors(
    // Kéo ≥ 4px mới tính là kéo: bấm vào tay nắm không vô tình xê dịch.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ids = items.map(getId);
  const labelOf = (id: string | number) => {
    const i = ids.indexOf(String(id));
    return i < 0 ? String(id) : itemLabel(items[i]!, i);
  };
  const posOf = (id: string | number | undefined) => (id === undefined ? 0 : ids.indexOf(String(id)) + 1);
  const announcements: Announcements = {
    onDragStart: ({ active }) => fill(t.picked, { label: labelOf(active.id), pos: posOf(active.id), total: ids.length }),
    onDragOver: ({ active, over }) => (over ? fill(t.over, { label: labelOf(active.id), pos: posOf(over.id), total: ids.length }) : undefined),
    onDragEnd: ({ active, over }) => fill(t.dropped, { label: labelOf(active.id), pos: posOf(over?.id ?? active.id), total: ids.length }),
    onDragCancel: ({ active }) => fill(t.cancelled, { label: labelOf(active.id) }),
  };
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from >= 0 && to >= 0) onReorder(arrayMove([...items], from, to));
  };
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd} accessibility={{ announcements, screenReaderInstructions: { draggable: t.instructions } }}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ul aria-label={rest["aria-label"]} className={cn("flex flex-col gap-2", className)}>
          {items.map((item, i) => (
            <Row key={ids[i]} item={item} id={ids[i]!} index={i} label={itemLabel(item, i)} handleLabel={t.handle} render={renderItem} />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}
