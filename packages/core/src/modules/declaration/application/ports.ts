import type { OrgAuditWriter } from "../../../shared/audit.js";
import type { ValueCharges, AgentMode, CustomsStage, AgentTaskId, AgentTaskStatus, DeclarationStatus, DocKind, DossierStatus, HsAnswerRequest, HsCreateRequest, HsJob, HsPendingQuestion, LineItemHsStatus, Shipment, StepId } from "@kb/contracts";
import type { Clock } from "../../../shared/clock.js";
import type { Notifier } from "../../../shared/notifier.js";
import type { IdGen, OrgId, UserId } from "../../../shared/ids.js";
import type { JobQueue } from "../../../shared/queue.js";
import type { ServiceUsageMeter } from "../../../shared/usage.js";
import type { ProgressEvent } from "../../dossier/index.js";
import type { FieldOverride } from "../domain/mapping/types.js";
import type { Adjustment } from "../domain/valuation.js";
import type { DossierInfo, HsCatalogRow, OrgInfo, StoredField } from "../domain/types.js";

export type { DossierInfo, HsCatalogRow, OrgInfo, StoredField };

export type LineItemRow = {
  id: string; orgId: string; dossierId: string; lineNo: number; description: string; quantity: string; unit: string; unitPrice: string; amount: string; origin: string;
  invoiceHsCode: string | null; hsSuggested: string | null; hsConfidence: number | null; hsConfirmed: string | null; hsConfirmedBy: string | null; hsConfirmedAt: Date | null;
  importDutyRate: string | null; vatRate: string | null; policyNote: string | null;
  /** Phân loại HSCodePro (xem LineItemHsStatus trong contracts). */
  hsJobId: string | null; hsItemId: string | null; hsStatus: LineItemHsStatus; hsQuestion: HsPendingQuestion | null; hsError: { code: string; message: string } | null; hsDetail: HsDetail | null;
  createdAt: Date; updatedAt: Date;
};
export type HsDetail = { reasoning: string; legalBasis: string[]; warnings: string[] };
/** Thuế của một ứng viên (chuỗi thập phân); null khi HSCodePro chưa tra được. */
export type HsSuggestionRates = { importRate: string | null; basis: "MFN" | "FTA" | null; agreement: string | null; vatRate: string | null };
export type HsSuggestionRow = { id: string; orgId: string; lineItemId: string; code: string; description: string; confidence: number; rates: HsSuggestionRates | null; whyNot: string | null; source: string; createdAt: Date };
/** `pending`: đã ghi DB, chưa (hoặc chưa biết đã) tạo được lượt ở HSCodePro – `externalId` rỗng; chạy lại sẽ dùng lại dòng này (chi phí ghi một lần theo `id`). */
export type HsJobRow = { id: string; orgId: string; dossierId: string; externalId: string; status: "pending" | "processing" | "need_info" | "completed" | "cancelled"; polls: number; createdAt: Date; updatedAt: Date };
export type HsLinePatch = Partial<Pick<LineItemRow, "hsSuggested" | "hsConfidence" | "hsConfirmed" | "hsConfirmedBy" | "hsConfirmedAt" | "importDutyRate" | "vatRate" | "policyNote" | "hsJobId" | "hsItemId" | "hsStatus" | "hsQuestion" | "hsError" | "hsDetail" | "description" | "origin" | "updatedAt">>;
export type DeclarationRow = {
  id: string; orgId: string; dossierId: string; kind: "IDA" | "EDA"; version: number; status: DeclarationStatus; fields: Record<string, StoredField>;
  exchangeRate: string; exchangeRateDate: string; customsValueVnd: string; valueAdjustments: Adjustment[]; estImportDutyVnd: string; estVatVnd: string;
  approvedBy: string | null; approvedAt: Date | null; createdAt: Date; updatedAt: Date;
};
export type AgentTask = { id: AgentTaskId; status: AgentTaskStatus; progress: number; message: string };
export type AgentLog = { at: string; text: string; tone: "info" | "success" | "warning" };
export type AgentRunRow = { id: string; orgId: string; dossierId: string; mode: AgentMode; status: "RUNNING" | "DONE" | "ERROR" | "CANCELLED"; tasks: AgentTask[]; log: AgentLog[]; startedBy: string; startedAt: Date; finishedAt: Date | null };

export type ValueChargesRow = { id: string; orgId: string; dossierId: string; data: ValueCharges; updatedBy: string; updatedAt: Date };

export type ProfileRow = { id: string; orgId: string; direction: "NK" | "XK"; values: Record<string, string>; overrides: Record<string, FieldOverride>; updatedBy: string | null; updatedAt: Date };

