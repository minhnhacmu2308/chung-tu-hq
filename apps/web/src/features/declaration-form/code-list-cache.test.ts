import type { CodeListEntry } from "@kb/contracts";
import { describe, expect, it } from "vitest";
import { createCodeListCache } from "./code-list-cache";

const A: CodeListEntry[] = [{ code: "1", name: "Hàng không" }] as CodeListEntry[];

describe("createCodeListCache – danh mục tải khi cần, có trạng thái đang tải / lỗi / thử lại", () => {
  it("đang tải → sẵn sàng; tải một lần cho cả trang", async () => {
    let calls = 0;
    const c = createCodeListCache(async () => { calls++; return A; });
    c.ensure("TRANSPORT_MODE" as never);
    c.ensure("TRANSPORT_MODE" as never);
    expect(c.get("TRANSPORT_MODE" as never)).toEqual({ status: "loading" });
    await Promise.resolve(); await Promise.resolve();
    expect(c.get("TRANSPORT_MODE" as never)).toEqual({ status: "ready", list: A });
    expect(calls).toBe(1);
  });
  it("tải lỗi → 'error' (không treo ở đang tải); thử lại tải lại", async () => {
    let fail = true;
    const c = createCodeListCache(async () => { if (fail) throw new Error("mạng"); return A; });
    let notified = 0;
    c.subscribe(() => notified++);
    c.ensure("X" as never);
    await Promise.resolve(); await Promise.resolve();
    expect(c.get("X" as never)).toEqual({ status: "error" });
    fail = false;
    c.retry("X" as never);
    await Promise.resolve(); await Promise.resolve();
    expect(c.get("X" as never)).toEqual({ status: "ready", list: A });
    expect(notified).toBeGreaterThanOrEqual(3);
  });
});
