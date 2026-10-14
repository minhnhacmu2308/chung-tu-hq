// Hợp nhất gợi ý HS của classifier với mã HS trên invoice nước ngoài (chỉ tham khảo 6 số đầu). Thuần.
export type HsCandidate = { code: string; confidence: number; description?: string | undefined };
export type HsRank = { hsSuggested: string | null; hsConfidence: number | null; ranked: HsCandidate[] };

const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");
const INVOICE_MATCH_BONUS = 0.15;

export function rankHs(candidates: HsCandidate[], invoiceHs: string | null): HsRank {
  const inv6 = digits(invoiceHs).slice(0, 6);
  const ranked = candidates
    .map((c) => ({ ...c, confidence: inv6.length === 6 && digits(c.code).startsWith(inv6) ? Math.min(0.99, c.confidence + INVOICE_MATCH_BONUS) : c.confidence }))
    .sort((a, b) => b.confidence - a.confidence);
  const top = ranked[0];
  return top ? { hsSuggested: top.code, hsConfidence: Number(top.confidence.toFixed(4)), ranked } : { hsSuggested: null, hsConfidence: null, ranked: [] };
}
