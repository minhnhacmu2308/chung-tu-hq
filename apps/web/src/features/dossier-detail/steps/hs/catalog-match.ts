// Gợi ý mã HS đã khai cho một dòng hàng từ kết quả tra danh mục hàng hóa dùng chung (route `resolve-many` – luật ghép của @kb/contracts
// chạy ở server trên CẢ danh mục, không tải danh mục về trình duyệt). Mặt hàng tra chắc chắn hoặc trùng tên (chuẩn hóa) là "khớp đúng", xếp đầu.
import { normalizeProductName, type CatalogItemSummary, type ResolveManyResult } from "@kb/contracts";
import { normalizeHsInput } from "./hs-format";

export type CatalogMatch = { product: CatalogItemSummary; code: string; exact: boolean; score: number };

/** Mặt hàng có mã HS 8 số trong kết quả tra của dòng, tốt nhất trước; tối đa `limit` gợi ý. */
export function catalogMatches(description: string, result: ResolveManyResult | undefined, { limit = 3 } = {}): CatalogMatch[] {
  if (!result) return [];
  const key = normalizeProductName(description);
  const out: CatalogMatch[] = [];
  for (const c of result.candidates) {
    const code = normalizeHsInput(c.item.hsCode ?? "");
    if (!code) continue;
    const exact = (result.level === "SURE" && c.itemId === result.itemId) || normalizeProductName(c.item.name) === key;
    out.push({ product: c.item, code, exact, score: exact ? 1 : c.score });
  }
  return out
    .sort((a, b) => Number(b.exact) - Number(a.exact) || b.score - a.score || b.product.timesDeclared - a.product.timesDeclared)
    .slice(0, limit);
}