/** Mặt hàng trong danh mục hàng hóa của doanh nghiệp (bảng product_catalog). */
export type ProductRow = {
  id: string; orgId: string; key: string; nameKey: string; code: string | null; name: string; hsCode: string; unit: string | null; origin: string | null;
  tariffSchedule: string | null; importDutyRate: string | null; vatRate: string | null;
  envTaxRate: string | null; exciseRate: string | null; safeguardRate: string | null; antiDiscriminationRate: string | null;
  description: string | null; unit2: string | null; unitPrice: string | null; currency: string | null; partner: string | null; note: string | null;
  source: "IMPORT" | "MANUAL" | "DECLARATION"; timesDeclared: number; lastDeclarationNo: string | null; lastDeclarationDate: string | null;
  lastTypeCode: string | null; raw: Record<string, string> | null; updatedBy: string | null; createdAt: Date; updatedAt: Date;
};

export interface DeclarationRepos {
  lineItems: {
    list(orgId: string, dossierId: string): Promise<LineItemRow[]>;
    get(orgId: string, id: string): Promise<LineItemRow | null>;
    /** Ghi dòng hàng theo (dossier, lineNo): dòng đã có giữ HS đã xác nhận; dòng thừa bị xóa. */
    upsertForDossier(orgId: string, dossierId: string, rows: LineItemRow[]): Promise<LineItemRow[]>;
    update(orgId: string, id: string, patch: HsLinePatch): Promise<void>;
    findByHsItem(orgId: string, hsItemId: string): Promise<LineItemRow | null>;
  };
  hsJobs: {
    insert(row: HsJobRow): Promise<void>;
    get(orgId: string, id: string): Promise<HsJobRow | null>;
    /** Lượt chưa xong (pending/processing/need_info) của hồ sơ. */
    openForDossier(orgId: string, dossierId: string): Promise<HsJobRow[]>;
    update(orgId: string, id: string, patch: Partial<Pick<HsJobRow, "status" | "polls" | "updatedAt" | "externalId">>): Promise<void>;
  };
  suggestions: {
    listForItems(orgId: string, lineItemIds: string[]): Promise<HsSuggestionRow[]>;
    replaceForItem(orgId: string, lineItemId: string, rows: HsSuggestionRow[]): Promise<void>;
  };
  declarations: {
    latest(orgId: string, dossierId: string): Promise<DeclarationRow | null>;
    /** Tờ khai mới nhất của mỗi hồ sơ có status trong danh sách (màn Khai báo Hải quan). */
    listLatestByStatus(orgId: string, statuses: DeclarationStatus[]): Promise<DeclarationRow[]>;
    insert(row: DeclarationRow): Promise<void>;
    update(orgId: string, id: string, patch: Partial<Pick<DeclarationRow, "status" | "fields" | "approvedBy" | "approvedAt" | "updatedAt" | "exchangeRate" | "exchangeRateDate" | "customsValueVnd" | "valueAdjustments" | "estImportDutyVnd" | "estVatVnd">>): Promise<void>;
  };
  agentRuns: {
    latest(orgId: string, dossierId: string): Promise<AgentRunRow | null>;
    /** Lần chạy còn RUNNING bắt đầu trước `before` (job quét định kỳ). */
    listRunningBefore(orgId: string, before: Date): Promise<AgentRunRow[]>;
    get(orgId: string, id: string): Promise<AgentRunRow | null>;
    insert(row: AgentRunRow): Promise<void>;
    update(orgId: string, id: string, patch: Partial<Pick<AgentRunRow, "status" | "tasks" | "log" | "finishedAt">>): Promise<void>;
  };
  catalogHs: {
    search(q: string | undefined, limit: number): Promise<HsCatalogRow[]>;
    get(code: string): Promise<HsCatalogRow | null>;
    all(): Promise<HsCatalogRow[]>;
  };
  profiles: {
    get(orgId: string, direction: "NK" | "XK"): Promise<ProfileRow | null>;
    /** Ghi đè theo (org, chiều). */
    upsert(row: ProfileRow): Promise<void>;
  };
  products: {
    list(orgId: string): Promise<ProductRow[]>;
    get(orgId: string, id: string): Promise<ProductRow | null>;
    byKeys(orgId: string, keys: string[]): Promise<ProductRow[]>;
    /** Mặt hàng có tên chuẩn hóa thuộc danh sách (kể cả mặt hàng khóa theo mã hàng). */
    byNameKeys(orgId: string, nameKeys: string[]): Promise<ProductRow[]>;
    insert(rows: ProductRow[]): Promise<void>;
    update(row: ProductRow): Promise<void>;
    /** Xóa theo id trong org; trả số dòng đã xóa. */
    remove(orgId: string, ids: string[]): Promise<number>;
  };
  valueCharges: {
    get(orgId: string, dossierId: string): Promise<ValueChargesRow | null>;
    /** Ghi đè theo (org, hồ sơ). */
    upsert(row: ValueChargesRow): Promise<void>;
  };
  exchangeRates: {
    /** Tỷ giá gần nhất ≤ ngày (VND / 1 đơn vị). */
    latest(currency: string, date: string): Promise<{ rate: string; date: string; source: "VCB" | "MANUAL" | "SEED"; snapshotAt: Date | null } | null>;
  };
}

