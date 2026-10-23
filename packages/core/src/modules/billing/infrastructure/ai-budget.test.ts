import { describe, expect, it } from "vitest";
import { fixedClock } from "../../../shared/clock.js";
import { createAiBudget } from "./ai-budget.js";

describe("createAiBudget", () => {
  const clock = fixedClock("2026-10-23T02:00:00.000Z");
  it("trần 0 → luôn cho phép, không đọc chi phí", async () => {
    let asked = 0;
    const b = createAiBudget({ capVnd: "0", spentToday: async () => (asked++, "999999"), clock });
    expect(await b.check("org_a")).toEqual({ allowed: true, spentVnd: "0", capVnd: "0" });
    expect(asked).toBe(0);
  });
  it("dưới trần → cho phép; chạm/vượt trần → chặn, báo số đã dùng và trần (VND làm tròn)", async () => {
    const spent = { v: "120000.4" };
    const b = createAiBudget({ capVnd: "500000", spentToday: async () => spent.v, clock });
    expect(await b.check("org_a")).toEqual({ allowed: true, spentVnd: "120000", capVnd: "500000" });
    spent.v = "500000";
    expect((await b.check("org_a")).allowed).toBe(false);
    spent.v = "650000";
    expect(await b.check("org_a")).toEqual({ allowed: false, spentVnd: "650000", capVnd: "500000" });
  });
});
