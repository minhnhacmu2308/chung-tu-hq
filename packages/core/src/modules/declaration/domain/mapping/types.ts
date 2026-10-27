// Ánh xạ dữ liệu lô hàng → chỉ tiêu tờ khai (skill mapping-declaration-fields). Code thuần, cùng dữ liệu luôn ra cùng kết quả.
import type { DocKind, Shipment, Sourced, ValueCharges, ValueSource } from "@kb/contracts";
import type { CatalogEntry } from "../catalog-resolve.js";
import type { Adjustment, Valuation } from "../valuation.js";
import type { DossierInfo, OrgInfo } from "../types.js";

export type Section = "GENERAL" | "PARTIES" | "TRANSPORT" | "VALUE";
/** Tỷ giá theo ngày khai dự kiến: VND / 1 đơn vị từng tiền tệ (VND → "1"); `missing` = tiền tệ chưa có tỷ giá. */
export type ExchangeInfo = { date: string; rates: Record<string, string>; missing: string[] };
/** Ngày theo giờ Việt Nam (UTC+7) – ngày khai báo dự kiến, ngày tra tỷ giá. */
export const vnDate = (now: Date) => new Date(now.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
/**
 * `via: "profile"` = giá trị lấy từ Mặc định khai báo của doanh nghiệp (để ghi nguồn gốc).
 * `blocking`: thiếu giá trị thì chặn phê duyệt (Hải quan chắc chắn từ chối đăng ký, ví dụ MO/CU theo CV 2061).
 */
export type MappedValue = { value: string | null; source: ValueSource; suspect?: boolean; note?: string; via?: "profile"; blocking?: true };
/** Dòng hàng đã lưu: mã HS người dùng đã xác nhận – căn cứ chính thay cho HS trên invoice nước ngoài. */
export type MappingLine = { lineNo: number; hsConfirmed: string | null };
/**
 * Danh mục VNACCS đầy đủ đã nạp sẵn cho hồ sơ (tầng application tải theo chi cục): cảng Việt Nam (A016), địa điểm lưu kho của chi cục (A202).
 * Không có (test, eval offline) → chỉ dùng bảng gọn trong catalog-resolve.
 */
/** `ports`: cảng Việt Nam (A016, parent VN); `worldPorts`: toàn bộ A016 – tra cảng/sân bay xếp hàng nước ngoài. */
export type DeclarationCatalogs = { ports?: CatalogEntry[]; worldPorts?: CatalogEntry[]; warehouses?: CatalogEntry[] };
export type MappingInput = {
  shipment: Shipment; dossier: DossierInfo; org: OrgInfo; now: Date; adjustments: Adjustment[]; valuation: Valuation; exchange: ExchangeInfo;
  /** Mặc định khai báo của doanh nghiệp theo chiều NK/XK: mã chỉ tiêu → giá trị. */
  profile: Record<string, string>;
  /** Ghi đè của doanh nghiệp theo mã chỉ tiêu. */
  overrides: Record<string, FieldOverride>;
  lines: MappingLine[];
  /** Chi phí người khai nhập ở bước OCR & kiểm tra (cước, bảo hiểm, khoản điều chỉnh). */
  charges: ValueCharges;
  catalogs?: DeclarationCatalogs;
};
/** Nguồn thay thế được phép cho một chỉ tiêu: hàm đọc thuần; null/value null = nguồn không có giá trị. */
export type SourceOption = { id: string; label: string; read: (i: MappingInput) => MappedValue | null };
export type FieldOverride = { sources: string[] } | { fixed: string };
export type Provenance = { rule: string; via: "default" | "source" | "fixed" | "profile"; sourceId?: string };
export type FieldMapping = {
  /** Khóa ổn định (mnemonic) dùng cho FE/API. */
  code: string;
  /** Số chỉ tiêu Phụ lục II; null khi chỉ tiêu không có trong tờ khai VNACCS (thông tin phụ cho người duyệt). */
  no: string | null;
  section: Section;
  label: string;
  /** Bắt buộc theo Phụ lục II: thiếu giá trị → suspect. */
  required: boolean;
  from: (i: MappingInput) => MappedValue;
  /** Doanh nghiệp được chọn nguồn (theo thứ tự) trong danh sách này hoặc đặt giá trị cố định. Không có = không ghi đè được. */
  options?: { sources: SourceOption[]; allowFixed: boolean };
  /**
   * Chỉ tiêu "theo tình huống" (Phụ lục II): chỉ có trên tờ khai khi `test` đúng; `label` giải thích cho người khai vì sao chỉ tiêu xuất hiện.
   * Không có `when` = luôn có.
   */
  when?: { label: string; test: (i: MappingInput) => boolean };
};

const SOURCE_BY_KIND: Record<DocKind, ValueSource> = {
  INVOICE: "INVOICE", PACKING_LIST: "PACKING_LIST", BILL_OF_LADING: "BILL_OF_LADING", AIR_WAYBILL: "BILL_OF_LADING", CERT_OF_ORIGIN: "CERT_OF_ORIGIN",
  SALES_CONTRACT: "CONTRACT", ARRIVAL_NOTICE: "ARRIVAL_NOTICE", FREIGHT_INVOICE: "FREIGHT_INVOICE", OTHER: "SYSTEM",
};

/** Nhãn nguồn hiển thị của một loại chứng từ (AWB hiện như vận đơn). */
export const sourceOfKind = (kind: DocKind): ValueSource => SOURCE_BY_KIND[kind];

/** Giá trị kèm nguồn từ Sourced: nguồn = chứng từ đầu tiên; CONFLICT/MODEL_UNSURE → suspect kèm ghi chú. */
export function fromSourced(s: Sourced<string>, fallback: ValueSource = "SYSTEM", transform?: (v: string) => string): MappedValue {
  const kind = s.sources[0]?.kind;
  const source: ValueSource = kind ? SOURCE_BY_KIND[kind] : fallback;
  const suspect = s.status === "CONFLICT" || s.status === "MODEL_UNSURE";
  const note = s.note ?? (s.status === "CONFLICT" ? "Các chứng từ không khớp nhau" : s.status === "MODEL_UNSURE" ? "Model không chắc giá trị này" : undefined);
  return { value: s.value === null ? null : transform ? transform(s.value) : s.value, source, ...(suspect ? { suspect: true } : {}), ...(note ? { note } : {}) };
}

/** "26150.000000" → "26150"; "3860.50" → "3860.5" (numeric của Postgres có 6 số lẻ). */
export const plainNumber = (v: string) => (/^-?\d+(\.\d+)?$/.test(v) ? v.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "") : v);
export const fixed = (value: string, source: ValueSource = "DEFAULT"): MappedValue => ({ value, source });
export const missing = (source: ValueSource, note: string): MappedValue => ({ value: null, source, suspect: true, note });

/** Giá trị theo Mặc định khai báo nếu doanh nghiệp đã đặt, ngược lại giá trị mặc định của hệ thống. */
export const profileOr = (i: MappingInput, code: string, fallback: MappedValue): MappedValue => {
  const v = i.profile[code]?.trim();
  return v ? { value: v, source: "DEFAULT", via: "profile" } : fallback;
};
