"use client";
// Chọn một mặt hàng: tìm phía server theo mọi mã / mã nối / tên (trễ 300 ms), bỏ mặt hàng đang xem (nếu có). Dùng cho Gộp, Chuyển mã,
// Chọn khác ở hàng chờ.
import type { CatalogItemListRow } from "@kb/contracts";
import { Combobox } from "@kb/ui";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { catalogKeys, listCatalogItems } from "@/api/catalog";
import { useDebouncedValue } from "@/lib/use-debounced-value";

export function ItemPicker({ excludeId, value, onChange, placeholder, emptyText, id }: {
  /** Bỏ mặt hàng đang xem khỏi danh sách (gộp / chuyển mã). */
  excludeId?: string;
  value: CatalogItemListRow | null;
  onChange: (row: CatalogItemListRow | null) => void;
  placeholder: string;
  emptyText: string;
  id?: string;
}) {
  const [search, setSearch] = useState("");
  const q = useDebouncedValue(search.trim());
  const query = { ...(q ? { q } : {}), pageSize: 50 };
  const items = useQuery({ queryKey: catalogKeys.items(query), queryFn: () => listCatalogItems(query), placeholderData: keepPreviousData });
  const rows = (items.data?.rows ?? []).filter((r) => r.id !== excludeId);
  const all = value && !rows.some((r) => r.id === value.id) ? [value, ...rows] : rows;
  const options = all.map((r) => ({ value: r.id, label: r.name, description: [r.displayCode, r.itemNo, r.hsCode, r.baseUnit].filter(Boolean).join(" · ") }));
  return (
    <Combobox
      {...(id ? { id } : {})}
      options={options}
      value={value?.id ?? null}
      onChange={(v) => onChange(all.find((r) => r.id === v) ?? null)}
      placeholder={placeholder}
      emptyText={emptyText}
      loading={items.isFetching}
      onSearchChange={setSearch}
    />
  );
}
