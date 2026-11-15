import { describe, expect, it } from "vitest";
import { identifierState } from "../identifier.js";

describe("identifierState – TRANG_THAI định danh", () => {
  it("15 kèm số định danh → ACCEPTED", () => {
    expect(identifierState("15", "122600050501472")).toBe("ACCEPTED");
  });
  it("15 chưa có số → còn chờ (PENDING)", () => {
    expect(identifierState("15", "")).toBe("PENDING");
    expect(identifierState("15", null)).toBe("PENDING");
  });
  it("10 → REJECTED", () => {
    expect(identifierState("10", null)).toBe("REJECTED");
  });
  it("0 / 11 / 12 / thiếu → PENDING", () => {
    for (const s of ["0", "11", "12", "", null, undefined]) expect(identifierState(s, null)).toBe("PENDING");
  });
  it("bỏ khoảng trắng của mã trạng thái", () => {
    expect(identifierState(" 15 ", "DD1")).toBe("ACCEPTED");
  });
});
