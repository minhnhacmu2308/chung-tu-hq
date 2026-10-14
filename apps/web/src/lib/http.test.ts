import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ApiError } from "./api-error";
import { apiGet, apiPost } from "./http";

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

afterEach(() => vi.unstubAllGlobals());

describe("http", () => {
  it("apiGet gọi /api/<path>, gửi cookie, parse bằng schema", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { id: "dos_1" }));
    vi.stubGlobal("fetch", fetchMock);
    const r = await apiGet("dossiers/dos_1", z.object({ id: z.string() }));
    expect(r).toEqual({ id: "dos_1" });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/dossiers/dos_1");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ credentials: "include" });
  });
  it("lỗi 4xx có body {code,message} → ném ApiError giữ code và status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(404, { code: "NOT_FOUND", message: "Không tìm thấy hồ sơ" })));
    await expect(apiGet("dossiers/x")).rejects.toMatchObject(new ApiError("NOT_FOUND", "Không tìm thấy hồ sơ", 404));
  });
  it("lỗi không có body JSON → ApiError code HTTP_<status>", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Bad Gateway", { status: 502 })));
    await expect(apiPost("x", {})).rejects.toMatchObject({ code: "HTTP_502" });
  });
  it("apiPost gửi JSON với content-type", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    await apiPost("dossiers", { a: 1 });
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "POST", body: JSON.stringify({ a: 1 }) });
  });
  it("2xx không có body JSON (204 hoặc body rỗng) → trả undefined, không ném", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    await expect(apiPost("x", {})).resolves.toBeUndefined();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 200 })));
    await expect(apiPost("x", {})).resolves.toBeUndefined();
  });
  it("2xx JSON không khớp schema → ApiError CONTRACT_MISMATCH (không phải ZodError)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { id: 1 })));
    await expect(apiGet("x", z.object({ id: z.string() }))).rejects.toMatchObject({ code: "CONTRACT_MISMATCH", status: 200 });
  });
  it("fetch thất bại (mất mạng) → ApiError NETWORK với thông báo tiếng Việt", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(apiGet("x")).rejects.toMatchObject({ code: "NETWORK", status: 0 });
  });
});
