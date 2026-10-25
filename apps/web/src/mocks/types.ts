// Kiểu dữ liệu dùng chung FE/BE nằm ở @kb/contracts (Zod schema + z.infer).
// File này chỉ re-export kiểu và giữ các nhãn hiển thị (vi/en/zh) cho màn hình.
// Dùng: `useMessages(DOC_KIND_LABELS)[kind]` trong component, `pickMessages(DOC_KIND_LABELS, locale)` ngoài component.
import type { DocKind, FieldGroup, Role, StepId, ValueSource } from "@kb/contracts";
import { defineMessages, type Messages } from "@kb/ui";

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
  CustomsSummary,
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

export const STEP_LABELS: Messages<StepId> = defineMessages({
  vi: { create: "Tạo hồ sơ", upload: "Upload chứng từ", ocr: "OCR & kiểm tra", agent: "AI Agent xử lý", review: "Review tờ khai", submit: "Khai báo Hải quan" },
  en: { create: "Create dossier", upload: "Upload documents", ocr: "OCR & check", agent: "AI Agent", review: "Review declaration", submit: "Customs filing" },
  zh: { create: "创建档案", upload: "上传单证", ocr: "OCR 识别与核对", agent: "AI 智能处理", review: "审核报关单", submit: "海关申报" },
});

export const DOC_KIND_LABELS: Messages<DocKind> = defineMessages({
  vi: { INVOICE: "Commercial Invoice", PACKING_LIST: "Packing List", BILL_OF_LADING: "Bill of Lading", AIR_WAYBILL: "Air Waybill", CERT_OF_ORIGIN: "C/O", SALES_CONTRACT: "Sales Contract", ARRIVAL_NOTICE: "Arrival Notice", FREIGHT_INVOICE: "Hóa đơn cước", OTHER: "Khác" },
  en: { INVOICE: "Commercial Invoice", PACKING_LIST: "Packing List", BILL_OF_LADING: "Bill of Lading", AIR_WAYBILL: "Air Waybill", CERT_OF_ORIGIN: "C/O", SALES_CONTRACT: "Sales Contract", ARRIVAL_NOTICE: "Arrival Notice", FREIGHT_INVOICE: "Freight invoice", OTHER: "Other" },
  zh: { INVOICE: "商业发票", PACKING_LIST: "装箱单", BILL_OF_LADING: "提单", AIR_WAYBILL: "航空运单", CERT_OF_ORIGIN: "原产地证 (C/O)", SALES_CONTRACT: "销售合同", ARRIVAL_NOTICE: "到货通知", FREIGHT_INVOICE: "运费发票", OTHER: "其他" },
});

export const FIELD_GROUP_LABELS: Messages<FieldGroup> = defineMessages({
  vi: { GENERAL: "Thông tin chung", PARTIES: "Người bán / người mua", COMMERCIAL: "Thương mại", TRANSPORT: "Vận chuyển", ITEMS: "Danh sách hàng hóa" },
  en: { GENERAL: "General", PARTIES: "Seller / buyer", COMMERCIAL: "Commercial", TRANSPORT: "Transport", ITEMS: "Goods list" },
  zh: { GENERAL: "基本信息", PARTIES: "卖方 / 买方", COMMERCIAL: "商务", TRANSPORT: "运输", ITEMS: "货物清单" },
});

export const VALUE_SOURCE_LABELS: Messages<ValueSource> = defineMessages({
  vi: { INVOICE: "Invoice", BILL_OF_LADING: "B/L", PACKING_LIST: "Packing List", CONTRACT: "Contract", CERT_OF_ORIGIN: "C/O", FREIGHT_INVOICE: "Hóa đơn cước", ARRIVAL_NOTICE: "Arrival Notice", DOSSIER: "Hồ sơ", ACCOUNT: "Tài khoản", DEFAULT: "Mặc định", SYSTEM: "Hệ thống", USER: "Người khai sửa" },
  en: { INVOICE: "Invoice", BILL_OF_LADING: "B/L", PACKING_LIST: "Packing List", CONTRACT: "Contract", CERT_OF_ORIGIN: "C/O", FREIGHT_INVOICE: "Freight invoice", ARRIVAL_NOTICE: "Arrival Notice", DOSSIER: "Dossier", ACCOUNT: "Account", DEFAULT: "Default", SYSTEM: "System", USER: "Edited by declarant" },
  zh: { INVOICE: "发票", BILL_OF_LADING: "提单", PACKING_LIST: "装箱单", CONTRACT: "合同", CERT_OF_ORIGIN: "原产地证", FREIGHT_INVOICE: "运费发票", ARRIVAL_NOTICE: "到货通知", DOSSIER: "档案", ACCOUNT: "账户", DEFAULT: "默认", SYSTEM: "系统", USER: "申报人修改" },
});

export const ROLE_LABELS: Messages<Role> = defineMessages({
  vi: { OWNER: "Chủ sở hữu", ADMIN: "Quản trị", DECLARANT: "Nhân viên khai báo", APPROVER: "Người duyệt", VIEWER: "Xem" },
  en: { OWNER: "Owner", ADMIN: "Admin", DECLARANT: "Declarant", APPROVER: "Approver", VIEWER: "Viewer" },
  zh: { OWNER: "所有者", ADMIN: "管理员", DECLARANT: "申报员", APPROVER: "审批人", VIEWER: "只读" },
});
