"use client";
// Tải danh mục VNACCS khi cần (giữ trong bộ nhớ cho cả trang) và tra tên của mã cho một ô.
import { codeListFor, loadCodeList, type CodeListEntry, type CodeListId, type CodeTable } from "@kb/contracts";
import { useEffect, useState } from "react";
import { codeName, type CodeScope } from "./code-scope";
import { codeLabel } from "./display";

const loaded = new Map<CodeListId, CodeListEntry[]>();

/** null khi đang tải hoặc ô không có danh mục. */
export function useCodeList(id: CodeListId | undefined): CodeListEntry[] | null {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!id || loaded.has(id)) return;
    let alive = true;
    void loadCodeList(id).then((list) => {
      loaded.set(id, list);
      if (alive) setTick((n) => n + 1);
    });
    return () => {
      alive = false;
    };
  }, [id]);
  return id ? (loaded.get(id) ?? null) : null;
}

/** Tên của mã: danh mục VNACCS (theo phạm vi), không có thì bảng mã gọn đang dùng (declaration/code-tables). */
export function useCodeName(table: CodeTable | undefined, value: string, scope: CodeScope | null): string | undefined {
  const list = useCodeList(value.trim() ? codeListFor(table) : undefined);
  return (list && codeName(list, value, scope)) ?? codeLabel(table, value);
}
