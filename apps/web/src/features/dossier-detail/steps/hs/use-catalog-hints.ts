// Tra danh mục hàng hóa dùng chung cho các dòng hàng (một lần cho cả hồ sơ, chia lô RESOLVE_MANY_MAX_ROWS) → gợi ý mã HS đã khai theo dòng.
import { RESOLVE_MANY_MAX_ROWS, type ResolveManyResult } from "@kb/contracts";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { catalogKeys, resolveCatalogMany } from "@/api/catalog";

/** Kết quả tra theo mô tả dòng hàng (mô tả trùng nhau tra một lần). */
export function useCatalogHints(descriptions: readonly string[]) {
  const key = JSON.stringify(descriptions.map((d) => d.trim()));
  const names = useMemo(() => [...new Set((JSON.parse(key) as string[]).filter(Boolean))].sort(), [key]);
  const rows = useMemo(() => names.map((name) => ({ name })), [names]);
  const q = useQuery({
    queryKey: catalogKeys.resolveMany(rows),
    queryFn: async () => {
      const chunks: (typeof rows)[] = [];
      for (let i = 0; i < rows.length; i += RESOLVE_MANY_MAX_ROWS) chunks.push(rows.slice(i, i + RESOLVE_MANY_MAX_ROWS));
      return (await Promise.all(chunks.map((c) => resolveCatalogMany(c)))).flat();
    },
    enabled: rows.length > 0,
    staleTime: 60_000,
  });
  const byName = useMemo(() => new Map<string, ResolveManyResult>(q.data ? names.map((n, i) => [n, q.data[i]!] as const) : []), [names, q.data]);
  return useMemo(() => ({ get: (description: string) => byName.get(description.trim()) }), [byName]);
}
