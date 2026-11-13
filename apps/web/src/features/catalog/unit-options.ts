"use client";
// Lựa chọn ĐVT Hải quan (danh mục VNACCS UNIT, không viết cứng) cho Combobox; giữ cả mã đang có mà danh mục không có.
import type { ComboboxOption } from "@kb/ui";
import { useCodeLists } from "../declaration-form/use-code-list";

export function useUnitOptions(keep: readonly (string | null | undefined)[] = []): ComboboxOption[] {
  const { lists } = useCodeLists(["UNIT"] as const);
  const list = (lists.UNIT ?? []).filter((e) => !e.inactive);
  const extra = keep.filter((k): k is string => !!k && !list.some((e) => e.code === k)).map((k) => ({ value: k, label: k }));
  return [...extra, ...list.map((e) => ({ value: e.code, label: `${e.code} – ${e.name}` }))];
}
