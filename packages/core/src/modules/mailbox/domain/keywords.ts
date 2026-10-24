// Lọc email chứng từ theo từ khóa (code thuần, dùng chung các adapter): so không phân biệt hoa thường / dấu.
import { INBOX_KEYWORDS } from "@kb/contracts";
import { fold } from "./suggest.js";

/** Từ khóa đã bỏ dấu, bỏ ký tự phân cách ("b/l" → "b l", "hóa đơn" → "hoa don"); bỏ trùng. */
export const foldKeywords = (keywords: readonly string[]) => [...new Set(keywords.map(fold).filter(Boolean))];
const FOLDED = foldKeywords(INBOX_KEYWORDS);

/** Văn bản có chứa một trong các từ khóa (đã fold) không – khớp theo ranh giới từ; từ dài hơn 4 ký tự khớp cả khi nằm trong từ khác. */
export function matchesFoldedKeywords(folded: readonly string[], ...texts: string[]): boolean {
  const hay = ` ${fold(texts.join(" "))} `;
  return folded.some((k) => hay.includes(` ${k} `) || (k.length > 4 && hay.includes(k)));
}

/** Văn bản (tiêu đề, xem trước nội dung, tên file…) có chứa từ khóa chứng từ có sẵn (INBOX_KEYWORDS) nào không. */
export function matchesInboxKeywords(...texts: string[]): boolean {
  return matchesFoldedKeywords(FOLDED, ...texts);
}
