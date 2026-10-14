// Gợi ý HS: hscodepro (khung HTTP – đặc tả chưa có, BACKEND-TODO T2) hoặc giả theo từ khóa trên catalog_hs.
import type { HsCatalogRow, HsClassifier } from "../application/ports.js";

const norm = (s: string) => s.toLowerCase().normalize("NFC");

/** Giả: chấm điểm từ khóa của từng dòng biểu thuế; HS trên invoice (6 số) khớp mã cũng thành ứng viên. Kết quả ổn định, không mạng. */
export class FakeHsClassifier implements HsClassifier {
  readonly name = "fake-hs";
  private cache: HsCatalogRow[] | null = null;
  constructor(private load: () => Promise<HsCatalogRow[]>) {}
  async classify(input: { description: string; invoiceHs: string | null; origin: string }) {
    const rows = (this.cache ??= await this.load());
    const text = norm(input.description);
    const inv6 = (input.invoiceHs ?? "").replace(/\D/g, "").slice(0, 6);
    const scored = rows
      .map((h) => {
        const hits = h.keywords.filter((k) => text.includes(norm(k))).length;
        const prefix = inv6.length === 6 && h.code.replace(/\D/g, "").startsWith(inv6);
        if (!hits && !prefix) return null;
        const confidence = Math.min(0.93, (hits ? 0.5 + 0.12 * hits : 0.55) + (prefix ? 0.1 : 0));
        return { code: h.code, description: h.description, confidence: Number(confidence.toFixed(2)) };
      })
      .filter((x): x is { code: string; description: string; confidence: number } => x !== null)
      .sort((a, b) => b.confidence - a.confidence);
    return scored.slice(0, 3);
  }
}

/** Khung gọi hscodepro `/v1/classify` – tham số/kết quả chưa có đặc tả (T2); lỗi mạng/5xx ném ra để retry. */
export class HscodeproClassifier implements HsClassifier {
  readonly name = "hscodepro";
  constructor(private baseUrl: string, private apiKey?: string) {}
  async classify(input: { description: string; invoiceHs: string | null; origin: string }) {
    const res = await fetch(`${this.baseUrl.replace(/\/$/, "")}/v1/classify`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}) },
      body: JSON.stringify({ description: input.description, hint_hs: input.invoiceHs, origin: input.origin, top_k: 3 }),
    });
    if (!res.ok) throw new Error(`hscodepro ${res.status}`);
    const data = (await res.json()) as { results?: { code?: string; description?: string; confidence?: number }[] };
    return (data.results ?? [])
      .filter((r): r is { code: string; description?: string; confidence?: number } => typeof r.code === "string")
      .map((r) => ({ code: r.code, description: r.description ?? "", confidence: Math.max(0, Math.min(1, Number(r.confidence ?? 0.5))) }));
  }
}
