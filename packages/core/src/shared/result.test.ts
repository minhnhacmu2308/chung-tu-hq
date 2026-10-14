import { describe, expect, it } from "vitest";
import { domainError } from "./errors.js";
import { err, isOk, ok, unwrap } from "./result.js";

describe("Result", () => {
  it("ok/err phân biệt được bằng isOk", () => {
    expect(isOk(ok(1))).toBe(true);
    expect(isOk(err(domainError("NOT_FOUND")))).toBe(false);
  });
  it("unwrap ném lỗi kèm code khi Result là err", () => {
    expect(() => unwrap(err(domainError("FORBIDDEN", "không có quyền")))).toThrow(/FORBIDDEN/);
  });
});
