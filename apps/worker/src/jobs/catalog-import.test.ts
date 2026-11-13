import { UnrecoverableError } from "bullmq";
import type { CatalogDeps, runMatch } from "@kb/core/modules/catalog";
import { describe, expect, it } from "vitest";
import { catalogImportJob } from "./catalog-import.js";

const deps = {} as CatalogDeps;
const done = { id: "cim_1", codeSetId: "s", fileName: "f.xlsx", columnMap: {}, status: "DONE" as const, counts: { created: 0, matched: 10, queued: 590, skipped: 0, errors: 0 }, errors: [], progress: { done: 600, total: 600 }, createdAt: "2026-11-13T00:00:00.000Z", createdBy: "u" };

describe("catalogImportJob", () => {
  it("payload hợp lệ → chạy runMatch theo org/người nhập/lần nhập, trả counts", async () => {
    const calls: unknown[] = [];
    const run = (async (_d, ctx, id) => {
      calls.push([ctx, id]);
      return { ok: true, value: done };
    }) as typeof runMatch;
    const r = await catalogImportJob(deps, { orgId: "org_a", userId: "usr_1", importId: "cim_1" }, run);
    expect(r).toEqual({ status: "DONE", created: 0, matched: 10, queued: 590, skipped: 0, errors: 0 });
    expect(calls).toEqual([[{ orgId: "org_a", userId: "usr_1" }, "cim_1"]]);
  });
  it("payload sai → UnrecoverableError (không retry)", async () => {
    await expect(catalogImportJob(deps, { orgId: "org_a" })).rejects.toBeInstanceOf(UnrecoverableError);
  });
  it("lỗi nghiệp vụ (không tìm thấy lần nhập) → trả mã lỗi, không ném", async () => {
    const run = (async () => ({ ok: false, error: { code: "NOT_FOUND" } })) as unknown as typeof runMatch;
    expect(await catalogImportJob(deps, { orgId: "org_a", userId: "u", importId: "x" }, run)).toBe("NOT_FOUND");
  });
});
