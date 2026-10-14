import { describe, expect, it } from "vitest";
import { DecimalStringSchema, IsoDateSchema, IsoDateTimeSchema, STEP_ORDER, StepIdSchema } from "./common.js";

describe("DecimalStringSchema", () => {
  it.each(["0", "-0.50", "1234567.123456", "20850.00"])("chấp nhận %s", (v) => {
    expect(DecimalStringSchema.parse(v)).toBe(v);
  });
  it.each(["1,5", "abc", "1e3", "", " 1", "1.", ".5", "+1"])("từ chối %s", (v) => {
    expect(DecimalStringSchema.safeParse(v).success).toBe(false);
  });
});

describe("IsoDateSchema", () => {
  it("chấp nhận YYYY-MM-DD hợp lệ", () => {
    expect(IsoDateSchema.parse("2026-10-13")).toBe("2026-10-13");
  });
  it.each(["13/10/2026", "2026-13-01", "2026-02-30", "2026-1-5"])("từ chối %s", (v) => {
    expect(IsoDateSchema.safeParse(v).success).toBe(false);
  });
});

describe("IsoDateTimeSchema", () => {
  it("chấp nhận ISO 8601 UTC", () => {
    expect(IsoDateTimeSchema.parse("2026-10-13T08:00:00.000Z")).toBe("2026-10-13T08:00:00.000Z");
  });
  it("từ chối thiếu múi giờ", () => {
    expect(IsoDateTimeSchema.safeParse("2026-10-13T08:00:00").success).toBe(false);
  });
});

describe("StepId", () => {
  it("STEP_ORDER đủ 6 bước đúng thứ tự", () => {
    expect(STEP_ORDER).toEqual(["create", "upload", "ocr", "agent", "review", "submit"]);
    for (const s of STEP_ORDER) expect(StepIdSchema.parse(s)).toBe(s);
  });
});
