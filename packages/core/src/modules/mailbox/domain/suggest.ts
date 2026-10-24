// Gợi ý hồ sơ cho email chứng từ (code thuần): mã hồ sơ / số vận đơn xuất hiện trong tiêu đề hoặc tên file là chắc nhất;
// không có thì tên đối tác của hồ sơ khớp tên / tên miền người gửi. Chỉ gợi ý hồ sơ còn nhận thêm chứng từ.
import type { DossierStatus, InboxSuggestion } from "@kb/contracts";

export type SuggestDossier = { id: string; code: string; partner: string; billNo: string; status: DossierStatus; updatedAt: Date };
export type SuggestMessage = { subject: string; fromName: string; fromEmail: string; fileNames: string[] };

/** Hồ sơ còn nhận thêm chứng từ (chưa duyệt / truyền / hủy). */
export const OPEN_STATUSES: readonly DossierStatus[] = ["DRAFT", "PROCESSING", "NEEDS_REVIEW"];

/** Chữ thường, bỏ dấu, chỉ giữ chữ-số và khoảng trắng. */
export function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Từ không mang nghĩa nhận diện công ty (bỏ khi so tên đối tác). */
const STOP = new Set(["co", "ltd", "limited", "company", "corp", "corporation", "inc", "jsc", "pte", "llc", "gmbh", "sa", "ag", "the", "and", "group", "international", "trading", "cong", "ty", "tnhh", "cp", "co phan", "vn", "viet", "nam"]);

/** Từ đặc trưng của tên đối tác (≥ 3 ký tự, không phải từ chung). */
export function partnerTokens(partner: string): string[] {
  return fold(partner).split(" ").filter((w) => w.length >= 3 && !STOP.has(w));
}

/** Chuỗi mã (mã hồ sơ, số vận đơn) có trong văn bản – so sau khi bỏ ký tự phân cách để "HS-NK-2610-0001" khớp "hsnk26100001". */
function containsRef(haystackCompact: string, ref: string): boolean {
  const r = fold(ref).replace(/ /g, "");
  return r.length >= 6 && haystackCompact.includes(r);
}

export function suggestDossier(msg: SuggestMessage, dossiers: SuggestDossier[]): InboxSuggestion | null {
  const open = dossiers.filter((d) => OPEN_STATUSES.includes(d.status)).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  const text = fold([msg.subject, ...msg.fileNames].join(" "));
  const compact = text.replace(/ /g, "");
  const pick = (d: SuggestDossier, reason: InboxSuggestion["reason"]): InboxSuggestion => ({ dossierId: d.id, dossierCode: d.code, partner: d.partner, reason });

  const byCode = open.find((d) => containsRef(compact, d.code));
  if (byCode) return pick(byCode, "DOSSIER_CODE");
  const byBill = open.find((d) => d.billNo && containsRef(compact, d.billNo));
  if (byBill) return pick(byBill, "BILL_NO");

  // Đối tác: ít nhất 2 từ đặc trưng (hoặc từ duy nhất) có trong tên người gửi / tên miền / tiêu đề. Nhiều hồ sơ cùng đối tác → hồ sơ cập nhật gần nhất.
  const sender = new Set(fold(`${msg.fromName} ${msg.fromEmail.split("@")[1] ?? ""} ${msg.subject}`).split(" "));
  const senderCompact = fold(msg.fromEmail.split("@")[1] ?? "").replace(/ /g, "");
  const byPartner = open.find((d) => {
    const toks = partnerTokens(d.partner);
    const hits = toks.filter((t) => sender.has(t) || senderCompact.includes(t)).length;
    return toks.length > 0 && hits >= Math.min(2, toks.length);
  });
  return byPartner ? pick(byPartner, "PARTNER") : null;
}
