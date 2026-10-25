// Tìm mặt hàng trong danh mục hàng hóa của doanh nghiệp (đã khai trước đó) khớp với một dòng hàng → gợi ý mã HS đã dùng.
// Khớp đúng tên (chuẩn hóa như danh mục) xếp đầu; sau đó các mặt hàng gần giống theo tỉ lệ từ chung. Sau này thêm từ khóa ánh xạ.
import { normalizeProductName, type ProductCatalogItem } from "@kb/contracts";
import { normalizeHsInput } from "./hs-format";

export type CatalogMatch = { product: ProductCatalogItem; code: string; exact: boolean; score: number };

const tokens = (s: string) =>
  new Set(
    s
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 1),
  );

/** Điểm giống nhau 0–1 (Dice): 2 × số từ chung / tổng số từ – tên ngắn trong danh mục không khớp nhầm mô tả dài có chứa nó. */
function similarity(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let common = 0;
  for (const w of a) if (b.has(w)) common++;
  return (2 * common) / (a.size + b.size);
}

/** Mặt hàng có mã HS 8 số khớp với mô tả dòng hàng, tốt nhất trước; `limit` gợi ý, điểm ≥ `min`. */
export function matchCatalog(description: string, products: readonly ProductCatalogItem[], { limit = 3, min = 0.6 } = {}): CatalogMatch[] {
  const key = normalizeProductName(description);
  const words = tokens(description);
  const out: CatalogMatch[] = [];
  for (const p of products) {
    const code = normalizeHsInput(p.hsCode ?? "");
    if (!code) continue;
    const exact = normalizeProductName(p.name) === key;
    const score = exact ? 1 : similarity(words, tokens(p.name));
    if (exact || score >= min) out.push({ product: p, code, exact, score });
  }
  return out
    .sort((a, b) => Number(b.exact) - Number(a.exact) || b.score - a.score || b.product.timesDeclared - a.product.timesDeclared)
    .slice(0, limit);
}
