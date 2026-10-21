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
  it("STORAGE: mặc định s3 (cần S3_*); azure cần AZURE_STORAGE_CONNECTION_STRING, không cần S3_*", () => {
    expect(loadEnv(base).STORAGE).toBe("s3");
    const { S3_ENDPOINT: _e, S3_BUCKET: _b, S3_ACCESS_KEY_ID: _a, S3_SECRET_ACCESS_KEY: _s, ...noS3 } = base;
    expect(() => loadEnv(noS3)).toThrow(/S3_BUCKET/);
    expect(() => loadEnv({ ...noS3, STORAGE: "azure" })).toThrow(/AZURE_STORAGE_CONNECTION_STRING/);
    const az = loadEnv({ ...noS3, STORAGE: "azure", AZURE_STORAGE_CONNECTION_STRING: "DefaultEndpointsProtocol=https;AccountName=a;AccountKey=k;EndpointSuffix=core.windows.net" });
    expect(az.AZURE_STORAGE_CONTAINER).toBe("khaibao-documents");
    expect(() => loadEnv({ ...noS3, STORAGE: "azure", AZURE_STORAGE_CONNECTION_STRING: "x", AZURE_STORAGE_CONTAINER: "Chung_Tu" })).toThrow(/AZURE_STORAGE_CONTAINER/);
  });
  it("biến rỗng \"\" coi như không đặt (giá trị mặc định áp dụng)", () => {
    expect(loadEnv({ ...base, ANTHROPIC_API_KEY: "", AI_MODEL: "" }).AI_MODEL).toBe("claude-sonnet-5-5");
  });
  it("HS_CLASSIFIER=hscodepro cần HSCODEPRO_URL và HSCODEPRO_INTERNAL_KEY", () => {
    expect(() => loadEnv({ ...base, HS_CLASSIFIER: "hscodepro", HSCODEPRO_URL: "https://dev.aixuatnhapkhau.cloud" })).toThrow(/HSCODEPRO_INTERNAL_KEY/);
    expect(loadEnv({ ...base, HS_CLASSIFIER: "hscodepro", HSCODEPRO_URL: "https://dev.aixuatnhapkhau.cloud", HSCODEPRO_INTERNAL_KEY: "k" }).HSCODEPRO_INTERNAL_KEY).toBe("k");
  });
  it("đơn giá HSCodePro / Customs Hub: mặc định 0, nhận chuỗi thập phân, từ chối số âm/chữ", () => {
    expect(loadEnv(base)).toMatchObject({ HSCODEPRO_PRICE_PER_ITEM_VND: "0", CUSTOMS_HUB_PRICE_PER_MESSAGE_VND: "0" });
    expect(loadEnv({ ...base, HSCODEPRO_PRICE_PER_ITEM_VND: "1500.5", CUSTOMS_HUB_PRICE_PER_MESSAGE_VND: "2200" })).toMatchObject({ HSCODEPRO_PRICE_PER_ITEM_VND: "1500.5", CUSTOMS_HUB_PRICE_PER_MESSAGE_VND: "2200" });
    expect(() => loadEnv({ ...base, CUSTOMS_HUB_PRICE_PER_MESSAGE_VND: "-1" })).toThrow(/CUSTOMS_HUB_PRICE_PER_MESSAGE_VND/);
    expect(() => loadEnv({ ...base, HSCODEPRO_PRICE_PER_ITEM_VND: "abc" })).toThrow(/HSCODEPRO_PRICE_PER_ITEM_VND/);
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
