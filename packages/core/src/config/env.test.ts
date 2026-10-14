import { describe, expect, it } from "vitest";
import { loadEnv } from "./env.js";

const base = {
  DATABASE_URL: "postgres://kb_app:kb_app@localhost:5432/khaibao",
  DATABASE_ADMIN_URL: "postgres://kb_admin:kb_admin@localhost:5432/khaibao",
  REDIS_URL: "redis://localhost:6379",
  S3_ENDPOINT: "http://localhost:9000", S3_BUCKET: "b", S3_ACCESS_KEY_ID: "a", S3_SECRET_ACCESS_KEY: "s",
  APP_MASTER_KEY: Buffer.alloc(32, 1).toString("base64"),
  APP_URL: "http://localhost:3100",
};

describe("loadEnv", () => {
  it("mặc định: adapter fake, mail console, S3 path-style", () => {
    const env = loadEnv(base);
    expect(env.AI_PROVIDER).toBe("fake");
    expect(env.CUSTOMS_GATEWAY).toBe("fake");
    expect(env.MAIL).toBe("console");
    expect(env.S3_FORCE_PATH_STYLE).toBe(true);
  });
  it("biến rỗng \"\" coi như không đặt (giá trị mặc định áp dụng)", () => {
    expect(loadEnv({ ...base, ANTHROPIC_API_KEY: "", AI_MODEL: "" }).AI_MODEL).toBe("claude-sonnet-5-5");
  });
  it("AI_PROVIDER=claude mà thiếu ANTHROPIC_API_KEY thì ném lỗi nêu tên biến", () => {
    expect(() => loadEnv({ ...base, AI_PROVIDER: "claude" })).toThrow(/ANTHROPIC_API_KEY/);
  });
  it("APP_MASTER_KEY không phải 32 byte base64 thì ném lỗi", () => {
    expect(() => loadEnv({ ...base, APP_MASTER_KEY: "ngan" })).toThrow(/APP_MASTER_KEY/);
  });
  it("thiếu DATABASE_URL thì ném lỗi liệt kê biến", () => {
    const { DATABASE_URL: _omit, ...rest } = base;
    expect(() => loadEnv(rest)).toThrow(/DATABASE_URL/);
  });
});
