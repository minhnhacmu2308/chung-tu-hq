import type { Job } from "bullmq";
import { describe, expect, it } from "vitest";
import { perOrgLimit, type SemaphoreRedis } from "./_per-org.js";

function fakeRedis(): SemaphoreRedis & { counters: Map<string, number> } {
  const counters = new Map<string, number>();
  return {
    counters,
    incr: async (k) => (counters.set(k, (counters.get(k) ?? 0) + 1), counters.get(k)!),
    decr: async (k) => (counters.set(k, (counters.get(k) ?? 0) - 1), counters.get(k)!),
    expire: async () => 1,
    del: async (k) => counters.delete(k),
  };
}
const job = (orgId: string | undefined) => {
  const delayed: number[] = [];
  const j = { data: orgId ? { orgId } : {}, moveToDelayed: async (ts: number) => void delayed.push(ts) } as unknown as Job;
  return { j, delayed };
};

describe("perOrgLimit", () => {
  it("dưới giới hạn → chạy và trả chỗ; hết chỗ → đưa job về hàng trễ (DelayedError), không chạy handler", async () => {
    const redis = fakeRedis();
    let release!: () => void;
    const blocked = new Promise<void>((r) => (release = r));
    const run = perOrgLimit(redis, "extract-document", 1, async () => { await blocked; return "ok"; });
    const a = job("org_a");
    const first = run(a.j, "tok");
    await new Promise((r) => setTimeout(r, 0));
    expect(redis.counters.get("org-slots:extract-document:org_a")).toBe(1);
    const b = job("org_a");
    await expect(run(b.j, "tok")).rejects.toMatchObject({ name: "DelayedError" });
    expect(b.delayed).toHaveLength(1);
    expect(b.delayed[0]).toBeGreaterThan(Date.now() + 2_000);
    // Doanh nghiệp khác không bị ảnh hưởng.
    const c = job("org_b");
    let ran = false;
    await perOrgLimit(redis, "extract-document", 1, async () => { ran = true; })(c.j, "tok");
    expect(ran).toBe(true);
    release();
    expect(await first).toBe("ok");
    expect(redis.counters.has("org-slots:extract-document:org_a")).toBe(false);
  });
  it("handler ném lỗi vẫn trả chỗ; payload không có orgId → chạy thẳng", async () => {
    const redis = fakeRedis();
    const run = perOrgLimit(redis, "run-agent", 2, async () => { throw new Error("boom"); });
    await expect(run(job("org_a").j, "tok")).rejects.toThrow("boom");
    expect(redis.counters.has("org-slots:run-agent:org_a")).toBe(false);
    let ran = false;
    await perOrgLimit(redis, "run-agent", 2, async () => { ran = true; })(job(undefined).j, "tok");
    expect(ran).toBe(true);
    expect(redis.counters.size).toBe(0);
  });
});
