// Đọc thông tin Hải quan trả về từ một phần tử objIDA/objEDA của FPT.VNACCS (thuần, không I/O).
// Tên trường theo VNACCS_IDA v1.2 / VNACCS_EDA v1.2; key JSON qua fptKey (TK_ICN → tK_ICN). Trường không có/rỗng thì bỏ qua.
import { fptKey, type CustomsDirective, type CustomsInfo, type CustomsInfoItem, type CustomsInfoTax } from "@kb/contracts";
import { dec } from "../../../shared/decimal.js";

type Obj = Record<string, unknown>;
type Kind = "IDA" | "EDA";

const get = (o: Obj | undefined, name: string): unknown => o?.[fptKey(name)];
const str = (v: unknown): string | undefined => {
  if (v === null || v === undefined) return undefined;
  const s = String(v).trim();
  return s ? s : undefined;
};
const decimal = (v: unknown): string | undefined => {
  const s = str(v);
  if (!s) return undefined;
  try {
    return dec(s).toFixed();
  } catch {
    return undefined;
  }
};
const int = (v: unknown): number | undefined => {
  const d = decimal(v);
  return d !== undefined && /^-?\d+$/.test(d) ? Number(d) : undefined;
};
/** FPT trả ngày dạng dd/MM/yyyy (hoặc ISO) → YYYY-MM-DD. */
const date = (v: unknown): string | undefined => {
  const s = str(v);
  if (!s) return undefined;
  const vn = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(s);
  if (vn) return `${vn[3]}-${vn[2]}-${vn[1]}`;
  const iso = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  return iso?.[1];
};
/** Giờ VNACCS dạng HHmmss → HH:mm:ss; dạng khác giữ nguyên. */
const time = (v: unknown): string | undefined => {
  const s = str(v);
  if (!s) return undefined;
  const m = /^(\d{2})(\d{2})(\d{2})$/.exec(s);
  return m ? `${m[1]}:${m[2]}:${m[3]}` : s;
};
const pad2 = (n: number) => String(n).padStart(2, "0");
const sub = (item: Obj, key: string): Obj | undefined => {
  const v = item[key];
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : undefined;
};
const list = (item: Obj, key: string): Obj[] => {
  const v = item[key];
  return Array.isArray(v) ? v.filter((x): x is Obj => !!x && typeof x === "object") : [];
};
/** Bỏ khóa có giá trị undefined (exactOptionalPropertyTypes). */
function defined<T extends Obj>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

/** Tên trường khác nhau giữa IDA và EDA (cùng ý nghĩa). */
const FIELDS = {
  IDA: {
    no: "TK_ICN", regDate: "TK_A09", regTime: "TK_AD11", office: "TK_A07", inspection: "TK_A06", repHs: "TK_A00", pages: "TK_B12", lines: "TK_B13",
    lineNo: "HAG_B25", itemValue: "HAG_B36", itemCurrency: "HAG_B50", itemRate: "HAG_B43", itemTax: "HAG_B47",
    permitDate: "TK_C21", permitTime: "TK_AD4", inspectedDate: "TK_C22", chief: "TK_C20",
  },
  EDA: {
    no: "TK_ECN", regDate: "TK_K10", regTime: "TK_RT1", office: "TK_K08", inspection: "TK_K07", repHs: "TK_K01", pages: "TK_K69", lines: "TK_K70",
    lineNo: "HAG_R01", itemValue: "HAG_R07", itemCurrency: "HAG_BPC", itemRate: "HAG_TRA", itemTax: "HAG_TAX",
    permitDate: "TK_K86", permitTime: "TK_AD5", inspectedDate: "TK_CCD", chief: "TK_K87",
  },
} as const;

function taxesOf(kind: Kind, head: Obj | undefined, thue: Obj | undefined): { taxes: CustomsInfoTax[]; totalTaxVnd?: string | undefined; guaranteeVnd?: string | undefined } {
  if (kind === "IDA") {
    const taxes: CustomsInfoTax[] = [];
    for (let i = 1; i <= 6; i++) {
      const amountVnd = decimal(get(thue, `THUE_KH${i}`));
      const name = str(get(thue, `THUE_KG${i}`));
      const code = str(get(thue, `THUE_KF${i}`));
      if (amountVnd !== undefined && (name || code)) taxes.push(defined({ code, name: name ?? code ?? "", amountVnd }));
    }
    return defined({ taxes, totalTaxVnd: decimal(get(thue, "THUE_B02")), guaranteeVnd: decimal(get(thue, "THUE_B03")) });
  }
  // EDA: tổng thuế xuất khẩu (TK_ETA) và tổng lệ phí (TK_TCO) ở phần đầu tờ khai.
  const taxes: CustomsInfoTax[] = [];
  const exportTax = decimal(get(head, "TK_ETA"));
  const fee = decimal(get(head, "TK_TCO"));
  if (exportTax !== undefined) taxes.push({ name: "Thuế xuất khẩu", amountVnd: exportTax });
  if (fee !== undefined) taxes.push({ name: "Lệ phí hải quan", amountVnd: fee });
  const total = taxes.length ? taxes.reduce((s, t) => s.plus(t.amountVnd), dec(0)).toFixed() : undefined;
  return defined({ taxes, totalTaxVnd: total, guaranteeVnd: decimal(get(head, "TK_SAM")) });
}

