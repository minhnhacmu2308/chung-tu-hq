import type { ProductImportItem } from "@kb/contracts";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb, resetDb } from "@/mocks/db";
import { createProduct, deleteProducts, importProducts, listProducts, recordApprovedProducts, updateProduct } from "./products";

const code = async (p: Promise<unknown>) => p.then(() => "OK", (e: { code?: string; reason?: string }) => e.reason ?? e.code);
const input = (v: Record<string, string> = {}) => ({ code: "", name: "Nước hoa YSL Libre EDP 90ml", hsCode: "3303.00.00", unit: "UNA", origin: "fr", tariffSchedule: "B01", importDutyRate: "18%", vatRate: "",
  envTaxRate: "", exciseRate: "", safeguardRate: "", antiDiscriminationRate: "", description: "", unit2: "", unitPrice: "", currency: "", partner: "", note: "", ...v });
const imp = (v: Partial<ProductImportItem> = {}): ProductImportItem => ({
  code: "145612", name: "Nước hoa YSL, 145612. Hàng mới 100%", hsCode: "33030000", unit: "UNA", origin: "FR", tariffSchedule: "B01", importDutyRate: "18", vatRate: null,
  envTaxRate: null, exciseRate: null, safeguardRate: null, antiDiscriminationRate: null, description: null, unit2: null, unitPrice: "46.46", currency: "USD", partner: "DFASS", note: null,
  timesDeclared: 2, lastDeclarationNo: "108091566221", lastDeclarationDate: "2026-03-27", lastTypeCode: "A44", raw: null, ...v,
});
const actAsRole = (role: string) => {
  const m = getDb().members.find((x) => x.role === role);
  if (m) getDb().currentUserId = m.id;
};

beforeEach(() => resetDb());

describe("danh mục hàng hóa (mock)", () => {
  it("có dữ liệu mẫu; thêm tay chuẩn hóa dữ liệu; trùng tên → PRODUCT_NAME_EXISTS; sửa; xóa", async () => {
    const seeded = (await listProducts()).length;
    expect(seeded).toBeGreaterThan(0);
    const p = await createProduct(input());
    expect(p).toMatchObject({ hsCode: "33030000", origin: "FR", importDutyRate: "18", vatRate: null, source: "MANUAL" });
    expect(await code(createProduct(input({ name: "NƯỚC HOA YSL LIBRE EDP 90ML. Hàng mới 100%" })))).toBe("PRODUCT_NAME_EXISTS");
    expect(await code(createProduct(input({ hsCode: "3303" })))).toBe("VALIDATION");
    expect((await updateProduct(p.id, input({ hsCode: "33049930" }))).hsCode).toBe("33049930");
    expect(await deleteProducts([p.id])).toEqual({ deleted: 1 });
    expect(await code(deleteProducts([p.id]))).toBe("PRODUCT_NOT_FOUND");
    expect(await listProducts()).toHaveLength(seeded);
  });

  it("import: thêm mới, import lại không cộng dồn, bản mới hơn ghi đè", async () => {
    expect(await importProducts({ items: [imp()] })).toEqual({ created: 1, updated: 0 });
    expect(await importProducts({ items: [imp()] })).toEqual({ created: 0, updated: 1 });
    await importProducts({ items: [imp({ hsCode: "33049990", lastDeclarationDate: "2026-05-19", timesDeclared: 3 })] });
    expect((await listProducts()).find((p) => p.code === "145612")).toMatchObject({ hsCode: "33049990", timesDeclared: 3, source: "IMPORT", unitPrice: "46.46", currency: "USD", partner: "DFASS" });
  });

  it("Người xem không thêm / import / xóa được", async () => {
    actAsRole("VIEWER");
    expect(await code(createProduct(input()))).toBe("FORBIDDEN");
    expect(await code(importProducts({ items: [imp()] }))).toBe("FORBIDDEN");
    expect(await code(deleteProducts(["prd_seed_1"]))).toBe("FORBIDDEN");
  });

  it("tờ khai được duyệt: mặt hàng mới vào danh mục, mặt hàng đã có tăng số lần khai và giữ HS", () => {
    const db = getDb();
    const existing = { ...db.products.find((p) => p.name.startsWith("Vòng bi cầu 6205"))! };
    const base = { dossierId: "d", quantity: "1", unit: "PCE", unitPrice: "1", amount: "1", origin: "KR", importDutyRate: "3", vatRate: "8" };
    recordApprovedProducts(db, [
      { ...base, id: "a", lineNo: 1, description: "Mặt hàng hoàn toàn mới", hsConfirmed: "8482.10.00" },
      { ...base, id: "b", lineNo: 2, description: existing.name, hsConfirmed: "9999.99.99" },
      { ...base, id: "c", lineNo: 3, description: "Chưa xác nhận HS" },
    ], { typeCode: "A11", currency: "EUR", partner: "SKF GMBH" });
    expect(db.products.find((p) => p.name === "Mặt hàng hoàn toàn mới")).toMatchObject({ source: "DECLARATION", hsCode: "84821000", timesDeclared: 1, lastTypeCode: "A11", unitPrice: "1", currency: "EUR", partner: "SKF GMBH" });
    expect(db.products.find((p) => p.id === existing.id)).toMatchObject({ hsCode: existing.hsCode, timesDeclared: existing.timesDeclared + 1, unitPrice: "1", currency: "EUR", partner: "SKF GMBH", description: existing.description });
    expect(db.products.some((p) => p.name === "Chưa xác nhận HS")).toBe(false);
  });
});
