// Lọc email chứng từ theo từ khóa (code thuần, dùng chung adapter Outlook + giả lập): so không phân biệt hoa thường / dấu.
import { INBOX_KEYWORDS } from "@kb/contracts";
import { fold } from "./suggest.js";

/** Từ khóa đã bỏ dấu, bỏ ký tự phân cách ("b/l" → "b l", "hóa đơn" → "hoa don"); bỏ trùng. */
const FOLDED = [...new Set(INBOX_KEYWORDS.map(fold).filter(Boolean))];

/** Văn bản (tiêu đề, xem trước nội dung, tên file…) có chứa từ khóa chứng từ nào không – khớp theo ranh giới từ. */
export function matchesInboxKeywords(...texts: string[]): boolean {
  const hay = ` ${fold(texts.join(" "))} `;
  return FOLDED.some((k) => hay.includes(` ${k} `) || (k.length > 4 && hay.includes(k)));
}
