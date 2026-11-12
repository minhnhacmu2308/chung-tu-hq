import { describe, expect, it } from "vitest";
import { copySet } from "./copies";

describe("copySet (UCP600 17 – bộ bản gốc / bản sao)", () => {
  it("1 gốc + 2 sao", () => expect(copySet(1, 2)).toEqual(["ORIGINAL", "COPY", "COPY"]));
  it("3 gốc", () => expect(copySet(3, 0)).toEqual(["ORIGINAL", "ORIGINAL", "ORIGINAL"]));
  it("ít nhất 1 bản gốc, tối đa 10 + 10", () => {
    expect(copySet(0, 0)).toEqual(["ORIGINAL"]);
    expect(copySet(99, 99)).toHaveLength(20);
  });
});
