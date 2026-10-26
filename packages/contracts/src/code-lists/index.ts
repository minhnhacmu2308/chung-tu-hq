// Danh mục mã VNACCS đầy đủ (thư mục 02_DANHMUC_VNACCS) – dùng cho tra cứu mã trên tờ khai. Dữ liệu ở data/*.json, sinh bởi
// scripts/code-lists/build.mjs (không sửa tay). Bảng mã gọn ở declaration/code-tables.ts vẫn là nguồn của backend; ở đây chỉ thêm danh mục đủ để tra.
import type { CodeTable } from "../declaration/catalog-types.js";
import manifest from "./manifest.json" with { type: "json" };

export const CODE_LIST_IDS = [
  "A038", "A014", "A202", "A016", "COUNTRY", "PACKAGE_KIND", "UNIT", "CURRENCY", "TYPE_CODE", "A520", "OTHER_TAX", "BANK", "TAX_TABLE", "ABS_TAX",
  "A546", "ATTACH_KIND", "A519", "A528", "CARGO_CLASS", "TRANSPORT_MODE", "PARTY_CLASS", "INVOICE_KIND", "PRICE_KIND", "PAYMENT", "INCOTERM", "VALUATION_METHOD",
  "FREIGHT_CLASS", "INSURANCE_CLASS", "ADJUSTMENT_CODE", "TAX_PAYER", "DUE_DATE", "GROSS_UNIT", "INSPECTION_RESULT", "BP_REASON",
  "IMPORT_TAX_RATE_KIND", "TAX_KIND",
  // Không thuộc tờ khai – giữ sẵn để tra cứu sau (hãng hàng không / tàu biển / tàu hỏa dùng cho manifest).
  "AIRLINE", "SHIPPING_LINE", "RAIL_CARRIER", "VEHICLE_KIND", "LICENSING_BODY", "CANCEL_REASON",
] as const;
export type CodeListId = (typeof CODE_LIST_IDS)[number];

/** Một mã: `parent` = mã cha (cơ quan Hải quan của địa điểm / bộ phận, mã nước của cảng, NK/XK của loại hình). */
export type CodeListEntry = { code: string; name: string; parent?: string; note?: string; inactive?: boolean };
export type CodeListMeta = {
  id: CodeListId;
  title: string;
  /** File gốc trong 02_DANHMUC_VNACCS. */
  sources: string[];
  /** File cũ hơn đã được thay. */
  superseded?: string[];
  count: number;
  inactive: number;
  hasParent: boolean;
  parentLabel?: string;
  /** Danh mục còn dùng mã cơ quan Hải quan trước đợt sắp xếp 2025 (vd A202 dùng 02B1 thay cho 06B1). */
  usesOldOfficeCodes?: boolean;
  unassigned?: boolean;
};

export const CODE_LIST_META = Object.fromEntries(manifest.lists.map((l) => [l.id, l])) as unknown as Record<CodeListId, CodeListMeta>;

/** Danh mục ngắn (≤ ngưỡng) chọn bằng danh sách thả xuống có ô lọc; dài hơn mở popup tra cứu. */
export const SMALL_CODE_LIST_MAX = 40;

const cache = new Map<CodeListId, Promise<CodeListEntry[]>>();
/** Tải danh mục khi cần (mỗi danh mục một phần tải riêng – danh mục lớn như địa điểm lưu kho không vào gói chính). */
export function loadCodeList(id: CodeListId): Promise<CodeListEntry[]> {
  let p = cache.get(id);
  if (!p) {
    p = import(`./data/${id}.json`).then((m: { default: CodeListEntry[] }) => m.default);
    cache.set(id, p);
  }
  return p;
}

const OLD_TO_NEW: Record<string, string> = manifest.oldToNewOfficeCodes;
/** Mã cơ quan Hải quan mới + các mã cũ tương ứng (ghép theo tên đơn vị) – để lọc danh mục còn dùng mã cũ. */
export function officeCodeAliases(code: string): string[] {
  return [code, ...Object.entries(OLD_TO_NEW).filter(([, nw]) => nw === code).map(([old]) => old)];
}

/** Bảng mã của ô trên tờ khai → danh mục VNACCS. Không có → ô vẫn gõ tay, tên mã (nếu có) tra ở declaration/code-tables.ts. */
const BY_TABLE: Partial<Record<CodeTable, CodeListId>> = {
  A038: "A038", A014: "A014", A202: "A202", A016: "A016", A519: "A519", A520: "A520", A528: "A528", A546: "A546", ATTACH_KIND: "ATTACH_KIND",
  A501: "UNIT", A527: "CURRENCY", UNIT: "UNIT", CURRENCY: "CURRENCY", COUNTRY: "COUNTRY", PACKAGE_KIND: "PACKAGE_KIND", TYPE_CODE: "TYPE_CODE",
  TAX_TABLE: "TAX_TABLE", PAYMENT: "PAYMENT", INCOTERM: "INCOTERM", TRANSPORT_MODE: "TRANSPORT_MODE", INVOICE_KIND: "INVOICE_KIND", PRICE_KIND: "PRICE_KIND",
  CARGO_CLASS: "CARGO_CLASS", PARTY_CLASS: "PARTY_CLASS", VALUATION_METHOD: "VALUATION_METHOD", FREIGHT_CLASS: "FREIGHT_CLASS", INSURANCE_CLASS: "INSURANCE_CLASS",
  ADJUSTMENT_CODE: "ADJUSTMENT_CODE", TAX_PAYER: "TAX_PAYER", DUE_DATE: "DUE_DATE", BANK: "BANK", OTHER_TAX: "OTHER_TAX", ABS_TAX: "ABS_TAX",
  GROSS_UNIT: "GROSS_UNIT", INSPECTION_RESULT: "INSPECTION_RESULT", BP_REASON: "BP_REASON", IMPORT_TAX_RATE_KIND: "IMPORT_TAX_RATE_KIND", TAX_KIND: "TAX_KIND",
};
export const codeListFor = (table: CodeTable | undefined): CodeListId | undefined => (table ? BY_TABLE[table] : undefined);
