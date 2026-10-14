import { pass, skipped, warn, type Rule } from "../helpers.js";

/** Xuất xứ trên C/O (hoặc REX) phải khớp xuất xứ dòng hàng trên invoice. */
export const originCo: Rule = {
  code: "R-ORIGIN-CO",
  title: "Xuất xứ C/O khớp invoice",
  severity: "WARNING",
  docKinds: ["CERT_OF_ORIGIN", "INVOICE"],
  run(s) {
    const form = s.origin.coForm.value;
    const country = s.origin.country.value;
    if (!form && !country) return skipped("Không có C/O – áp thuế suất MFN");
    const origins = [...new Set(s.items.map((i) => i.origin.value).filter((v): v is string => !!v))];
    if (!origins.length) return skipped("Invoice không ghi xuất xứ dòng hàng");
    const bad = origins.filter((o) => country && o !== country);
    if (bad.length) return warn(`C/O ${form ?? ""} ghi xuất xứ ${country}, invoice có dòng xuất xứ ${bad.join(", ")}`, ["/origin/country"]);
    const rex = s.origin.rexNo.value ? ` (REX ${s.origin.rexNo.value} – cần tra lại hiệu lực)` : "";
    return pass(`C/O ${form ?? ""} số ${s.origin.coNo.value ?? "?"} – xuất xứ ${country} khớp invoice${rex}`, ["/origin/coNo"]);
  },
};
