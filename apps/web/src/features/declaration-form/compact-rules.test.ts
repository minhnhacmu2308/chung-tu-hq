import type { LayoutGroup } from "@kb/contracts";
import { describe, expect, it } from "vitest";
import { groupSpan } from "./compact-rules";

describe("groupSpan – nhóm ô ngắn không chiếm cả hàng (D)", () => {
  const g = (fields: { width?: "xs" | "sm" | "md" | "lg" | "full"; input?: "text" | "textarea" }[]): LayoutGroup => ({
    kind: "group", label: "x", fields: fields.map((f, i) => ({ kind: "field", key: `K${i}`, label: "k", input: f.input ?? "text", ...(f.width ? { width: f.width } : {}) })),
  });
  it("2–3 ô ngắn → nửa hàng (2 cột); có ô rộng, ô nhiều dòng hoặc từ 4 ô → cả hàng", () => {
    expect(groupSpan(g([{ width: "sm" }, { width: "xs" }]))).toBe("half");
    expect(groupSpan(g([{ width: "sm" }, { width: "md" }, { width: "xs" }]))).toBe("half");
    expect(groupSpan(g([{ width: "lg" }, { width: "xs" }]))).toBe("full");
    expect(groupSpan(g([{ input: "textarea" }]))).toBe("full");
    expect(groupSpan(g([{}, {}, {}, {}]))).toBe("full");
  });
});
