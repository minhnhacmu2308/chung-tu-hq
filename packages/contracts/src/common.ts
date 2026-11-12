import { z } from "zod";

/** Ngày nghiệp vụ YYYY-MM-DD, kiểm tra ngày tồn tại thật. */
export const IsoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày phải dạng YYYY-MM-DD")
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, "Ngày không tồn tại");
export type IsoDate = z.infer<typeof IsoDateSchema>;

/** Thời điểm ISO 8601 có múi giờ (lưu UTC). */
export const IsoDateTimeSchema = z.iso.datetime({ offset: true });
export type IsoDateTime = z.infer<typeof IsoDateTimeSchema>;

/** Tiền/trị giá dạng chuỗi thập phân dấu chấm, không dấu phân cách nghìn, không ký hiệu mũ. */
export const DecimalStringSchema = z.string().regex(/^-?\d+(\.\d+)?$/, "Số thập phân dạng 1234.56");
export type DecimalString = z.infer<typeof DecimalStringSchema>;

export const DirectionSchema = z.enum(["NK", "XK"]);
export type Direction = z.infer<typeof DirectionSchema>;

export const StepIdSchema = z.enum(["create", "upload", "ocr", "agent", "review", "submit"]);
export type StepId = z.infer<typeof StepIdSchema>;
export const STEP_ORDER: readonly StepId[] = StepIdSchema.options;

export const DossierStatusSchema = z.enum(["DRAFT", "PROCESSING", "NEEDS_REVIEW", "APPROVED", "SUBMITTED", "CLEARED", "CANCELLED"]);
export type DossierStatus = z.infer<typeof DossierStatusSchema>;

export const CustomsChannelSchema = z.enum(["GREEN", "YELLOW", "RED"]);
export type CustomsChannel = z.infer<typeof CustomsChannelSchema>;

/** Phương thức vận chuyển – người dùng chọn khi tạo hồ sơ, khai thẳng vào chỉ tiêu 1.6/2.6 (bảng TRANSPORT_MODES). */
export const TransportModeSchema = z.enum(["AIR", "SEA_CONTAINER", "SEA_BULK", "ROAD", "RAIL", "RIVER", "OTHER"]);
export type TransportMode = z.infer<typeof TransportModeSchema>;
export const TRANSPORT_MODE_INFO: Record<TransportMode, { code: string; label: string }> = {
  AIR: { code: "1", label: "Đường hàng không" },
  SEA_CONTAINER: { code: "2", label: "Đường biển (chứa trong container)" },
  SEA_BULK: { code: "3", label: "Đường biển (không chứa trong container)" },
  ROAD: { code: "4", label: "Đường bộ" },
  RAIL: { code: "5", label: "Đường sắt" },
  RIVER: { code: "6", label: "Đường sông" },
  OTHER: { code: "9", label: "Khác" },
};
export const isSeaMode = (m: TransportMode) => m === "SEA_CONTAINER" || m === "SEA_BULK";
/**
 * Phương thức vận chuyển mã 9 (Khác) = giao hàng tại chỗ / trong nước (bán cho DNCX, khu phi thuế quan, xuất nhập khẩu tại chỗ):
 * không có cước, bảo hiểm quốc tế để trừ khỏi trị giá tờ khai xuất (quyết định nghiệp vụ 31/10/2026).
 */
export const isDomesticDelivery = (m: TransportMode | null | undefined) => m === "OTHER";

/** Phân loại cá nhân/tổ chức – chỉ tiêu 1.7 tờ khai nhập khẩu (VN_IDA.TK_SKB). Tờ khai xuất khẩu không có chỉ tiêu này. Giá trị là mã VNACCS. */
export const PartyClassSchema = z.enum(["1", "2", "3", "4", "5"]);
export type PartyClass = z.infer<typeof PartyClassSchema>;
export const PARTY_CLASS_LABELS: Record<PartyClass, string> = {
  "1": "Cá nhân gửi cá nhân",
  "2": "Tổ chức gửi cá nhân",
  "3": "Cá nhân gửi tổ chức",
  "4": "Tổ chức gửi tổ chức",
  "5": "Khác",
};
/** Doanh nghiệp tự khai báo (ADR 0004) → mặc định tổ chức gửi tổ chức. */
export const DEFAULT_PARTY_CLASS: PartyClass = "4";

export const DocKindSchema = z.enum([
  "INVOICE",
  "PACKING_LIST",
  "BILL_OF_LADING",
  "AIR_WAYBILL",
  "CERT_OF_ORIGIN",
  "SALES_CONTRACT",
  "ARRIVAL_NOTICE",
  "FREIGHT_INVOICE",
  "OTHER",
]);
export type DocKind = z.infer<typeof DocKindSchema>;

/**
 * Nguồn của từng loại chứng từ dự kiến trong hồ sơ (ADR 0013). Vắng = `UPLOADED` (tải lên, AI đọc – như cũ).
 * `PENDING_AFTER_DECLARATION`: chưa có, sẽ có sau khi khai (B/L, AWB, C/O của hàng xuất) – không chặn khai; luật cần chứng từ này trả SKIPPED.
 * `ISSUED`: hệ thống phát hành từ dữ liệu lô hàng (Invoice, Packing List của hàng xuất "khai trước") – chưa phát hành invoice thì chặn khai.
 */
