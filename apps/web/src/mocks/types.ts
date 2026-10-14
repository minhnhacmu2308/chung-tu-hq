// Kiểu dữ liệu dùng chung FE/BE nằm ở @kb/contracts (Zod schema + z.infer).
// File này chỉ re-export kiểu và giữ các nhãn hiển thị tiếng Việt cho màn hình.
import type { DocKind, FieldGroup, Role, StepId, ValueSource } from "@kb/contracts";

export type {
  AgentMode,
  AgentRun,
  AgentTaskId,
  AgentTaskStatus,
  CrossCheck,
  CustomsChannel,
  CustomsMessage,
  CustomsOperation,
  CustomsResult,
  DecimalString,
  Declaration,
  DeclarationField,
  DeclarationStatus,
  DigitalCertificate,
  Direction,
  DocKind,
  DocumentStatus,
  Dossier,
  DossierDocument,
  DossierStatus,
  ExtractedField,
  FieldGroup,
  FieldStatus,
  Integration,
  IsoDate,
  IsoDateTime,
  LineItem,
  Member,
  Notification,
  Organization,
  Region,
  Role,
  RuleResult,
  RuleSeverity,
  Skill,
  SkillField,
  SkillFieldPatch,
  SkillKind,
  StepId,
  TransportMode,
  ValueSource,
} from "@kb/contracts";
export { STEP_ORDER } from "@kb/contracts";

export const STEP_LABELS: Record<StepId, string> = {
  create: "Tạo hồ sơ",
  upload: "Upload chứng từ",
  ocr: "OCR & kiểm tra",
  agent: "AI Agent xử lý",
  review: "Review tờ khai",
  submit: "Khai báo Hải quan",
};

export const DOC_KIND_LABELS: Record<DocKind, string> = {
  INVOICE: "Commercial Invoice",
  PACKING_LIST: "Packing List",
  BILL_OF_LADING: "Bill of Lading",
  AIR_WAYBILL: "Air Waybill",
  CERT_OF_ORIGIN: "C/O",
  SALES_CONTRACT: "Sales Contract",
  ARRIVAL_NOTICE: "Arrival Notice",
  FREIGHT_INVOICE: "Hóa đơn cước",
  OTHER: "Khác",
};

export const FIELD_GROUP_LABELS: Record<FieldGroup, string> = {
  GENERAL: "Thông tin chung",
  PARTIES: "Người bán / người mua",
  COMMERCIAL: "Thương mại",
  TRANSPORT: "Vận chuyển",
  ITEMS: "Danh sách hàng hóa",
};

export const VALUE_SOURCE_LABELS: Record<ValueSource, string> = {
  INVOICE: "Invoice",
  BILL_OF_LADING: "B/L",
  PACKING_LIST: "Packing List",
  CONTRACT: "Contract",
  CERT_OF_ORIGIN: "C/O",
  FREIGHT_INVOICE: "Hóa đơn cước",
  ARRIVAL_NOTICE: "Arrival Notice",
  DOSSIER: "Hồ sơ",
  ACCOUNT: "Tài khoản",
  DEFAULT: "Mặc định",
  SYSTEM: "Hệ thống",
  USER: "Người khai sửa",
};

export const ROLE_LABELS: Record<Role, string> = {
  OWNER: "Chủ sở hữu",
  ADMIN: "Quản trị",
  DECLARANT: "Nhân viên khai báo",
  APPROVER: "Người duyệt",
  VIEWER: "Xem",
};
