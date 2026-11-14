// Bổ sung 2026-11-14 (spec catalog-nguon-goc-ghep-cot): bộ nguồn gốc, ghép cột đủ trường, cột Mã nối, hàng chờ giữ hệ số.
import { describe, expect, it } from "vitest";
import { REASON_CODES } from "../reason-codes.js";
import { detectItemColumns, ITEM_IMPORT_FIELDS, ItemImportFieldSchema, ItemImportRowSchema, parseItemKind, validateItemRows } from "./excel.js";
import { ITEM_MATCH_REASONS } from "./match.js";
import {
  CatalogItemFieldsSchema, ChangeSourceInputSchema, CodeSetSchema, MatchQueueItemSchema, SetupCatalogInputSchema, SourceChangePreviewSchema, SourceChangeResultSchema, SourcePreviewQuerySchema,
} from "./schemas.js";

describe("bộ nguồn gốc – schema", () => {
  it("CodeSet có isSource", () => {
    const base = { id: "s", kind: "CUSTOMS", name: "XNK", partnerName: null, partnerKey: null, isPrimaryDisplay: false, isDefault: true, ownerIds: [], codeCount: 0 };
    expect(CodeSetSchema.safeParse({ ...base, isSource: true }).success).toBe(true);
    expect(CodeSetSchema.safeParse(base).success).toBe(false);
  });
  it("setup: sourceKind chỉ nhận bộ bộ phận (Kế toán/Kho/XNK), không bắt buộc", () => {
    expect(SetupCatalogInputSchema.parse({ mode: "PER_DEPARTMENT", sourceKind: "ACCOUNTING" }).sourceKind).toBe("ACCOUNTING");
    expect(SetupCatalogInputSchema.parse({ mode: "SHARED" }).sourceKind).toBeUndefined();
    expect(SetupCatalogInputSchema.safeParse({ mode: "PER_DEPARTMENT", sourceKind: "SUPPLIER" }).success).toBe(false);
  });
  it("đổi nguồn gốc: body + query + kết quả xem trước / thực hiện", () => {
    expect(ChangeSourceInputSchema.safeParse({ codeSetId: "cst_1" }).success).toBe(true);
    expect(ChangeSourceInputSchema.safeParse({ codeSetId: "" }).success).toBe(false);
    expect(SourcePreviewQuerySchema.safeParse({ codeSetId: "cst_1" }).success).toBe(true);
    const blocked = [{ itemId: "i", itemNo: "MH-000001", name: "Vải", code: "V1", baseUnit: "MTR", newUnit: "ROL" }];
    expect(SourceChangePreviewSchema.safeParse({ codeSetId: "s", currentSourceId: null, totalItems: 3, rebaseCount: 1, unchangedCount: 1, missingCount: 0, blocked }).success).toBe(true);
    expect(SourceChangeResultSchema.safeParse({ codeSets: [], rebased: 1, unchanged: 0, missingCount: 0, blocked, changed: true }).success).toBe(true);
  });
  it("hàng chờ: factor (Decimal > 0 hoặc null) + itemFields", () => {
    const q = {
      id: "q", importId: null, codeSetId: "s", code: "A", name: "A", unit: null, hsCode: null, level: "NONE", suggestedItemId: null, candidates: [], reason: "NO_MATCH",
      status: "PENDING", decidedBy: null, decidedAt: null, sourceRef: null,
    };
    expect(MatchQueueItemSchema.safeParse({ ...q, factor: "12.5", itemFields: { kind: "MATERIAL", vatRate: "8" } }).success).toBe(true);
    expect(MatchQueueItemSchema.safeParse({ ...q, factor: null, itemFields: null }).success).toBe(true);
    expect(MatchQueueItemSchema.safeParse({ ...q, factor: "0", itemFields: null }).success).toBe(false);
    expect(CatalogItemFieldsSchema.safeParse({ origin: "VN", importDutyRate: "5.5", note: "x" }).success).toBe(true);
    expect(CatalogItemFieldsSchema.safeParse({ importDutyRate: "-1" }).success).toBe(false);
  });
});

describe("lý do mới", () => {
  it("ITEM_MATCH_REASONS có LINKED_BY_CODE, LINK_NOT_FOUND; mã lý do CATALOG_SOURCE_SET_INVALID", () => {
    expect(ITEM_MATCH_REASONS).toEqual(expect.arrayContaining(["LINKED_BY_CODE", "LINK_NOT_FOUND"]));
    expect(REASON_CODES).toContain("CATALOG_SOURCE_SET_INVALID");
  });
});

