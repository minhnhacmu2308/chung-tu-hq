// Bản khai bổ sung sau thông quan (AMA): lấy dữ liệu tờ khai gốc làm phần "Trước", dựng payload FPT objVN_AMA / objVN_AMA_HANG. Thuần.
// Quy tắc dùng chung FE/BE (điền sẵn, tự tính thuế "Sau", ô khóa): @kb/contracts post-amendment.
import {
  AmaRequestSchema, amaLineDelta, declarationFormValues, fptKey, itemOverrides, VN_AMA_HANG_ROWS, VN_AMA_ROWS, vatCode,
  type AmaRequest, type AmaSource, type AmaSourceLine, type CustomsInfo, type FptFieldRow, type PostAmendment,
} from "@kb/contracts";
import { Decimal, toDecimalString } from "../../../shared/decimal.js";
import type { DeclarationPayload } from "./declaration-to-fpt.js";

const fieldsOf = (p: DeclarationPayload) => Object.entries(p.fields).map(([code, f]) => ({ code, value: f.value }));
const isNum = (v: string | null | undefined): v is string => /^-?\d+(\.\d+)?$/.test((v ?? "").trim());

/** Đầu bản khai: ô tờ khai gốc theo tên trường VNACCS + thông tin Hải quan trả về. */
export function amaSource(p: DeclarationPayload, customs: CustomsInfo | null, declarationNo: string, exchangeRate?: string): AmaSource {
  return { direction: p.direction, form: declarationFormValues(p.kind, fieldsOf(p)), customs, declarationNo, currency: p.currency, exchangeRate };
}

/** Dòng tờ khai gốc: ô VNACCS (ô người khai nhập theo dòng ghi đè), số Hải quan tính; thuế GTGT trước = (trị giá + thuế NK) × thuế suất. */
export function amaSourceLines(p: DeclarationPayload, customs: CustomsInfo | null): AmaSourceLine[] {
  const fields = fieldsOf(p);
  return [...p.items].sort((a, b) => a.lineNo - b.lineNo).map((it) => {
    const c = customs?.items.find((x) => x.lineNo === it.lineNo);
    const vat = p.direction === "NK" && isNum(it.vatRate) ? it.vatRate : null;
    const base = c && isNum(c.customsValue) ? new Decimal(c.customsValue).plus(isNum(c.taxAmountVnd) ? c.taxAmountVnd : 0) : null;
    return {
      lineNo: it.lineNo,
      values: {
        HAG_CMN: it.description, HAG_OR: it.origin, HAG_CMD: it.hsConfirmed ?? "", HAG_QN1: it.quantity, HAG_QT1: it.unit, HAG_TXA: it.importDutyRate ?? "",
        ...(it.id ? itemOverrides(fields, it.id) : {}),
      },
      customs: c,
      ...(vat
        ? { otherTaxes: [{ code: vatCode(vat), rate: `${vat}%`, ...(base ? { base: toDecimalString(base), amount: toDecimalString(base.times(vat).div(100), 4) } : {}) }] }
        : {}),
    };
  });
}

/** Tổng tăng/giảm tiền thuế của bản khai (thuế XNK + thu khác), VND – chuỗi thập phân. */
export function amendmentDeltaVnd(a: Pick<PostAmendment, "lines">): string {
  let total = new Decimal(0);
  for (const l of a.lines) {
    const d = amaLineDelta(l.values);
    for (const s of [d.importTax, ...d.other.map((o) => o.amount)]) if (isNum(s)) total = total.plus(s);
  }
  return toDecimalString(total.toDecimalPlaces(0));
}

const ddmmyyyy = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : iso);

/** Ô theo đặc tả: ngày → dd/MM/yyyy, số → number, chữ cắt theo độ dài (ghi cảnh báo); ô trống không gửi. */
function toObject(rows: readonly FptFieldRow[], values: Record<string, string>, warnings: string[], where: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, type, size] of rows) {
    const v = (values[name] ?? "").trim();
    if (!v) continue;
    if (type === "date") out[fptKey(name)] = ddmmyyyy(v);
    else if (type === "decimal" || type === "long") {
      const t = v.replace(/,/g, "");
      if (isNum(t)) out[fptKey(name)] = Number(t);
      else warnings.push(`${where}${name}: "${v}" không phải số – bỏ`);
    } else {
      const max = size ? Number(size.split(".")[0]) : undefined;
      if (max && v.length > max) warnings.push(`${where}${name}: cắt từ ${v.length} xuống ${max} ký tự`);
      out[fptKey(name)] = max ? v.slice(0, max) : v;
    }
  }
  return out;
}

export type AmaBuild = { request: AmaRequest; warnings: string[]; issues: string[]; blockers: string[] };

/** Bản khai bổ sung → payload AMA (VNACCS_AMA v1.3). Ô riêng của phần mềm (APP_*) không gửi. */
export function buildAmaRequest(a: Pick<PostAmendment, "header" | "lines">): AmaBuild {
  const warnings: string[] = [];
  const blockers: string[] = [];
  if (!a.lines.length) blockers.push("Bản khai bổ sung chưa có dòng hàng");
  if (!a.header["TK_REC"]?.trim()) blockers.push("Chưa nhập mã lý do khai bổ sung (TK_REC)");
  if (!a.header["TK_ICN"]?.trim()) blockers.push("Thiếu số tờ khai cần bổ sung (TK_ICN)");
  const request = {
    objVN_AMA: toObject(VN_AMA_ROWS, a.header, warnings, ""),
    objVN_AMA_HANG: a.lines.map((l) => toObject(VN_AMA_HANG_ROWS, l.values, warnings, `Dòng ${l.ran} – `)),
  } as AmaRequest;
  const parsed = AmaRequestSchema.safeParse(request);
  const issues = parsed.success ? [] : parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
  return { request, warnings, issues, blockers };
}
