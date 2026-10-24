// Bộ lọc riêng của từng hộp thư (người gửi, từ khóa, từ loại trừ) – code thuần, adapter nào cũng gọi để kết quả giống nhau.
import { INBOX_KEYWORDS, type MailFilters } from "@kb/contracts";
import { foldKeywords, matchesFoldedKeywords } from "./keywords.js";

export type FilterableMessage = { fromEmail: string; subject: string; snippet: string; fileNames: string[] };

/** Từ khóa cần khớp theo chế độ; null = không lọc từ khóa (OFF). */
export function effectiveKeywords(f: MailFilters): string[] | null {
  if (f.keywordMode === "OFF") return null;
  return f.keywordMode === "CUSTOM" ? [...f.keywords] : [...INBOX_KEYWORDS, ...f.keywords];
}

/** Người gửi khớp danh sách: email đúng từng chữ, hoặc tên miền ("congty.vn" / "@congty.vn" – gồm cả tên miền con). */
export function senderAllowed(fromEmail: string, senders: readonly string[]): boolean {
  if (!senders.length) return true;
  const from = fromEmail.trim().toLowerCase();
  const domain = from.split("@")[1] ?? "";
  return senders.some((s) => {
    if (s.includes("@") && !s.startsWith("@")) return from === s;
    const d = s.replace(/^@/, "");
    return domain === d || domain.endsWith(`.${d}`);
  });
}

/**
 * Email có qua bộ lọc không. `fullTextMatched`: nhà cung cấp đã tìm từ khóa trong toàn bộ nội dung (Gmail) → với phạm vi ALL
 * không kiểm lại trên đoạn xem trước (đoạn này ngắn, sẽ bỏ sót email có từ khóa ở cuối thư).
 */
export function matchesMailFilters(m: FilterableMessage, f: MailFilters, opts: { fullTextMatched?: boolean } = {}): boolean {
  if (!senderAllowed(m.fromEmail, f.senders)) return false;
  if (f.excludeKeywords.length && matchesFoldedKeywords(foldKeywords(f.excludeKeywords), m.subject, ...m.fileNames)) return false;
  const kw = effectiveKeywords(f);
  if (!kw) return true;
  if (f.keywordScope === "ALL" && opts.fullTextMatched) return true;
  const texts = f.keywordScope === "SUBJECT" ? [m.subject, ...m.fileNames] : [m.subject, m.snippet, ...m.fileNames];
  return matchesFoldedKeywords(foldKeywords(kw), ...texts);
}
