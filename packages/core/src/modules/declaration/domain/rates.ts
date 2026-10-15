// Thuế suất áp dụng cho một dòng hàng theo biểu thuế + loại hình + C/O. Thuần.
import type { HsCatalogRow } from "./types.js";

export type Rates = { importDutyRate: string; vatRate: string; policyNote: string | null; taxTableCode: string };

const FTA_TABLE: Record<string, { code: string; name: string }> = {
  AK: { code: "B07", name: "AKFTA (C/O form AK)" }, VK: { code: "B12", name: "VKFTA (C/O form VK)" }, D: { code: "B04", name: "ATIGA (C/O form D)" },
  E: { code: "B05", name: "ACFTA (C/O form E)" }, EVFTA_REX: { code: "B17", name: "EVFTA (REX)" }, EVFTA: { code: "B17", name: "EVFTA (REX)" },
  AJ: { code: "B08", name: "AJCEP (C/O form AJ)" }, VJ: { code: "B09", name: "VJEPA (C/O form VJ)" }, CPTPP: { code: "B16", name: "CPTPP" }, RCEP: { code: "B22", name: "RCEP" },
};

/**
 * Thuế suất cho (HS, loại hình, hướng, mẫu C/O): XK → 0/0; E21/E31/G… miễn thuế NK; C/O hợp lệ và biểu có thuế ưu đãi đặc biệt → dùng FTA.
 * Mã biểu thuế: B01 MFN; B07/B05/B17… theo FTA (danh mục A527).
 */
export function ratesFor(hs: HsCatalogRow | null, p: { direction: "NK" | "XK"; typeCode: string; coForm: string | null }): Rates {
  const fixed = fixedRatesFor(p);
  if (fixed) return fixed;
  if (!hs) return { importDutyRate: "0", vatRate: "8", policyNote: null, taxTableCode: "B01" };
  const fta = p.coForm ? FTA_TABLE[p.coForm.toUpperCase()] : undefined;
  const pref = p.coForm ? hs.pref[p.coForm.toUpperCase()] ?? (p.coForm.toUpperCase().startsWith("EVFTA") ? hs.pref["EVFTA"] : undefined) : undefined;
  if (fta && pref !== undefined) return { importDutyRate: pref, vatRate: hs.vat, policyNote: hs.policy ?? `Áp thuế suất ưu đãi đặc biệt ${fta.name}`, taxTableCode: fta.code };
  return { importDutyRate: hs.mfn, vatRate: hs.vat, policyNote: hs.policy, taxTableCode: "B01" };
}

/** Thuế suất không phụ thuộc mã HS: hàng XK, loại hình miễn thuế (E21/E31/E11/E41). Còn lại → null. */
export function fixedRatesFor(p: { direction: "NK" | "XK"; typeCode: string }): Rates | null {
  if (p.direction === "XK") return { importDutyRate: "0", vatRate: "0", policyNote: "Hàng xuất khẩu – thuế XK 0%", taxTableCode: "" };
  if (/^E(21|31|11|41)$/.test(p.typeCode)) return { importDutyRate: "0", vatRate: "0", policyNote: `Loại hình ${p.typeCode}: miễn thuế NK, không thu VAT khâu nhập khẩu`, taxTableCode: "B01" };
  return null;
}
