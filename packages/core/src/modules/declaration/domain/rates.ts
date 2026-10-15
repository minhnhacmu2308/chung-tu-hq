// Thuế suất áp dụng cho một dòng hàng theo biểu thuế + loại hình + C/O. Thuần.
import type { HsCatalogRow } from "./types.js";

export type Rates = { importDutyRate: string; vatRate: string; policyNote: string | null; taxTableCode: string };

/**
 * Mã Biểu thuế NK (chỉ tiêu 1.80) theo danh sách Phụ lục II TT39: B04 ATIGA, B05 ACFTA, B06 AKFTA, B09 AJCEP, B10 VJEPA (B17 là Chương 98, B16 thuế hỗn hợp).
 * TT121 thay danh sách bằng bảng mã trên website Cục Hải quan; mã EVFTA, VKFTA, CPTPP, RCEP không có trong văn bản đã đối chiếu → để trống, người khai tra bảng mã.
 */
const FTA_TABLE: Record<string, { code: string; name: string }> = {
  AK: { code: "B06", name: "AKFTA (C/O form AK)" }, VK: { code: "", name: "VKFTA (C/O form VK)" }, D: { code: "B04", name: "ATIGA (C/O form D)" },
  E: { code: "B05", name: "ACFTA (C/O form E)" }, EVFTA_REX: { code: "", name: "EVFTA (REX)" }, EVFTA: { code: "", name: "EVFTA (REX)" },
  AJ: { code: "B09", name: "AJCEP (C/O form AJ)" }, VJ: { code: "B10", name: "VJEPA (C/O form VJ)" }, CPTPP: { code: "", name: "CPTPP" }, RCEP: { code: "", name: "RCEP" },
};

/**
 * Thuế suất cho (HS, loại hình, hướng, mẫu C/O): XK → 0/0; E21/E31/G… miễn thuế NK; C/O hợp lệ và biểu có thuế ưu đãi đặc biệt → dùng FTA.
 * Ghi chú chính sách luôn mở đầu bằng tên FTA – bước truyền suy mã biểu thuế từ tên này (dòng hàng chưa lưu mã biểu thuế riêng).
 */
export function ratesFor(hs: HsCatalogRow | null, p: { direction: "NK" | "XK"; typeCode: string; coForm: string | null }): Rates {
  const fixed = fixedRatesFor(p);
  if (fixed) return fixed;
  if (!hs) return { importDutyRate: "0", vatRate: "8", policyNote: null, taxTableCode: "B01" };
  const fta = p.coForm ? FTA_TABLE[p.coForm.toUpperCase()] : undefined;
  const pref = p.coForm ? hs.pref[p.coForm.toUpperCase()] ?? (p.coForm.toUpperCase().startsWith("EVFTA") ? hs.pref["EVFTA"] : undefined) : undefined;
  if (fta && pref !== undefined) return { importDutyRate: pref, vatRate: hs.vat, policyNote: hs.policy ? `${fta.name}; ${hs.policy}` : `Áp thuế suất ưu đãi đặc biệt ${fta.name}`, taxTableCode: fta.code };
  return { importDutyRate: hs.mfn, vatRate: hs.vat, policyNote: hs.policy, taxTableCode: "B01" };
}

/** Thuế suất không phụ thuộc mã HS: hàng XK, loại hình miễn thuế (E21/E31/E11/E41). Còn lại → null. */
export function fixedRatesFor(p: { direction: "NK" | "XK"; typeCode: string }): Rates | null {
  if (p.direction === "XK") return { importDutyRate: "0", vatRate: "0", policyNote: "Hàng xuất khẩu – thuế XK 0%", taxTableCode: "" };
  if (/^E(21|31|11|41)$/.test(p.typeCode)) return { importDutyRate: "0", vatRate: "0", policyNote: `Loại hình ${p.typeCode}: miễn thuế NK, không thu VAT khâu nhập khẩu`, taxTableCode: "B01" };
  return null;
}
