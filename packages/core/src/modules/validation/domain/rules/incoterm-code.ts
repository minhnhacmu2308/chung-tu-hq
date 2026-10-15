// Chỉ tiêu 1.44/2.39 – TT39 PL II: bảng mã điều kiện giao hàng; TT121 thêm DPU cho Mẫu 01 (không khai được → DAT + ghi DPU ở "Chi tiết khai trị giá").
import { fail, pass, skipped, warn, type Rule } from "../helpers.js";

// Danh sách cục bộ: packages/contracts đang được sửa song song; có hằng dùng chung thì chuyển sang.
const CODES_TT39 = ["CIF", "CIP", "FOB", "FCA", "FAS", "EXW", "C&F", "CNF", "CFR", "CPT", "DDP", "DAP", "DAT", "C&I", "DAF", "DDU", "DES", "DEQ"];
const CODE_DPU = "DPU";

/** Chuẩn hóa điều kiện giao hàng trên invoice về mã: "FOB HAIPHONG" → FOB; "C AND F" / "CNF" → C&F; "Incoterms 2020 CIF" → CIF. */
export function normalizeIncoterm(raw: string): string {
  const t = raw.trim().toUpperCase().replace(/^INCOTERMS?\s*(\d{4})?[\s:,-]*/, "");
  if (/^(C\s*&\s*F|C\s*N\s*F|C\s+AND\s+F)(?![A-Z])/.test(t)) return "C&F";
  if (/^(C\s*&\s*I|C\s+AND\s+I)(?![A-Z])/.test(t)) return "C&I";
  return t.split(/[^A-Z&]+/)[0] ?? "";
}

export const incotermCode: Rule = {
  code: "R-INCOTERM-CODE",
  title: "Điều kiện giao hàng có trong bảng mã Hải quan",
  severity: "BLOCKER",
  docKinds: ["INVOICE"],
  run(s, ctx) {
    const raw = s.invoice.incoterm.value?.trim();
    if (!raw) return skipped("Chưa đọc được điều kiện giao hàng");
    const code = normalizeIncoterm(raw);
    const f = ["/invoice/incoterm"];
    const dir = ctx.dossier?.direction;
    if (code === CODE_DPU) {
      if (dir === "XK") return fail(`Điều kiện giao hàng '${raw}': Mẫu 02 (chỉ tiêu 2.39) không có mã DPU – thỏa thuận lại điều kiện giao hàng hoặc chọn mã tương đương trong bảng mã`, f);
      return warn(`Điều kiện giao hàng DPU (chỉ tiêu 1.44, TT121): Nếu phần mềm khai chưa nhận DPU: khai DAT và ghi DPU ở chỉ tiêu 1.50 (TT121)`, f);
    }
    if (!CODES_TT39.includes(code)) return fail(`Điều kiện giao hàng '${raw}' không có trong bảng mã chỉ tiêu 1.44/2.39`, f);
    return pass(`Điều kiện giao hàng ${code} có trong bảng mã chỉ tiêu ${dir === "XK" ? "2.39" : dir === "NK" ? "1.44" : "1.44/2.39"}`, f);
  },
};
