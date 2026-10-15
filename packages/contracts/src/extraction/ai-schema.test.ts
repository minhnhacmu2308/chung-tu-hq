import { describe, expect, it } from "vitest";
import { z } from "zod";
import { DocKindSchema } from "../common.js";
import { customFieldsOf, withCustomFields } from "../catalog/index.js";
import { emptyToNull, extractionSchemaFor, fromAiOutput, toAiOutputSchema } from "./index.js";

/** Số tham số kiểu union (anyOf / type mảng) – API Claude giới hạn 16 cho structured output. */
function countUnions(node: unknown): number {
  if (!node || typeof node !== "object") return 0;
  const n = node as Record<string, unknown>;
  const self = Array.isArray(n["anyOf"]) || Array.isArray(n["type"]) ? 1 : 0;
  return self + Object.values(n).reduce<number>((a, v) => a + (Array.isArray(v) ? v.reduce<number>((b, x) => b + countUnions(x), 0) : countUnions(v)), 0);
}
const jsonOf = (s: z.ZodType) => z.toJSONSchema(s, { target: "draft-7", unrepresentable: "any" });

describe("toAiOutputSchema", () => {
  it.each(DocKindSchema.options)("%s: ≤ 16 tham số union (kể cả khi có 10 trường bổ sung chữ)", (kind) => {
    const custom = customFieldsOf(kind, Array.from({ length: 10 }, (_, i) => ({ key: `extra_${i}`, label: `Thêm ${i}`, type: "string" as const, required: false, aliases: [], extract: true, display: true })));
    expect(countUnions(jsonOf(toAiOutputSchema(withCustomFields(extractionSchemaFor(kind), custom))))).toBeLessThanOrEqual(16);
  });
  it.each(DocKindSchema.options)("%s: ≤ 16 tham số union với 20 trường bổ sung kiểu số (MAX_CUSTOM_FIELDS)", (kind) => {
    const custom = customFieldsOf(kind, Array.from({ length: 20 }, (_, i) => ({ key: `num_${i}`, label: `Số ${i}`, type: "decimal" as const, required: false, aliases: [], extract: true, display: true })));
    expect(countUnions(jsonOf(toAiOutputSchema(withCustomFields(extractionSchemaFor(kind), custom))))).toBeLessThanOrEqual(16);
  });
  it("fromAiOutput: trường bổ sung số gửi dạng chuỗi → về số; rỗng → null; parse được bằng schema gốc", () => {
    const schema = withCustomFields(extractionSchemaFor("PACKING_LIST"), customFieldsOf("PACKING_LIST", [{ key: "cbm", label: "Thể tích", type: "decimal", required: false, aliases: [], extract: true, display: true }, { key: "pallets", label: "Pallet", type: "decimal", required: false, aliases: [], extract: true, display: true }]));
    const ai = toAiOutputSchema(schema) as z.ZodObject;
    expect((ai.shape["custom"] as z.ZodObject).shape["cbm"]!.safeParse("1.25").success).toBe(true);
    expect((ai.shape["custom"] as z.ZodObject).shape["cbm"]!.safeParse("abc").success).toBe(false);
    const back = fromAiOutput(schema, { custom: { cbm: "1.25", pallets: "" } }) as { custom: Record<string, unknown> };
    expect(back.custom).toEqual({ cbm: 1.25, pallets: null });
  });
  it("chữ/ngày nullable → chuỗi (rỗng = không có); số/enum giữ nullable", () => {
    const s = toAiOutputSchema(extractionSchemaFor("ARRIVAL_NOTICE")) as z.ZodObject;
    expect(s.shape["masterBillNo"]!.safeParse("").success).toBe(true);
    expect(s.shape["masterBillNo"]!.safeParse(null).success).toBe(false);
    expect(s.shape["eta"]!.safeParse("").success).toBe(true);
    expect(s.shape["eta"]!.safeParse("2025-04-25").success).toBe(true);
    expect(s.shape["packages"]!.safeParse(null).success).toBe(true);
  });
  it("emptyToNull: chuỗi rỗng → null (cả trong object/mảng) → parse được bằng schema gốc", () => {
    const ai = { billNo: "FANS25040166", vessel: "", eta: "", portOfDischarge: "CAT LAI", finalDestination: "", masterBillNo: "", transportMode: null, flightNo: "", portOfLoading: "", packages: 1, packageUnit: "", grossWeightKg: null, warehouseCode: "", warehouseName: "KHO 3", note: "", charges: [{ label: "THC", amount: 6, currency: "" }], uncertainties: [] };
    const back = emptyToNull(ai) as Record<string, unknown>;
    expect(back["vessel"]).toBeNull();
    expect((back["charges"] as Record<string, unknown>[])[0]!["currency"]).toBeNull();
    expect(back["uncertainties"]).toEqual([]);
    expect(extractionSchemaFor("ARRIVAL_NOTICE").safeParse(back).success).toBe(true);
  });
});
