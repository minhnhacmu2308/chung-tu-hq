import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { DocKindSchema } from "../common.js";
import { extractionSchemaFor } from "../extraction/index.js";
import { DOC_CATALOG, findCatalogField } from "./index.js";

const KINDS = DocKindSchema.options;
const shapeOf = (kind: (typeof KINDS)[number]) => (extractionSchemaFor(kind) as z.ZodObject).shape as Record<string, z.ZodType>;

describe("DOC_CATALOG", () => {
  it.each(KINDS)("%s: key phần đầu khớp đúng thứ tự với schema Zod", (kind) => {
    const listKey = DOC_CATALOG[kind].items?.key;
    const schemaKeys = Object.keys(shapeOf(kind)).filter((k) => k !== "uncertainties" && k !== listKey);
    expect(DOC_CATALOG[kind].fields.map((f) => f.key)).toEqual(schemaKeys);
  });
  it.each(KINDS)("%s: key dòng hàng khớp schema (nếu có)", (kind) => {
    const list = DOC_CATALOG[kind].items;
    if (!list) return;
    const el = (shapeOf(kind)[list.key] as z.ZodArray<z.ZodObject>).element;
    expect(list.fields.map((f) => f.key)).toEqual(Object.keys(el.shape));
  });
  it("mọi trường có nhãn tiếng Việt, key không trùng trong cùng loại", () => {
    for (const c of Object.values(DOC_CATALOG)) {
      const keys = [...c.fields, ...(c.items?.fields ?? [])].map((f) => f.key);
      expect(new Set(c.fields.map((f) => f.key)).size).toBe(c.fields.length);
      expect(keys.length).toBeGreaterThan(0);
      for (const f of [...c.fields, ...(c.items?.fields ?? [])]) expect(f.label.trim()).not.toBe("");
    }
  });
  it("findCatalogField khớp nhãn/alias bỏ dấu, hoa thường, dấu câu", () => {
    expect(findCatalogField("INVOICE", "Inv. No")).toEqual({ key: "invoiceNo", item: false });
    expect(findCatalogField("BILL_OF_LADING", "Ocean Vessel")).toEqual({ key: "vessel", item: false });
    expect(findCatalogField("INVOICE", "UNIT PRICE")).toEqual({ key: "unitPrice", item: true });
    expect(findCatalogField("ARRIVAL_NOTICE", "Tàu (Vessel)")).toEqual({ key: "vessel", item: false });
    expect(findCatalogField("INVOICE", "không có")).toBeNull();
  });
});