export interface DeclarationUow {
  asOrg<T>(ctx: { orgId: OrgId; userId: UserId }, fn: (r: DeclarationRepos) => Promise<T>): Promise<T>;
}

/** Phân loại HS bất đồng bộ (HSCodePro hoặc giả): tạo lượt → hỏi trạng thái → trả lời câu hỏi → hủy. Lỗi → HsApiError. */
export interface HsClassificationService {
  readonly name: string;
  create(req: HsCreateRequest): Promise<HsJob>;
  get(jobId: string): Promise<HsJob>;
  answer(jobId: string, itemId: string, body: HsAnswerRequest): Promise<void>;
  cancel(jobId: string): Promise<void>;
}

/** Lỗi từ HSCodePro: `status` HTTP + `code` theo tài liệu §8 (INVALID_INPUT, INVALID_STATE, RATE_LIMITED, NOT_CONFIGURED…). */
export class HsApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly details?: { field: string; message: string }[]) {
    super(message);
    this.name = "HsApiError";
  }
  /** Lỗi tạm (mạng/5xx trừ 503 chưa cấu hình, 429) → để BullMQ thử lại. */
  get transient() {
    return this.status === 429 || (this.status >= 500 && this.code !== "NOT_CONFIGURED" && this.code !== "BAD_RESPONSE");
  }
}

/** Dữ liệu từ module extraction (composition root nối qua uow của extraction). */
export interface ShipmentReader {
  latest(orgId: string, dossierId: string): Promise<Shipment | null>;
  extractions(orgId: string, dossierId: string): Promise<{ documentId: string; kind: DocKind; raw: unknown }[]>;
}

export interface DossierPort {
  get(orgId: string, dossierId: string): Promise<DossierInfo | null>;
  update(orgId: string, dossierId: string, patch: { status?: DossierStatus; step?: StepId; suspectFields?: number }): Promise<void>;
  documents(orgId: string, dossierId: string): Promise<{ id: string; kind: DocKind; fileName: string }[]>;
  publish(orgId: string, dossierId: string, event: ProgressEvent): Promise<void>;
  /** Lưu dữ liệu số hóa (JSON) vào storage. */
  putFile(key: string, body: Buffer, mime: string): Promise<void>;
}

export interface ValidationReader {
  blockerFails(orgId: string, dossierId: string): Promise<number>;
}

export interface OrgReader {
  get(orgId: string): Promise<OrgInfo>;
}

/** field_audit (bảng của extraction) – append-only. */
export interface AuditWriter {
  append(ctx: { orgId: OrgId; userId: UserId }, row: { dossierId: string; key: string; oldValue: string; newValue: string; source: "HS_CONFIRM" | "DECL_EDIT" | "AMA_EDIT" | "CHARGE_EDIT" }): Promise<void>;
}

export interface UserNames {
  names(orgId: string, userIds: string[]): Promise<Map<string, string>>;
}

export type DeclarationDeps = {
  uow: DeclarationUow;
  queue: JobQueue;
  hs: HsClassificationService;
  shipments: ShipmentReader;
  dossiers: DossierPort;
  validation: ValidationReader;
  org: OrgReader;
  audit: AuditWriter;
  /** Nhật ký hoạt động doanh nghiệp (duyệt tờ khai, danh mục hàng hóa); container nối từ identity. */
  orgAudit?: OrgAuditWriter;
  users: UserNames;
  /** Thông báo trong app (tùy chọn; container nối). */
  notify?: Notifier;
  /** Giai đoạn truyền Hải quan của hồ sơ (module integration; container nối) – chặn sửa chỉ tiêu theo giai đoạn. Không nối → coi như chưa khai. */
  customsStage?: (orgId: string, dossierId: string) => Promise<CustomsStage>;
  /** Ghi chi phí HSCodePro vào usage_events (module billing; container nối). Không nối → không ghi. */
  usage?: ServiceUsageMeter;
  /** Sau khi lưu chi phí người khai nhập: chạy lại luật đối chiếu (container nối với module validation). */
  onChargesSaved?: (orgId: string, dossierId: string) => Promise<void>;
  clock: Clock;
  idGen: IdGen;
};
