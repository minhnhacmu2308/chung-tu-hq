import type { Db } from "../client.js";
import { catalogHs, exchangeRates } from "../schema/index.js";

/** Biểu thuế TỐI THIỂU cho dev/demo – GIỐNG dữ liệu mock FE (apps/web/src/mocks/declaration-builder.ts). Không dùng để khai thật (BACKEND-TODO D1). */
export const HS_SEED: { code: string; description: string; mfn: string; pref?: Record<string, string>; vat: string; policy?: string; keywords: string[] }[] = [
  { code: "8482.10.00", description: "Ổ bi cầu", mfn: "3", pref: { AK: "0" }, vat: "8", keywords: ["ball bearing", "vòng bi cầu", "deep groove", "ổ bi cầu", "6205", "6308", "6001"] },
  { code: "8482.20.00", description: "Ổ bi đũa côn, kể cả cụm nón và đũa côn", mfn: "3", pref: { AK: "0" }, vat: "8", keywords: ["tapered roller", "đũa côn", "30210", "30205"] },
  { code: "8482.40.00", description: "Ổ bi đũa kim, kể cả lồng và cụm đũa kim", mfn: "3", pref: { AK: "0" }, vat: "8", keywords: ["needle", "đũa kim", "hk1012"] },
  { code: "8482.50.00", description: "Các loại ổ bi đũa trụ khác", mfn: "3", pref: { AK: "0" }, vat: "8", keywords: ["cylindrical roller", "đũa trụ", "nu2212"] },
  { code: "8482.80.00", description: "Ổ bi loại khác, kể cả ổ kết hợp bi cầu/bi đũa", mfn: "3", pref: { AK: "0" }, vat: "8", keywords: ["bearing", "ổ bi"] },
  { code: "8466.93.90", description: "Bộ phận và phụ kiện khác của máy công cụ thuộc nhóm 84.56 đến 84.61", mfn: "0", pref: { AK: "0" }, vat: "8", keywords: ["linear guide", "guide rail", "thanh trượt", "con trượt", "hgr", "hgh", "mgn", "lgr", "lgh", "dẫn hướng"] },
  { code: "8483.10.90", description: "Trục truyền động – loại khác", mfn: "3", pref: { AK: "0" }, vat: "8", keywords: ["shaft", "trục truyền động", "trục"] },
  { code: "8483.20.90", description: "Thân ổ, có lắp ổ bi – loại khác", mfn: "3", pref: { AK: "0" }, vat: "8", keywords: ["pillow block", "bearing unit", "gối đỡ vòng bi", "ucp", "ucf", "có lắp ổ bi"] },
  { code: "8483.30.90", description: "Thân ổ, không lắp ổ bi; gối đỡ trục dùng ổ trượt – loại khác", mfn: "3", pref: { AK: "0" }, vat: "8", keywords: ["bk12", "bf12", "gối đỡ vít me", "không lắp ổ bi"] },
  { code: "8483.40.90", description: "Bộ bánh răng; vít bi hoặc vít đũa; hộp số – loại khác", mfn: "5", pref: { AK: "0" }, vat: "8", keywords: ["ball screw", "vít me bi", "sfu", "gear", "bánh răng", "hộp số"] },
  { code: "8501.51.19", description: "Động cơ xoay chiều đa pha, công suất không quá 750 W – loại khác", mfn: "5", vat: "8", keywords: ["ac motor", "động cơ xoay chiều", "3 pha", "ys8024"] },
  { code: "8501.31.40", description: "Động cơ một chiều, công suất không quá 750 W – loại khác", mfn: "5", vat: "8", keywords: ["dc motor", "động cơ dc", "không chổi than", "brushless", "57blf"] },
  { code: "8504.40.90", description: "Bộ biến đổi điện tĩnh – loại khác", mfn: "3", vat: "8", keywords: ["controller", "bộ điều khiển", "driver", "inverter", "bld-120"] },
  { code: "9405.11.90", description: "Đèn chùm, đèn treo trần hoặc gắn tường, chỉ dùng nguồn sáng LED – loại khác", mfn: "20", pref: { EVFTA: "10" }, vat: "8", policy: "Kiểm tra nhà nước về chất lượng (QCVN 19:2019/BKHCN – đèn LED)", keywords: ["đèn treo trần", "đèn chùm", "pendant", "ceiling", "tolomeo"] },
  { code: "9405.21.90", description: "Đèn bàn, đèn giường, đèn cây, chỉ dùng nguồn sáng LED – loại khác", mfn: "20", pref: { EVFTA: "10" }, vat: "8", policy: "Kiểm tra nhà nước về chất lượng (QCVN 19:2019/BKHCN – đèn LED)", keywords: ["đèn bàn", "table lamp", "floor lamp", "tizio"] },
];

/** Tỷ giá tính thuế mẫu (VND/1 đơn vị) – nhập tay, BACKEND-TODO D2. */
export const EXCHANGE_RATE_SEED: { currency: string; rate: string }[] = [
  { currency: "USD", rate: "26150" }, { currency: "EUR", rate: "30420" }, { currency: "JPY", rate: "175" }, { currency: "CNY", rate: "3620" }, { currency: "KRW", rate: "18.9" },
  { currency: "GBP", rate: "34900" }, { currency: "SGD", rate: "20100" }, { currency: "TWD", rate: "810" }, { currency: "THB", rate: "790" }, { currency: "HKD", rate: "3360" }, { currency: "AUD", rate: "17300" },
];

export async function seedCatalogs(db: Db, today = new Date().toISOString().slice(0, 10)) {
  for (const h of HS_SEED) {
    await db
      .insert(catalogHs)
      .values({ code: h.code, description: h.description, mfn: h.mfn, pref: h.pref ?? {}, vat: h.vat, policy: h.policy ?? null, keywords: h.keywords })
      .onConflictDoUpdate({ target: catalogHs.code, set: { description: h.description, mfn: h.mfn, pref: h.pref ?? {}, vat: h.vat, policy: h.policy ?? null, keywords: h.keywords, updatedAt: new Date() } });
  }
  for (const r of EXCHANGE_RATE_SEED) {
    await db.insert(exchangeRates).values({ id: `fx_${r.currency}_${today}`, currency: r.currency, date: today, rate: r.rate, source: "SEED" }).onConflictDoNothing();
  }
}
