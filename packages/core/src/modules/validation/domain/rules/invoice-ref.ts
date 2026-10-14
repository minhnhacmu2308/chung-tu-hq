import { pass, skipped, warn, type Rule } from "../helpers.js";

/** Số invoice trên Packing List / C/O / Contract phải trùng invoice. */
export const invoiceRef: Rule = {
  code: "R-INVOICE-REF",
  title: "Số invoice trên các chứng từ khác khớp",
  severity: "WARNING",
  docKinds: ["INVOICE", "PACKING_LIST", "CERT_OF_ORIGIN"],
  run(s) {
    const inv = s.invoice.no.value;
    if (!inv) return skipped("Chưa đọc được số invoice");
    const refs: { kind: string; raw: string }[] = [];
    for (const src of s.invoice.no.sources) if (src.kind !== "INVOICE") refs.push({ kind: src.kind === "PACKING_LIST" ? "Packing List" : src.kind, raw: src.raw });
    if (s.origin.coInvoiceNo.value) refs.push({ kind: "C/O", raw: s.origin.coInvoiceNo.value });
    if (!refs.length) return skipped("Không có chứng từ khác ghi số invoice");
    const norm = (x: string) => x.replace(/[\s\-_/.]/g, "").toUpperCase();
    const bad = refs.filter((r) => norm(r.raw) !== norm(inv));
    return bad.length
      ? warn(`${bad.map((b) => `${b.kind} ghi ${b.raw}`).join("; ")} – invoice là ${inv}`, ["/invoice/no", "/origin/coInvoiceNo"])
      : pass(`${refs.map((r) => r.kind).join(", ")} đều ghi số invoice ${inv}`, ["/invoice/no"]);
  },
};
