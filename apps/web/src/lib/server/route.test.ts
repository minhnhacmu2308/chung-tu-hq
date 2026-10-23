import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { silentLogger } from "@kb/core/shared";
import { clientIp, crossSiteOrigin, fromResult, HttpError, parseBody, REQUEST_ID_HEADER, route, setRouteLogger } from "./route";

const req = (body?: unknown) =>
  new NextRequest("http://localhost/api/x", { method: "POST", ...(body !== undefined ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } } : {}) });
const ctx = { params: Promise.resolve({}) };

describe("route()", () => {
  it("handler trả object → 200 JSON", async () => {
    const res = await route(async () => ({ ok: true }))(req(), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
  it("HttpError 401 → JSON {code}", async () => {
    const res = await route(async () => {
      throw new HttpError(401, "UNAUTHENTICATED", "Chưa đăng nhập");
    })(req(), ctx);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ code: "UNAUTHENTICATED", message: "Chưa đăng nhập" });
  });
  it("parseBody sai schema → 400 VALIDATION có issues", async () => {
    const res = await route(async (r) => parseBody(r, z.object({ email: z.string().email() })))(req({ email: "x" }), ctx);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("VALIDATION");
    expect(Array.isArray(body.issues)).toBe(true);
  });
  it("body không phải JSON → 400 VALIDATION", async () => {
    const bad = new NextRequest("http://localhost/api/x", { method: "POST", body: "{oops", headers: { "content-type": "application/json" } });
    const res = await route(async (r) => parseBody(r, z.object({})))(bad, ctx);
    expect(res.status).toBe(400);
  });
  it("fromResult(err NOT_FOUND) → 404; FORBIDDEN → 403; RATE_LIMITED → 429; EMAIL_TAKEN → 409", async () => {
    const codes: [string, number][] = [["NOT_FOUND", 404], ["FORBIDDEN", 403], ["RATE_LIMITED", 429], ["EMAIL_TAKEN", 409], ["INVALID_CREDENTIALS", 401], ["MEMBERSHIP_PENDING", 403]];
    for (const [code, status] of codes) {
      const res = await route(async () => fromResult({ ok: false, error: { code: code as never, message: "m" } }))(req(), ctx);
      expect(res.status).toBe(status);
      expect(await res.json()).toEqual({ code, message: "m" });
    }
  });
  it("DomainError có mã lý do → JSON {code, message, reason, params} (server không dịch)", async () => {
    const error = { code: "HS_UNCONFIRMED" as const, message: "Còn 2 mã HS chưa xác nhận", reason: "HS_UNCONFIRMED" as const, params: { n: 2 } };
    const res = await route(async () => fromResult({ ok: false, error }))(req(), ctx);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ code: "HS_UNCONFIRMED", message: "Còn 2 mã HS chưa xác nhận", reason: "HS_UNCONFIRMED", params: { n: 2 } });
  });
  it("lỗi lạ → 500 INTERNAL kèm requestId, không lộ message; requestId cũng nằm ở header mọi phản hồi", async () => {
    setRouteLogger(silentLogger);
    const res = await route(async () => {
      throw new Error("postgres://kb_app:secret@db");
    })(req(), ctx);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(JSON.stringify(body)).not.toContain("secret");
    expect(body.requestId).toBe(res.headers.get(REQUEST_ID_HEADER));
    expect(body.requestId).toMatch(/^[0-9a-f-]{36}$/);
    setRouteLogger(undefined);
  });
  it("x-request-id hợp lệ từ proxy được giữ nguyên; giá trị lạ bị thay bằng id mới", async () => {
    const ok = new NextRequest("http://localhost/api/x", { headers: { "x-request-id": "proxy-abc-123" } });
    expect((await route(async () => ({}))(ok, ctx)).headers.get(REQUEST_ID_HEADER)).toBe("proxy-abc-123");
    const bad = new NextRequest("http://localhost/api/x", { headers: { "x-request-id": "<script>" } });
    expect((await route(async () => ({}))(bad, ctx)).headers.get(REQUEST_ID_HEADER)).toMatch(/^[0-9a-f-]{36}$/);
  });
  it("clientIp: lấy IP ở vị trí proxy tin cậy từ cuối X-Forwarded-For (phần đầu do khách giả không ăn); 0 proxy → bỏ qua XFF", () => {
    const r = (h: Record<string, string>) => new NextRequest("http://app.local/api/x", { headers: h });
    expect(clientIp(r({ "x-forwarded-for": "1.1.1.1, 203.0.113.9" }), 1)).toBe("203.0.113.9");
    expect(clientIp(r({ "x-forwarded-for": "1.1.1.1, 203.0.113.9, 10.0.0.2" }), 2)).toBe("203.0.113.9");
    expect(clientIp(r({ "x-forwarded-for": "203.0.113.9" }), 3)).toBe("203.0.113.9");
    expect(clientIp(r({ "x-forwarded-for": "1.1.1.1", "x-real-ip": "203.0.113.9" }), 0)).toBe("203.0.113.9");
    expect(clientIp(r({}), 1)).toBe("unknown");
  });
  it("chống CSRF: POST có Origin khác host → 403 CSRF; cùng host (kể cả sau proxy) hoặc không có Origin → qua; GET không kiểm", async () => {
    const mk = (method: string, headers: Record<string, string>) => new NextRequest("http://app.local/api/x", { method, headers });
    expect(crossSiteOrigin(mk("POST", { origin: "https://evil.example", host: "app.local" }))).toBe(true);
    expect(crossSiteOrigin(mk("POST", { origin: "null", host: "app.local" }))).toBe(true);
    expect(crossSiteOrigin(mk("POST", { "sec-fetch-site": "cross-site", host: "app.local" }))).toBe(true);
    expect(crossSiteOrigin(mk("POST", { origin: "https://app.local", host: "app.local" }))).toBe(false);
    expect(crossSiteOrigin(mk("POST", { origin: "https://khaibao.vn", host: "10.0.0.5:3000", "x-forwarded-host": "khaibao.vn" }))).toBe(false);
    expect(crossSiteOrigin(mk("POST", { host: "app.local" }))).toBe(false);
    expect(crossSiteOrigin(mk("GET", { origin: "https://evil.example", host: "app.local" }))).toBe(false);
    const res = await route(async () => ({ ok: true }))(mk("POST", { origin: "https://evil.example", host: "app.local" }), ctx);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ code: "CSRF", message: "Request không đến từ ứng dụng" });
  });
});
