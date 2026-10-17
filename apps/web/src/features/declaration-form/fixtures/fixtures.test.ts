import { layoutFields, layoutFor } from "@kb/contracts";
import { describe, expect, it } from "vitest";
import { fixtureFor, valuesAt } from "./index";

describe.each(["IDA", "EDA"] as const)("dữ liệu giả %s", (kind) => {
  const f = fixtureFor(kind);
  const fields = layoutFields(layoutFor(kind));
  const byKey = new Map(fields.map((x) => [x.key, x]));
  const customs = new Set(fields.filter((x) => x.origin === "CUSTOMS").map((x) => x.key));

  it("mọi khóa trong dữ liệu giả đều có ô trên bố cục", () => {
    const keys = [f.declarant, ...f.items, f.customsByStage["da-khai"].header, f.customsByStage["thong-quan"].header, ...f.customsByStage["da-khai"].items, ...f.customsByStage["thong-quan"].items].flatMap((v) => Object.keys(v));
    expect([...new Set(keys)].filter((k) => !byKey.has(k))).toEqual([]);
  });
  it("phần người khai không chứa ô Hải quan trả về; phần Hải quan chỉ chứa ô Hải quan", () => {
    expect([f.declarant, ...f.items].flatMap((v) => Object.keys(v)).filter((k) => customs.has(k))).toEqual([]);
    const hq = [f.customsByStage["da-khai"], f.customsByStage["thong-quan"]].flatMap((s) => [s.header, ...s.items]).flatMap((v) => Object.keys(v));
    expect(hq.filter((k) => !customs.has(k))).toEqual([]);
  });
  it("giai đoạn: nháp chưa có số tờ khai; đã khai có số tờ khai; thông quan có ngày cấp phép", () => {
    const no = kind === "IDA" ? "TK_ICN" : "TK_ECN";
    const permit = kind === "IDA" ? "TK_C21" : "TK_K86";
    expect(valuesAt(f, "nhap").header[no]).toBeUndefined();
    expect(valuesAt(f, "da-khai").header[no]).toMatch(/^\d{12}$/);
    expect(valuesAt(f, "da-khai").header[permit]).toBeUndefined();
    expect(valuesAt(f, "thong-quan").header[permit]).toBeTruthy();
  });
  it("dòng hàng: phần Hải quan gộp theo đúng thứ tự dòng", () => {
    const at = valuesAt(f, "da-khai");
    expect(at.items).toHaveLength(f.items.length);
    expect(at.items[0]!["HAG_CMD"]).toBe(f.items[0]!["HAG_CMD"]);
  });
});
