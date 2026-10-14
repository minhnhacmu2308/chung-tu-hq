import { describe, expect, it } from "vitest";
import { healthJob } from "./health.js";

describe("healthJob", () => {
  it("trả pong kèm chuỗi ping", async () => {
    expect(await healthJob({ ping: "xin chào" })).toEqual({ pong: "xin chào" });
  });
  it("payload sai hình dạng thì ném lỗi Zod (không retry được dữ liệu hỏng)", async () => {
    await expect(healthJob({ nope: 1 })).rejects.toThrow();
  });
});
