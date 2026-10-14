import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { proxy } from "./proxy";

afterEach(() => vi.unstubAllEnvs());
const req = (path: string, cookie?: string) => new NextRequest(`http://localhost:3100${path}`, { headers: cookie ? { cookie } : {} });

describe("proxy", () => {
  it("nguồn mock → cho qua mọi đường dẫn", () => {
    vi.stubEnv("NEXT_PUBLIC_DATA_SOURCE", "mock");
    expect(proxy(req("/dossiers")).headers.get("location")).toBeNull();
  });
  it("nguồn http: /dossiers không cookie → chuyển về /login?next=", () => {
    vi.stubEnv("NEXT_PUBLIC_DATA_SOURCE", "http");
    const res = proxy(req("/dossiers?direction=NK"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3100/login?next=%2Fdossiers%3Fdirection%3DNK");
  });
  it("nguồn http: có cookie → cho qua; /login, /register, /api/* không cần cookie", () => {
    vi.stubEnv("NEXT_PUBLIC_DATA_SOURCE", "http");
    expect(proxy(req("/dossiers", "kb_session=abc")).headers.get("location")).toBeNull();
    expect(proxy(req("/login")).headers.get("location")).toBeNull();
    expect(proxy(req("/register")).headers.get("location")).toBeNull();
    expect(proxy(req("/api/auth/login")).headers.get("location")).toBeNull();
  });
});
