import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { configureMetrics, observeJob } from "@kb/core/observability";
import { startMetricsServer } from "./metrics-server.js";

const TOKEN = "w".repeat(64);
let server: ReturnType<typeof startMetricsServer>;
let base = "";

beforeAll(async () => {
  configureMetrics({ service: "worker", version: "test", commit: undefined });
  server = startMetricsServer({ port: 0, token: TOKEN, host: "127.0.0.1" });
  await new Promise<void>((r) => server.once("listening", () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

describe("metrics server của worker", () => {
  it("thiếu / sai token → 401", async () => {
    expect((await fetch(`${base}/metrics`)).status).toBe(401);
    expect((await fetch(`${base}/metrics`, { headers: { authorization: "Bearer khong-dung" } })).status).toBe(401);
  });
  it("đường dẫn khác → 404", async () => {
    expect((await fetch(`${base}/`, { headers: { authorization: `Bearer ${TOKEN}` } })).status).toBe(404);
  });
  it("đúng token → chỉ số job có nhãn service=worker", async () => {
    observeJob("extract-document", "completed", 1.5);
    const res = await fetch(`${base}/metrics`, { headers: { authorization: `Bearer ${TOKEN}` } });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toMatch(/khaibao_jobs_total\{[^}]*queue="extract-document"[^}]*outcome="completed"[^}]*\} 1/);
    expect(text).toMatch(/khaibao_jobs_total\{[^}]*service="worker"/);
  });
});