function ratesOf(kind: Kind, head: Obj | undefined, thue: Obj | undefined): CustomsInfo["exchangeRates"] {
  const pairs: [unknown, unknown][] = kind === "IDA"
    ? [1, 2, 3].map((i) => [get(thue, `THUE_KJ${i}`), get(thue, `THUE_KK${i}`)])
    : [1, 2].map((i) => [get(head, `TK_RC${i}`), get(head, `TK_RD${i}`)]);
  return pairs.flatMap(([c, r]) => {
    const currency = str(c);
    const rate = decimal(r);
    return currency && rate ? [{ currency, rate }] : [];
  });
}

function directivesOf(cthq: Obj | undefined): CustomsDirective[] {
  const out: CustomsDirective[] = [];
  for (let i = 1; i <= 10; i++) {
    const content = str(get(cthq, `CTHQ_I${pad2(i)}`));
    const title = str(get(cthq, `CTHQ_T${pad2(i)}`));
    if (!content && !title) continue;
    out.push(defined({ date: date(get(cthq, `CTHQ_D${pad2(i)}`)), title, content: content ?? title ?? "" }));
  }
  return out;
}

/** Một phần tử objIDA/objEDA (đã có objVN_<KIND>, _HANG, _THUE, _CTHQ, _TRANGTHAI) → thông tin Hải quan trả về. */
export function parseCustomsInfo(kind: Kind, item: Obj, receivedAt: Date): CustomsInfo {
  const F = FIELDS[kind];
  const p = `objVN_${kind}`;
  const head = sub(item, p);
  const thue = sub(item, `${p}_THUE`);
  const cthq = sub(item, `${p}_CTHQ`);
  const tt = sub(item, `${p}_TRANGTHAI`);
  const bno = int(get(head, "TK_BNO"));
  const dno = int(get(head, "TK_DNO"));
  const totalValue = kind === "IDA"
    ? decimal(get(head, "TK_A86")) // Tổng trị giá tính thuế (VND)
    : decimal(get(head, "TK_FKK"));
  const totalCurrency = kind === "IDA" ? "VND" : str(get(head, "TK_FCD")) ?? "VND";
  const items: CustomsInfoItem[] = list(item, `${p}_HANG`).map((h, i) => defined({
    lineNo: int(get(h, F.lineNo)) ?? i + 1,
    hsCode: str(get(h, "HAG_CMD")),
    customsValue: decimal(get(h, F.itemValue)),
    customsValueCurrency: str(get(h, F.itemCurrency)),
    taxRate: decimal(get(h, F.itemRate)),
    taxAmountVnd: decimal(get(h, F.itemTax)),
  }));
  return defined({
    receivedAt: receivedAt.toISOString(),
    declarationNo: str(get(head, F.no)),
    branch: bno !== undefined && dno !== undefined && dno > 1 ? { no: bno, of: dno } : undefined,
    registeredDate: date(get(head, F.regDate)),
    registeredTime: time(get(head, F.regTime)),
    customsOfficeName: str(get(head, F.office)),
    subsection: str(get(head, "TK_CHB")),
    inspectionCode: str(get(head, F.inspection)),
    representativeHs: str(get(head, F.repHs)),
    pages: int(get(head, F.pages)),
    lines: int(get(head, F.lines)),
    exchangeRates: ratesOf(kind, head, thue),
    totalCustomsValue: totalValue !== undefined ? { amount: totalValue, currency: totalCurrency } : undefined,
    ...taxesOf(kind, head, thue),
    items,
    directiveKind: str(get(cthq, "CTHQ_CCM")),
    directives: directivesOf(cthq),
    permitDate: date(get(tt, F.permitDate)),
    permitTime: time(get(tt, F.permitTime)),
    inspectionDoneDate: date(get(tt, F.inspectedDate)),
    chiefName: str(get(tt, F.chief)),
  }) as CustomsInfo;
}

/** Phản hồi sau có thể thiếu phần đã trả trước đó (EDC/IEX rút gọn): giữ giá trị cũ khi bản mới không có. */
export function mergeCustomsInfo(prev: CustomsInfo | null | undefined, next: CustomsInfo): CustomsInfo {
  if (!prev) return next;
  const keepList = <T>(a: T[], b: T[]) => (b.length ? b : a);
  return {
    ...prev,
    ...next,
    exchangeRates: keepList(prev.exchangeRates, next.exchangeRates),
    taxes: keepList(prev.taxes, next.taxes),
    items: keepList(prev.items, next.items),
    directives: keepList(prev.directives, next.directives),
  };
}
