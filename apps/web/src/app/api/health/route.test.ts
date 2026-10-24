import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getContainer = vi.fn();
vi.mock("@/container", () => ({ getContainer: () => getContainer() }));

// Ngoặc nhọn bắt buộc: hook trả về một hàm thì vitest gọi nó như cleanup (mockReset() trả về chính mock).
beforeEach(() => {
  getContainer.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

describe("GET /api/health", () => {
  it("?probe=live: trả ok ngay, không chạm hạ tầng, không cần cấu hình", async () => {
    vi.stubEnv("NEXT_PUBLIC_DATA_SOURCE", "http");
    const { GET } = await import("./route");
    const { NextRequest } = await import("next/server");
    const res = await GET(new NextRequest("http://localhost/api/health?probe=live"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, probe: "live" });
    expect(getContainer).not.toHaveBeenCalled();
  });
  it("readiness: kho lưu file lỗi → 503 checks.storage = 'error'; worker đếm được thì trả kèm", async () => {
    vi.stubEnv("NEXT_PUBLIC_DATA_SOURCE", "http");
    getContainer.mockReturnValue({
      pingDb: () => Promise.resolve(),
      redis: { ping: () => Promise.resolve("PONG") },
      dossier: { storage: { put: () => Promise.reject(new Error("AccessDenied secret-bucket")), delete: () => Promise.resolve() } },
      workerCount: () => Promise.resolve(2),
    });
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).toEqual({ ok: false, dataSource: "http", checks: { postgres: "ok", redis: "ok", storage: "error" }, workers: 2 });
    expect(JSON.stringify(body)).not.toContain("secret");
  });
  it("chế độ mock: trả ok, không chạm hạ tầng (bản demo Vercel không có .env)", async () => {
    vi.stubEnv("NEXT_PUBLIC_DATA_SOURCE", "");
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, dataSource: "mock", checks: {} });
    expect(getContainer).not.toHaveBeenCalled();
  });
  it("chế độ http, cấu hình thiếu (loadEnv ném) → 503 JSON, không lộ thông điệp", async () => {
    vi.stubEnv("NEXT_PUBLIC_DATA_SOURCE", "http");
    getContainer.mockImplementation(() => {
      throw new Error("DATABASE_URL: thiếu postgres://kb_app:secret@db");
    });
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).toEqual({ ok: false, dataSource: "http", checks: { config: "error" } });
    expect(JSON.stringify(body)).not.toContain("secret");
  });
  it("chế độ http, Postgres lỗi → 503 với checks.postgres = 'error' (không lộ chuỗi kết nối)", async () => {
    vi.stubEnv("NEXT_PUBLIC_DATA_SOURCE", "http");
    getContainer.mockReturnValue({
      pingDb: () => Promise.reject(new Error("connect ECONNREFUSED kb_app@db:5432")),
      redis: { ping: () => Promise.resolve("PONG") },
    });
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, dataSource: "http", checks: { postgres: "error", redis: "ok" } });
  });
});
