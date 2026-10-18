// Bộ nhớ danh mục VNACCS cho cả trang: tải khi cần, một lần mỗi danh mục; có trạng thái đang tải / lỗi để màn hình hiện đúng và cho thử lại.
import type { CodeListEntry, CodeListId } from "@kb/contracts";

export type CodeListState = { status: "loading" } | { status: "ready"; list: CodeListEntry[] } | { status: "error" };

export function createCodeListCache(load: (id: CodeListId) => Promise<CodeListEntry[]>) {
  const states = new Map<CodeListId, CodeListState>();
  const subs = new Set<() => void>();
  const set = (id: CodeListId, s: CodeListState) => {
    states.set(id, s);
    subs.forEach((fn) => fn());
  };
  const ensure = (id: CodeListId) => {
    if (states.has(id)) return;
    set(id, { status: "loading" });
    load(id).then((list) => set(id, { status: "ready", list }), () => set(id, { status: "error" }));
  };
  return {
    get: (id: CodeListId): CodeListState | undefined => states.get(id),
    ensure,
    retry: (id: CodeListId) => {
      states.delete(id);
      ensure(id);
    },
    subscribe: (fn: () => void) => {
      subs.add(fn);
      return () => void subs.delete(fn);
    },
  };
}
