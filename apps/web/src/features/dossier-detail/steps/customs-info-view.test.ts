import { describe, expect, it } from "vitest";
import { inspectionLabel, vndDiff } from "./customs-info-view";

describe("inspectionLabel", () => {
  it("giải nghĩa mã phân loại kiểm tra 1/2/3; mã lạ giữ nguyên; không có → null", () => {
    expect(inspectionLabel("1")).toMatch(/^1 · Luồng xanh/);
    expect(inspectionLabel("3")).toMatch(/thực tế hàng/);
    expect(inspectionLabel("9")).toBe("9");
    expect(inspectionLabel(undefined)).toBeNull();
  });
});

describe("vndDiff", () => {
  it("chênh lệch Hải quan − ước tính, dấu đúng", () => {
    expect(vndDiff("59786488", "59786000")).toEqual({ diff: "488", same: false });
    expect(vndDiff("100", "250")).toEqual({ diff: "-150", same: false });
    expect(vndDiff("0", "0")).toEqual({ diff: "0", same: true });
  });
  it("thiếu một bên → null", () => {
    expect(vndDiff(undefined, "1")).toBeNull();
    expect(vndDiff("1", undefined)).toBeNull();
  });
});
