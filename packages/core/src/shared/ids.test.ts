import { describe, expect, it } from "vitest";
import { sequentialIdGen, ulidIdGen } from "./ids.js";

describe("ulidIdGen", () => {
  it("sinh id có tiền tố và 26 ký tự ULID, không trùng", () => {
    const a = ulidIdGen.next("dos");
    const b = ulidIdGen.next("dos");
    expect(a).toMatch(/^dos_[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(a).not.toBe(b);
  });
});

describe("sequentialIdGen", () => {
  it("sinh id tăng dần dễ đọc cho test", () => {
    const g = sequentialIdGen();
    expect(g.next("doc")).toBe("doc_0001");
    expect(g.next("doc")).toBe("doc_0002");
  });
});
