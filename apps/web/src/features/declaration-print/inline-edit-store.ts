"use client";
// Trạng thái sửa nhanh tại ô của bản in: các ô chưa lưu và ô đang nhập. Lưu ngoài React (useSyncExternalStore) để mỗi ô chỉ vẽ lại khi
// phần của chính nó đổi – bản in có hàng trăm ô (PrintCell memo), gõ / chốt một ô không được vẽ lại cả trang.
import { createContext, useContext, useSyncExternalStore } from "react";
import { draftId, type InlineDraft } from "./inline-edit";

export class InlineEditStore {
  private drafts = new Map<string, InlineDraft>();
  /** Ô đang nhập + chữ đặt sẵn khi bắt đầu (ký tự vừa gõ, hoặc giá trị đang có khi F2). */
  private editing: { id: string; text: string } | null = null;
  /** Ô vừa bị bỏ giá trị vì mã không có trong danh mục (chữ người dùng đã gõ) – ô báo đỏ tới khi nhập lại. */
  private rejected = new Map<string, string>();
  private listeners = new Set<() => void>();

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  private emit() {
    for (const l of this.listeners) l();
  }

  draftOf = (id: string): string | undefined => this.drafts.get(id)?.value;
  editingText = (id: string): string | undefined => (this.editing?.id === id ? this.editing.text : undefined);
  isEditing = (id: string) => this.editing?.id === id;
  rejectedOf = (id: string): string | undefined => this.rejected.get(id);
  count = () => this.drafts.size;
  list = (): InlineDraft[] => [...this.drafts.values()];

  /** Ghi ô chưa lưu; giá trị như đang lưu (`saved`) → bỏ khỏi danh sách (ô trở lại như cũ). */
  setDraft(d: InlineDraft, saved: string) {
    const id = draftId(d.key, d.line);
    this.rejected.delete(id);
    if (d.value.trim() === saved.trim()) this.drafts.delete(id);
    else this.drafts.set(id, d);
    this.emit();
  }
  startEdit(id: string, text: string) {
    this.editing = { id, text };
    this.rejected.delete(id);
    this.emit();
  }
  /** Bỏ phần đang gõ của ô (mã sai) và đánh dấu đỏ ô đó, giữ chữ đã gõ để báo cho người dùng. */
  reject(id: string, text: string) {
    if (this.editing?.id === id) this.editing = null;
    this.rejected.set(id, text);
    this.emit();
  }
  stopEdit() {
    if (!this.editing) return;
    this.editing = null;
    this.emit();
  }
  clear() {
    if (this.drafts.size === 0 && !this.editing && this.rejected.size === 0) return;
    this.drafts.clear();
    this.rejected.clear();
    this.editing = null;
    this.emit();
  }
}

const NONE = new InlineEditStore();

/**
 * Bản in đang bật sửa nhanh: kho trạng thái + thao tác do print-declaration cung cấp (ổn định qua các lần vẽ).
 * Không có (null) → ô bấm là mở panel như cũ.
 */
export type InlineEditApi = {
  store: InlineEditStore;
  /** Ô nhập tại chỗ được không (đúng loại ô, không bị khóa). */
  canEdit: (key: string, line?: number) => boolean;
  /** Bắt đầu nhập: `text` = chữ đặt sẵn; null = lấy giá trị đang hiện (F2). */
  start: (key: string, line: number | undefined, text: string | null) => void;
  /** Chốt chữ đang nhập; `move` = sang ô kế tiếp (1) / trước (-1) theo thứ tự Tab, 0 = ở lại ô. false = chữ không hợp lệ (vẫn đang nhập). */
  commit: (key: string, line: number | undefined, text: string, move: -1 | 0 | 1) => boolean;
  cancel: (key: string, line?: number) => void;
  /** Mã không có trong danh mục khi rời ô: không giữ giá trị, ô báo đỏ (kèm chữ đã gõ) tới khi nhập lại. */
  reject: (key: string, line: number | undefined, text: string) => void;
  /** Xóa giá trị ô (Delete / Backspace trên ô đang chọn). */
  clearCell: (key: string, line?: number) => void;
  /** Mở panel đầy đủ của ô (Enter, nhấp đúp, ô không nhập tại chỗ được). */
  openPanel: (key: string, line?: number) => void;
};

export const InlineEditContext = createContext<InlineEditApi | null>(null);

export const useInlineEdit = () => useContext(InlineEditContext);

/** Giá trị chưa lưu của ô (undefined = không có). */
export function useCellDraft(api: InlineEditApi | null, id: string): string | undefined {
  const s = api?.store ?? NONE;
  return useSyncExternalStore(s.subscribe, () => s.draftOf(id), () => undefined);
}

/** Chữ đặt sẵn khi ô đang nhập (undefined = không nhập). */
export function useCellEditing(api: InlineEditApi | null, id: string): string | undefined {
  const s = api?.store ?? NONE;
  return useSyncExternalStore(s.subscribe, () => s.editingText(id), () => undefined);
}

/** Chữ đã gõ của ô vừa bị bỏ vì mã sai (undefined = không có). */
export function useCellRejected(api: InlineEditApi | null, id: string): string | undefined {
  const s = api?.store ?? NONE;
  return useSyncExternalStore(s.subscribe, () => s.rejectedOf(id), () => undefined);
}

/** Số ô chưa lưu. */
export function useDraftCount(store: InlineEditStore): number {
  return useSyncExternalStore(store.subscribe, store.count, () => 0);
}
