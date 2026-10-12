// Kiểu dữ liệu giao diện dùng. Giai đoạn prototype: dữ liệu giả trong src/mocks.
// Khi có backend: giữ nguyên các kiểu này (hoặc thay bằng schema @kb/contracts cùng hình dạng),
// chỉ thay phần thân của src/api/*.ts – màn hình không phải sửa.

/** Ngày nghiệp vụ dạng YYYY-MM-DD. */
export type IsoDate = string;
/** Thời điểm UTC dạng ISO 8601. */
export type IsoDateTime = string;
/** Tiền/trị giá: chuỗi số thập phân dấu chấm ("20850.00"). Không dùng number cho tiền. */
export type DecimalString = string;

export type Direction = "NK" | "XK";

export type StepId = "create" | "upload" | "ocr" | "agent" | "review" | "submit";
export const STEP_ORDER: StepId[] = ["create", "upload", "ocr", "agent", "review", "submit"];
export const STEP_LABELS: Record<StepId, string> = {
  create: "Tạo hồ sơ",
  upload: "Upload chứng từ",
  ocr: "OCR & kiểm tra",
  agent: "AI Agent xử lý",
  review: "Review tờ khai",
  submit: "Khai báo Hải quan",
};

/** Trạng thái tổng của hồ sơ (hiện trên danh sách). */
export type DossierStatus =
  | "DRAFT" // mới tạo, chưa có chứng từ
  | "PROCESSING" // đang đọc / đang chạy agent
  | "NEEDS_REVIEW" // còn trường nghi ngờ / chờ duyệt
  | "APPROVED" // tờ khai đã duyệt, chờ truyền
  | "SUBMITTED" // đã truyền, chờ kết quả
  | "CLEARED" // đã thông quan
  | "CANCELLED";

export type CustomsChannel = "GREEN" | "YELLOW" | "RED";

export type Dossier = {
  id: string;
  code: string; // HS-NK-2610-021
  direction: Direction;
  typeCode: string; // A11, E21, B11…
  partner: string; // đối tác nước ngoài
  customsOffice: string; // "02CI – Chi cục HQ CK cảng Hải Phòng KV I"
  skillSetId: string;
  status: DossierStatus;
  step: StepId; // bước đang dở
  dueDate: IsoDate; // hạn khai
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  ownerId: string;
  invoiceValue: DecimalString;
  currency: string;
  incoterm: string;
  transportMode: "SEA" | "AIR" | "ROAD";
  billNo: string; // số B/L hoặc AWB
  suspectFields: number; // số trường còn nghi ngờ
  note?: string;
  declarationNo?: string;
  channel?: CustomsChannel;
};

export type DocKind =
  | "INVOICE"
  | "PACKING_LIST"
  | "BILL_OF_LADING"
  | "AIR_WAYBILL"
  | "CERT_OF_ORIGIN"
  | "SALES_CONTRACT"
  | "ARRIVAL_NOTICE"
  | "FREIGHT_INVOICE"
  | "OTHER";

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

export type DocumentStatus = "UPLOADING" | "QUEUED" | "READING" | "DONE" | "ERROR";

export type DossierDocument = {
  id: string;
  dossierId: string;
  kind: DocKind;
  fileName: string;
  sizeBytes: number;
  pages: number;
  status: DocumentStatus;
  /** Lý do lỗi khi status = ERROR. */
  error?: string;
  uploadedAt: IsoDateTime;
};

/** Trạng thái một trường trích xuất – ADR 0003 (khớp Status của StatusBadge trong @kb/ui). */
export type FieldStatus = "CROSS_CHECKED" | "SINGLE_SOURCE" | "CONFLICT" | "INVALID_FORMAT" | "MODEL_UNSURE" | "USER_CONFIRMED";

/** Vùng trên trang chứng từ, tọa độ theo % trang (0–100) để tô khi rê chuột. */
export type Region = { page: number; x: number; y: number; w: number; h: number };

export type ExtractedField = {
  id: string;
  documentId: string;
  group: "GENERAL" | "PARTIES" | "COMMERCIAL" | "TRANSPORT" | "ITEMS";
  key: string; // invoice_no, buyer_name…
  label: string;
  value: string;
  originalValue: string; // giá trị AI đọc ra lần đầu
  status: FieldStatus;
  region?: Region;
  /** Giải thích khi CONFLICT / MODEL_UNSURE: "B/L ghi 3.860,50 kg". */
  note?: string;
};

export const FIELD_GROUP_LABELS: Record<ExtractedField["group"], string> = {
  GENERAL: "Thông tin chung",
  PARTIES: "Người bán / người mua",
  COMMERCIAL: "Thương mại",
  TRANSPORT: "Vận chuyển",
  ITEMS: "Danh sách hàng hóa",
};

export type RuleResult = "PASS" | "WARN" | "FAIL" | "SKIPPED";
export type RuleSeverity = "BLOCKER" | "WARNING" | "INFO";

export type CrossCheck = {
  id: string;
  dossierId: string;
  ruleCode: string; // R-WEIGHT-PL-BL
  title: string;
  detail: string;
  result: RuleResult;
  severity: RuleSeverity;
  documentKinds: DocKind[];
};

export type LineItem = {
  id: string;
  dossierId: string;
  lineNo: number;
  description: string;
  quantity: DecimalString;
  unit: string;
  unitPrice: DecimalString;
  amount: DecimalString;
  origin: string; // mã nước ISO-2
  invoiceHsCode?: string; // mã trên invoice nước ngoài – chỉ tham khảo 6 số
  hsSuggested?: string; // gợi ý hscodepro
  hsConfidence?: number; // 0–1
  hsConfirmed?: string; // người dùng xác nhận
  importDutyRate?: DecimalString; // "%"
  vatRate?: DecimalString;
  policyNote?: string;
};

