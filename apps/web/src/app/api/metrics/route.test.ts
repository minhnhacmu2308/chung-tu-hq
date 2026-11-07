import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const TOKEN = "t".repeat(64);
const get = (auth?: string) => GET(new NextRequest("http://localhost/api/metrics", auth ? { headers: { authorization: auth } } : {}));

describe("GET /api/metrics", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("chưa đặt METRICS_TOKEN → 404 (tắt hẳn)", async () => {
    vi.stubEnv("METRICS_TOKEN", "");
    expect((await get(`Bearer ${TOKEN}`)).status).toBe(404);
  });
  it("thiếu hoặc sai token → 401, không lộ chỉ số", async () => {
    vi.stubEnv("METRICS_TOKEN", TOKEN);
    expect((await get()).status).toBe(401);
    const bad = await get("Bearer sai-token");
    expect(bad.status).toBe(401);
    expect(await bad.text()).not.toContain("khaibao_");
  });
  it("đúng token → văn bản Prometheus có nhãn service=web và build_info", async () => {
    vi.stubEnv("METRICS_TOKEN", TOKEN);
    vi.stubEnv("GIT_COMMIT", "abc1234def5678");
    const res = await get(`Bearer ${TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain");
    const text = await res.text();
    expect(text).toMatch(/khaibao_build_info\{version="[^"]*",commit="abc1234def56",service="web"\} 1/);
    expect(text).toContain("khaibao_process_cpu_seconds_total");
  });
});
