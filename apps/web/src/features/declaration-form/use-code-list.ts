"use client";
// Tải danh mục VNACCS khi cần (giữ trong bộ nhớ cho cả trang) và tra tên của mã cho một ô.
import { codeListFor, loadCodeList, type CodeListEntry, type CodeListId, type CodeTable } from "@kb/contracts";
import { useEffect, useSyncExternalStore } from "react";
import { createCodeListCache, type CodeListState } from "./code-list-cache";
import { codeName, type CodeScope } from "./code-scope";
import { codeLabel } from "./display";

const cache = createCodeListCache(loadCodeList);

/** Trạng thái danh mục (undefined khi ô không có danh mục) + thử lại khi lỗi. */
export function useCodeListState(id: CodeListId | undefined): { state: CodeListState | undefined; retry: () => void } {
  const state = useSyncExternalStore(cache.subscribe, () => (id ? cache.get(id) : undefined), () => undefined);
  useEffect(() => {
    if (id) cache.ensure(id);
  }, [id]);
  return { state, retry: () => id && cache.retry(id) };
}

/** null khi đang tải, lỗi, hoặc ô không có danh mục. */
export function useCodeList(id: CodeListId | undefined): CodeListEntry[] | null {
  const { state } = useCodeListState(id);
  return state?.status === "ready" ? state.list : null;
}

/** Tên của mã: danh mục VNACCS (theo phạm vi), không có thì bảng mã gọn đang dùng (declaration/code-tables). */
export function useCodeName(table: CodeTable | undefined, value: string, scope: CodeScope | null): string | undefined {
  const list = useCodeList(value.trim() ? codeListFor(table) : undefined);
  return (list && codeName(list, value, scope)) ?? codeLabel(table, value);
}
