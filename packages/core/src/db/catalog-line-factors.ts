// Hệ số theo lô trên dòng tờ khai (line_items.unit_factor, đơn vị = ĐVT gốc mặt hàng) chạy trên transaction của uow danh mục – như field-audit.ts:
// đổi ĐVT gốc mặt hàng (spec 2026-11-14 §2) phải chia lại hệ số này CÙNG transaction với quy đổi. Chỉ đọc/ghi cột unit_factor của dòng gắn mặt hàng,
// lọc org_id (RLS line_items vẫn áp). Đây là chỗ duy nhất module catalog chạm bảng của declaration (ADR 0015, bổ sung 2026-11-14).
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { Decimal } from "../shared/decimal.js";
import type { Tx } from "./client.js";
import { lineItems } from "./schema/declaration.js";

export type LineFactorRow = { id: string; dossierId: string; lineNo: number; catalogItemId: string; unitFactor: string };

export function drizzleCatalogLineFactors(tx: Tx) {
  return {
    listForItems: async (orgId: string, itemIds: string[]): Promise<LineFactorRow[]> => {
      if (!itemIds.length) return [];
      const rows = await tx
        .select({ id: lineItems.id, dossierId: lineItems.dossierId, lineNo: lineItems.lineNo, catalogItemId: lineItems.catalogItemId, unitFactor: lineItems.unitFactor })
        .from(lineItems)
        .where(and(eq(lineItems.orgId, orgId), inArray(lineItems.catalogItemId, itemIds), isNotNull(lineItems.unitFactor)));
      return rows.map((r) => ({ id: r.id, dossierId: r.dossierId, lineNo: r.lineNo, catalogItemId: r.catalogItemId!, unitFactor: new Decimal(r.unitFactor!).toFixed() }));
    },
    setFactor: async (orgId: string, id: string, factor: string, now: Date): Promise<void> => {
      await tx.update(lineItems).set({ unitFactor: factor, updatedAt: now }).where(and(eq(lineItems.orgId, orgId), eq(lineItems.id, id)));
    },
  };
}