export const DocSourceSchema = z.enum(["UPLOADED", "PENDING_AFTER_DECLARATION", "ISSUED"]);
export type DocSource = z.infer<typeof DocSourceSchema>;
/** Loại chứng từ được đánh dấu "có sau khi khai" – chỉ hồ sơ xuất khẩu. */
export const PENDING_CAPABLE_KINDS = ["BILL_OF_LADING", "AIR_WAYBILL", "CERT_OF_ORIGIN"] as const satisfies readonly DocKind[];
/** Loại chứng từ hệ thống phát hành được (cùng một bộ, cùng số tham chiếu) – chỉ hồ sơ xuất khẩu. */
export const ISSUABLE_KINDS = ["INVOICE", "PACKING_LIST"] as const satisfies readonly DocKind[];
export const DocumentSourcesSchema = z.partialRecord(DocKindSchema, DocSourceSchema);
export type DocumentSources = z.infer<typeof DocumentSourcesSchema>;
const kindsWith = (s: DocumentSources | undefined, src: DocSource): DocKind[] => Object.entries(s ?? {}).filter(([, v]) => v === src).map(([k]) => k as DocKind);
/** Loại chứng từ đang chờ sau khai. */
export const pendingKinds = (s: DocumentSources | undefined): DocKind[] => kindsWith(s, "PENDING_AFTER_DECLARATION");
/** Loại chứng từ hệ thống phát hành. */
export const issuedKinds = (s: DocumentSources | undefined): DocKind[] => kindsWith(s, "ISSUED");
/** Có được đặt `PENDING_AFTER_DECLARATION` cho loại này ở hồ sơ chiều `direction` không. */
export const canBePending = (direction: "NK" | "XK", kind: DocKind) => direction === "XK" && (PENDING_CAPABLE_KINDS as readonly DocKind[]).includes(kind);
/** Có được đặt `ISSUED` (hệ thống phát hành) cho loại này ở hồ sơ chiều `direction` không. */
export const canBeIssued = (direction: "NK" | "XK", kind: DocKind) => direction === "XK" && (ISSUABLE_KINDS as readonly DocKind[]).includes(kind);

/** Cách bắt đầu hồ sơ xuất (ADR 0013): từ chứng từ (như cũ) hoặc khai trước – hệ thống phát hành Invoice + Packing List. */
export const StartModeSchema = z.enum(["DOCUMENTS", "DECLARE_FIRST"]);
export type StartMode = z.infer<typeof StartModeSchema>;
/**
 * Nguồn chứng từ mặc định của hồ sơ mới. Hồ sơ xuất: vận đơn (B/L theo đường biển, AWB theo hàng không) có sau khi khai;
 * "khai trước" thêm Invoice + Packing List do hệ thống phát hành. Hồ sơ nhập: như cũ.
 */
export function defaultDocumentSources(direction: "NK" | "XK", mode: TransportMode, start: StartMode = "DOCUMENTS"): DocumentSources {
  if (direction !== "XK") return {};
  const bill: DocKind | null = mode === "AIR" ? "AIR_WAYBILL" : mode === "SEA_CONTAINER" || mode === "SEA_BULK" ? "BILL_OF_LADING" : null;
  return {
    ...(bill ? { [bill]: "PENDING_AFTER_DECLARATION" as const } : {}),
    ...(start === "DECLARE_FIRST" ? { INVOICE: "ISSUED" as const, PACKING_LIST: "ISSUED" as const } : {}),
  };
}

export const DocumentStatusSchema = z.enum(["UPLOADING", "QUEUED", "READING", "DONE", "ERROR"]);
export type DocumentStatus = z.infer<typeof DocumentStatusSchema>;

/** ADR 0003. */
export const FieldStatusSchema = z.enum(["CROSS_CHECKED", "SINGLE_SOURCE", "CONFLICT", "INVALID_FORMAT", "MODEL_UNSURE", "USER_CONFIRMED"]);
export type FieldStatus = z.infer<typeof FieldStatusSchema>;

export const RuleResultSchema = z.enum(["PASS", "WARN", "FAIL", "SKIPPED"]);
export type RuleResult = z.infer<typeof RuleResultSchema>;
export const RuleSeveritySchema = z.enum(["BLOCKER", "WARNING", "INFO"]);
export type RuleSeverity = z.infer<typeof RuleSeveritySchema>;

export const ValueSourceSchema = z.enum(["INVOICE", "BILL_OF_LADING", "PACKING_LIST", "CONTRACT", "CERT_OF_ORIGIN", "FREIGHT_INVOICE", "ARRIVAL_NOTICE", "DOSSIER", "ACCOUNT", "DEFAULT", "SYSTEM", "USER", "LESSON"]);
export type ValueSource = z.infer<typeof ValueSourceSchema>;

export const RoleSchema = z.enum(["OWNER", "ADMIN", "DECLARANT", "APPROVER", "VIEWER"]);
export type Role = z.infer<typeof RoleSchema>;
