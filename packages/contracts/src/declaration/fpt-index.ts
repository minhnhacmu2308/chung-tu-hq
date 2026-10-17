import { CATALOG_EDA } from "./catalog-eda.js";
import { CATALOG_IDA } from "./catalog-ida.js";
import type { DeclarationFieldDef } from "./catalog-types.js";

/**
 * Lỗi FPT.VNACCS trả `indexCode` = tên trường VNACCS bỏ tiền tố (ví dụ "EPN", "IP2", "CMD", có khi kèm tiền tố "TK_EPN").
 * Catalog chỉ ghi tên trường của ô đầu mỗi chỉ tiêu (1.44 → TK_IP4) nên cần quy các ô còn lại về ô đại diện.
 */
const ALIAS: Record<string, string> = {
  SN: "SS", EB: "EA", EP2: "EPA", EP3: "EPA", EP4: "EPA", CAT: "CGA", CAC: "CGA", CAS: "CGA",
  VSN: "VSC", DSN: "DST", PSN: "PSC", NOT: "NO", GWT: "GW", BNO: "FIC", DNO: "FIC",
  VI: "VR", VC: "VR", VP: "VR", VT: "VR", QT1: "QN1", QT2: "QN2", UPC: "UPR", TSC: "UPR", TXC: "TXB", TXD: "TXB",
  AD: "ST", SD: "ST", ADT: "ARP",
};
const PREFIX = /^(TK|HAG|VD|KTG|CON|CTHQ)_/;
const stem = (s: string) => s.replace(/\d+$/, "");
const nameOf = (def: DeclarationFieldDef) => (def.fptField?.split(".")[1] ?? "").replace(PREFIX, "");

/** `indexCode` của lỗi FPT → chỉ tiêu Phụ lục II của tờ khai IDA/EDA; không xác định được → undefined. */
export function fieldDefForFptIndex(kind: "IDA" | "EDA", indexCode: string | null | undefined): DeclarationFieldDef | undefined {
  const raw = (indexCode ?? "").trim().toUpperCase().replace(PREFIX, "");
  if (!raw) return undefined;
  const catalog = kind === "IDA" ? CATALOG_IDA : CATALOG_EDA;
  const code = ALIAS[raw] ?? ALIAS[stem(raw)] ?? raw;
  return catalog.find((d) => nameOf(d) === code) ?? catalog.find((d) => nameOf(d) !== "" && stem(nameOf(d)) === stem(code));
}