describe("ghép cột – đủ trường", () => {
  it("danh sách trường hệ thống", () => {
    expect(ItemImportFieldSchema.options).toEqual(ITEM_IMPORT_FIELDS);
    expect(ITEM_IMPORT_FIELDS).toEqual([
      "code", "name", "unit", "hs", "factor", "linkCode", "kind", "origin", "tariffSchedule", "importDutyRate", "vatRate", "envTaxRate", "exciseRate", "safeguardRate", "antiDiscriminationRate", "qty2Unit", "qty2Factor", "description", "note",
    ]);
  });
  it("tự đoán cột mới theo tên, giữ cách đoán cũ", () => {
    expect(detectItemColumns(["Mã hàng", "Tên hàng", "ĐVT"])).toEqual({ code: 0, name: 1, unit: 2 });
    expect(detectItemColumns(["Mã hàng", "Tên hàng", "Mã nối", "Loại hàng", "Xuất xứ", "Biểu thuế", "Thuế NK", "Thuế GTGT", "Thuế BVMT", "Thuế TTĐB", "Thuế tự vệ", "Thuế chống phân biệt đối xử", "Mô tả", "Ghi chú"])).toEqual({
      code: 0, name: 1, linkCode: 2, kind: 3, origin: 4, tariffSchedule: 5, importDutyRate: 6, vatRate: 7, envTaxRate: 8, exciseRate: 9, safeguardRate: 10, antiDiscriminationRate: 11, description: 12, note: 13,
    });
    // "Description" vẫn là Tên khi không có cột tên khác đứng trước.
    expect(detectItemColumns(["Code", "Description"])).toEqual({ code: 0, name: 1 });
    expect(detectItemColumns(["Cột lạ"])).toEqual({});
  });
  it("loại hàng: mã enum hoặc nhãn tiếng Việt/Anh", () => {
    expect(parseItemKind("material")).toBe("MATERIAL");
    expect(parseItemKind("Nguyên liệu")).toBe("MATERIAL");
    expect(parseItemKind("nguyen vat lieu")).toBe("MATERIAL");
    expect(parseItemKind("Sản phẩm")).toBe("PRODUCT");
    expect(parseItemKind("Hàng hóa")).toBe("GOODS");
    expect(parseItemKind("Vật tư")).toBe("SUPPLY");
    expect(parseItemKind("xyz")).toBeNull();
  });
  it("kiểm từng ô trường mới: loại, xuất xứ 2 chữ, thuế suất 0–1000, độ dài", () => {
    const rows = [
      { code: "A", name: "a", linkCode: " mh-000001 ", kind: "Nguyên liệu", origin: "vn", tariffSchedule: "B01", importDutyRate: "5,5", vatRate: "8%", description: "mô tả", note: "ghi chú" },
      { code: "B", name: "b", kind: "lạ" },
      { code: "C", name: "c", origin: "VNM" },
      { code: "D", name: "d", vatRate: "1001" },
      { code: "E", name: "e", envTaxRate: "-1" },
      { code: "F", name: "f", exciseRate: "1.23456" },
      { code: "G", name: "g", note: "x".repeat(501) },
    ];
    const r = validateItemRows(rows);
    expect(r.errors).toEqual([
      { row: 2, field: "kind", code: "INVALID_FORMAT" },
      { row: 3, field: "origin", code: "INVALID_FORMAT" },
      { row: 4, field: "vatRate", code: "INVALID_FORMAT" },
      { row: 5, field: "envTaxRate", code: "INVALID_FORMAT" },
      { row: 6, field: "exciseRate", code: "INVALID_FORMAT" },
      { row: 7, field: "note", code: "TOO_LONG" },
    ]);
    expect(r.ok).toEqual([
      {
        code: "A", name: "a", linkCode: "mh-000001",
        fields: { kind: "MATERIAL", origin: "VN", tariffSchedule: "B01", importDutyRate: "5.5", vatRate: "8", description: "mô tả", note: "ghi chú" },
      },
    ]);
  });
  it("dòng chỉ có trường cũ giữ nguyên kết quả (không có fields)", () => {
    expect(validateItemRows([{ code: "A", name: "a", unit: "PCE", factor: "2" }]).ok).toEqual([{ code: "A", name: "a", unit: "PCE", factor: "2" }]);
  });
  it("row schema nhận các trường mới (tùy chọn)", () => {
    expect(ItemImportRowSchema.safeParse({ code: "A", name: "a", linkCode: "X", vatRate: "8" }).success).toBe(true);
  });
});
