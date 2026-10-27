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

/**
 * Nhiều danh mục cho một màn (vd Tạo hồ sơ: TYPE_CODE + A038): danh mục (null khi chưa có), đang tải, lỗi + thử lại.
 * Màn dùng để báo "Đang tải…" và lỗi kèm thử lại – không để danh sách trống im lặng.
 */
export function useCodeLists<K extends CodeListId>(ids: readonly K[]): { lists: Record<K, CodeListEntry[] | null>; loading: boolean; error: boolean; retry: () => void } {
  const snapshot = () => ids.map((id) => cache.get(id));
  const key = ids.join(",");
  // useSyncExternalStore cần ảnh chụp ổn định: ghép trạng thái từng danh mục thành chuỗi, đọc lại khi chuỗi đổi.
  const sig = useSyncExternalStore(cache.subscribe, () => snapshot().map((s) => s?.status ?? "none").join(","), () => "");
  useEffect(() => {
    for (const id of ids) cache.ensure(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const states = snapshot();
  const lists = Object.fromEntries(ids.map((id, i) => [id, states[i]?.status === "ready" ? (states[i] as { list: CodeListEntry[] }).list : null])) as Record<K, CodeListEntry[] | null>;
  return {
    lists,
    loading: sig === "" || states.some((s) => !s || s.status === "loading"),
    error: states.some((s) => s?.status === "error"),
    retry: () => ids.forEach((id) => cache.get(id)?.status === "error" && cache.retry(id)),
  };
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
