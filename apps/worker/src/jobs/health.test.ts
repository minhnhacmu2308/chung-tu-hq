import { describe, expect, it } from "vitest";
import { healthJob } from "./health.js";

describe("healthJob", () => {
  it("trả pong kèm chuỗi ping", async () => {
    expect(await healthJob({ ping: "xin chào" })).toEqual({ pong: "xin chào" });
  });
  it("payload sai hình dạng → UnrecoverableError (BullMQ không thử lại dữ liệu hỏng), nêu trường sai", async () => {
    await expect(healthJob({ nope: 1 })).rejects.toMatchObject({ name: "UnrecoverableError", message: expect.stringContaining("ping") });
  });
});
