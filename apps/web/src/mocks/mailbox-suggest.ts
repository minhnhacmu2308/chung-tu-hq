// Gợi ý hồ sơ cho email chứng từ (mock) – chép đúng luật của backend (@kb/core mailbox/domain/suggest.ts).
// apps/web không được kéo @kb/core vào gói trình duyệt nên giữ bản sao nhỏ này; sửa luật thì sửa cả hai nơi.
import type { DossierStatus, InboxSuggestion } from "@kb/contracts";

export type SuggestDossier = { id: string; code: string; partner: string; billNo: string; status: DossierStatus; updatedAt: string };
export type SuggestMessage = { subject: string; fromName: string; fromEmail: string; fileNames: string[] };

/** Hồ sơ còn nhận thêm chứng từ (chưa duyệt / truyền / hủy). */
export const OPEN_STATUSES: readonly DossierStatus[] = ["DRAFT", "PROCESSING", "NEEDS_REVIEW"];

function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const STOP = new Set(["co", "ltd", "limited", "company", "corp", "corporation", "inc", "jsc", "pte", "llc", "gmbh", "sa", "ag", "the", "and", "group", "international", "trading", "cong", "ty", "tnhh", "cp", "co phan", "vn", "viet", "nam"]);

const partnerTokens = (partner: string) => fold(partner).split(" ").filter((w) => w.length >= 3 && !STOP.has(w));

function containsRef(haystackCompact: string, ref: string): boolean {
  const r = fold(ref).replace(/ /g, "");
  return r.length >= 6 && haystackCompact.includes(r);
}

export function suggestDossier(msg: SuggestMessage, dossiers: SuggestDossier[]): InboxSuggestion | null {
  const open = dossiers.filter((d) => OPEN_STATUSES.includes(d.status)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const compact = fold([msg.subject, ...msg.fileNames].join(" ")).replace(/ /g, "");
  const pick = (d: SuggestDossier, reason: InboxSuggestion["reason"]): InboxSuggestion => ({ dossierId: d.id, dossierCode: d.code, partner: d.partner, reason });

  const byCode = open.find((d) => containsRef(compact, d.code));
  if (byCode) return pick(byCode, "DOSSIER_CODE");
  const byBill = open.find((d) => d.billNo && containsRef(compact, d.billNo));
  if (byBill) return pick(byBill, "BILL_NO");

  const domain = msg.fromEmail.split("@")[1] ?? "";
  const sender = new Set(fold(`${msg.fromName} ${domain} ${msg.subject}`).split(" "));
  const senderCompact = fold(domain).replace(/ /g, "");
  const byPartner = open.find((d) => {
    const toks = partnerTokens(d.partner);
    const hits = toks.filter((t) => sender.has(t) || senderCompact.includes(t)).length;
    return toks.length > 0 && hits >= Math.min(2, toks.length);
  });
  return byPartner ? pick(byPartner, "PARTNER") : null;
}
