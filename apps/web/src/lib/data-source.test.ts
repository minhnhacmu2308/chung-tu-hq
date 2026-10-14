import { afterEach, describe, expect, it, vi } from "vitest";
import { dataSource, pick } from "./data-source";

afterEach(() => vi.unstubAllEnvs());

describe("dataSource", () => {
  it("không đặt biến → mock (demo Vercel, PM chạy không cần backend)", () => {
    vi.stubEnv("NEXT_PUBLIC_DATA_SOURCE", "");
    expect(dataSource()).toBe("mock");
    expect(pick("m", "h")).toBe("m");
  });
  it("http → http", () => {
    vi.stubEnv("NEXT_PUBLIC_DATA_SOURCE", "http");
    expect(pick("m", "h")).toBe("h");
  });
});