export type ValueSource =
  | "INVOICE"
  | "BILL_OF_LADING"
  | "PACKING_LIST"
  | "CONTRACT"
  | "CERT_OF_ORIGIN"
  | "DOSSIER"
  | "ACCOUNT"
  | "DEFAULT"
  | "SYSTEM";

export const VALUE_SOURCE_LABELS: Record<ValueSource, string> = {
  INVOICE: "Invoice",
  BILL_OF_LADING: "B/L",
  PACKING_LIST: "Packing List",
  CONTRACT: "Contract",
  CERT_OF_ORIGIN: "C/O",
  DOSSIER: "Hồ sơ",
  ACCOUNT: "Tài khoản",
  DEFAULT: "Mặc định",
  SYSTEM: "Hệ thống",
};

export type DeclarationField = {
  code: string; // chỉ tiêu VNACCS
  label: string;
  value: string;
  source: ValueSource;
  section: "GENERAL" | "PARTIES" | "TRANSPORT" | "VALUE";
  suspect?: boolean;
};

export type DeclarationStatus = "NOT_CREATED" | "DRAFT" | "APPROVED" | "SUBMITTED";

export type Declaration = {
  dossierId: string;
  kind: "IDA" | "EDA";
  status: DeclarationStatus;
  fields: DeclarationField[];
  exchangeRate: DecimalString; // VND / ngoại tệ, theo ngày
  exchangeRateDate: IsoDate;
  customsValueVnd: DecimalString; // trị giá tính thuế
  valueAdjustments: { label: string; amount: DecimalString; currency: string; source: ValueSource }[];
  estimatedImportDutyVnd: DecimalString;
  estimatedVatVnd: DecimalString;
  approvedBy?: string;
  approvedAt?: IsoDateTime;
};

export type AgentTaskId = "HS_LOOKUP" | "MAPPING" | "BUILD_DECLARATION" | "DIGITIZE";
export type AgentTaskStatus = "PENDING" | "RUNNING" | "DONE" | "ERROR" | "SKIPPED";
export type AgentRun = {
  dossierId: string;
  mode: "DECLARATION" | "DIGITIZE" | "BOTH";
  startedAt: IsoDateTime;
  tasks: { id: AgentTaskId; status: AgentTaskStatus; progress: number; message: string }[];
};

export type CustomsOperation = "IDA" | "IDC" | "EDA" | "EDC" | "HYS" | "IEX";
export type CustomsMessage = {
  id: string;
  dossierId: string;
  operation: CustomsOperation;
  direction: "OUT" | "IN";
  result: "PENDING" | "OK" | "ERROR";
  summary: string;
  at: IsoDateTime;
  payloadPreview: string; // đã che thông tin nhạy cảm
};

export type CustomsResult = {
  dossierId: string;
  declarationNo: string;
  channel: CustomsChannel;
  channelNote: string;
  clearanceStatus: "WAITING" | "INSPECTING" | "CLEARED";
  customsTaxVnd: DecimalString;
  updatedAt: IsoDateTime;
};

export type SkillKind = "DOCUMENT" | "SUPPLIER" | "MAPPING";
export type SkillField = {
  key: string;
  label: string;
  type: "string" | "decimal" | "date" | "code" | "party" | "items";
  required: boolean;
  aliases: string[]; // nhãn có thể gặp trên chứng từ
  declarationField?: string; // ánh xạ chỉ tiêu tờ khai
  extract: boolean;
  display: boolean;
};
export type Skill = {
  id: string;
  code: string; // SK-INV-GEN
  name: string;
  kind: SkillKind;
  docKind?: DocKind;
  supplier?: string;
  language: string;
  version: number;
  /** Độ chính xác đo trên mẫu đã gắn nhãn (0–1). Không có khi chưa đủ mẫu. */
  accuracy?: number;
  labeledSamples: number;
  updatedAt: IsoDateTime;
  enabled: boolean;
  fields: SkillField[];
};

export type Role = "OWNER" | "ADMIN" | "DECLARANT" | "APPROVER" | "VIEWER";
export const ROLE_LABELS: Record<Role, string> = {
  OWNER: "Chủ sở hữu",
  ADMIN: "Quản trị",
  DECLARANT: "Nhân viên khai báo",
  APPROVER: "Người duyệt",
  VIEWER: "Xem",
};

export type Member = {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: "ACTIVE" | "INVITED" | "DISABLED";
  lastActiveAt?: IsoDateTime;
};

export type Organization = {
  id: string;
  name: string;
  taxCode: string; // MST – string
  address: string;
  phone: string;
  plan: { code: "BASIC" | "PRO" | "ENTERPRISE"; name: string; dossiersPerMonth: number; pagesPerDossier: number; renewsAt: IsoDate };
  usage: { dossiersThisMonth: number; pagesThisMonth: number; aiCostVnd: DecimalString };
  suspectThreshold: "STRICT" | "BALANCED" | "RELAXED";
};

export type Integration = {
  id: "HSCODEPRO" | "CUSTOMS_HUB" | "AI_PROVIDER" | "EINVOICE";
  name: string;
  description: string;
  status: "CONNECTED" | "ERROR" | "NOT_CONFIGURED";
  lastCheckedAt?: IsoDateTime;
  detail?: string;
};

export type DigitalCertificate = {
  id: string;
  subject: string;
  issuer: string; // VNPT-CA, Viettel-CA…
  serial: string;
  validTo: IsoDate;
  isDefault: boolean;
};

export type Notification = {
  id: string;
  title: string;
  body: string;
  at: IsoDateTime;
  read: boolean;
  href?: string;
};
