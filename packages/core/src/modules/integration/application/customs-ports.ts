import type { OrgAuditWriter } from "../../../shared/audit.js";
// Cổng cho truyền Hải quan (outbox, nhật ký, kết quả, gateway). Nghiệp vụ không thấy DTO FPT (anti-corruption).
import type { CustomsInfo, CustomsOperation, DeclarationStatus, DocKind, DossierStatus, HysFill, HysStatus, PostAmendment, StepId, SubmissionState } from "@kb/contracts";
import type { Clock } from "../../../shared/clock.js";
import type { Notifier } from "../../../shared/notifier.js";
import type { IdGen, OrgId, UserId } from "../../../shared/ids.js";
import type { JobQueue } from "../../../shared/queue.js";
import type { ServiceUsageMeter } from "../../../shared/usage.js";
import type { ProgressEvent } from "../../dossier/index.js";
import type { DeclarationPayload } from "../domain/declaration-to-fpt.js";
import type { ResultRaw } from "../domain/state-machine.js";

export type OutboxRow = { id: string; orgId: string; dossierId: string; /** Nhánh tờ khai (≥ 1). */ branch: number; declarationId: string; operation: CustomsOperation; idempotencyKey: string; payload: unknown; status: "PENDING" | "SENT" | "FAILED"; attempts: number; lastError: string | null; nextAttemptAt: Date | null; createdAt: Date; updatedAt: Date };
export type MessageRow = { id: string; orgId: string; dossierId: string; branch: number; operation: CustomsOperation; direction: "OUT" | "IN" | "NOTE"; result: "PENDING" | "OK" | "ERROR"; summary: string; payloadMasked: unknown; externalRef: string | null; at: Date };
export type ResultRow = {
  id: string; orgId: string; dossierId: string; branch: number; externalId: string | null; declarationNo: string | null; channel: "GREEN" | "YELLOW" | "RED" | null; channelNote: string | null;
  clearanceStatus: "WAITING" | "INSPECTING" | "CLEARED" | "REJECTED"; customsTaxVnd: string | null; state: SubmissionState; pollCount: number;
  /** Giai đoạn vòng đời + dữ liệu phụ (xem ResultRaw). */
  raw: ResultRaw | null; updatedAt: Date;
};

/** Bộ tập tin đính kèm HYS (khai trước IDA/EDA). Ngày `registeredOn` dạng YYYY-MM-DD; thời điểm là Date (UTC). */
export type HysSubmissionRow = {
  id: string; orgId: string; dossierId: string; seq: number; procedureCode: string | null; customsOffice: string | null; processingUnit: string | null; phone: string | null; internalRef: string | null; note: string | null;
  purpose: "PRE_DECLARATION" | "SUPPLEMENT" | null; status: HysStatus; attempt: number; receiptNo: string | null; registeredOn: string | null;
  reject: { code: string; message: string; solution?: string }[] | null; fill: HysFill | null; sentBy: string | null; sentAt: Date | null; createdAt: Date; updatedAt: Date;
};
export type HysFileRow = { id: string; orgId: string; submissionId: string; documentId: string | null; storageKey: string; fileName: string; mime: string; sizeBytes: number; position: number; createdAt: Date };

export interface CustomsRepos {
  outbox: {
    get(orgId: string, id: string): Promise<OutboxRow | null>;
    findByKey(orgId: string, key: string): Promise<OutboxRow | null>;
    listForDossier(orgId: string, dossierId: string): Promise<OutboxRow[]>;
    /** Dòng PENDING chưa từng được xử lý (attempts = 0) tạo trước `before` – job customs-send có thể đã mất (job quét định kỳ). */
    listUnsentBefore(orgId: string, before: Date): Promise<OutboxRow[]>;
    insert(row: OutboxRow): Promise<void>;
    update(orgId: string, id: string, patch: Partial<Pick<OutboxRow, "status" | "attempts" | "lastError" | "nextAttemptAt" | "updatedAt">>): Promise<void>;
  };
  messages: {
    /** `branch` vắng = mọi nhánh. */
    list(orgId: string, dossierId: string, branch?: number): Promise<MessageRow[]>;
    insert(row: MessageRow): Promise<void>;
  };
  results: {
    /** `branch` vắng = nhánh 1. */
    get(orgId: string, dossierId: string, branch?: number): Promise<ResultRow | null>;
    /** Mọi nhánh của hồ sơ, sắp theo nhánh. */
    listForDossier(orgId: string, dossierId: string): Promise<ResultRow[]>;
    listForOrg(orgId: string): Promise<ResultRow[]>;
    /** Mọi nhánh của các hồ sơ (danh sách hồ sơ: tóm tắt "Thông quan k/N" một truy vấn cho cả trang). */
    listForDossiers(orgId: string, dossierIds: string[]): Promise<ResultRow[]>;
    /** Xóa kết quả nhánh > `branch` chưa từng khai (giai đoạn NOT_SENT, chưa có số tờ khai) – số tờ giảm giữa hai lần truyền. Trả số dòng đã xóa. */
    deleteUnsentAbove(orgId: string, dossierId: string, branch: number): Promise<number>;
    upsert(row: ResultRow): Promise<void>;
  };
  /** Bản khai bổ sung sau thông quan (AMA) – bản riêng, tờ khai gốc không đổi. */
  amendments: {
    /** `branch` vắng = mọi nhánh. */
    listForDossier(orgId: string, dossierId: string, branch?: number): Promise<PostAmendmentRow[]>;
    insert(row: PostAmendmentRow): Promise<void>;
    update(row: PostAmendmentRow): Promise<void>;
  };
  /** Bộ tập tin đính kèm HYS và file của bộ (xóa bộ cascade file). */
  hys: {
    list(orgId: string, dossierId: string): Promise<HysSubmissionRow[]>;
    get(orgId: string, id: string): Promise<HysSubmissionRow | null>;
    insert(row: HysSubmissionRow): Promise<void>;
    update(orgId: string, id: string, patch: Partial<Omit<HysSubmissionRow, "id" | "orgId" | "dossierId" | "seq" | "createdAt">>): Promise<void>;
    delete(orgId: string, id: string): Promise<void>;
    files(orgId: string, submissionId: string): Promise<HysFileRow[]>;
    filesForDossier(orgId: string, dossierId: string): Promise<HysFileRow[]>;
    insertFile(row: HysFileRow): Promise<void>;
    deleteFile(orgId: string, fileId: string): Promise<void>;
    deleteFiles(orgId: string, submissionId: string): Promise<void>;
  };
}

/** Bản khai bổ sung trong DB (thời điểm là Date; DTO `PostAmendment` dùng chuỗi ISO). */
export type PostAmendmentRow = Omit<PostAmendment, "approvedAt" | "createdAt" | "updatedAt"> & { orgId: string; branch: number; approvedAt: Date | null; createdAt: Date; updatedAt: Date };

/** field_audit (append-only, bất biến 6) – composition root nối sang bảng của extraction. */
export interface CustomsAuditWriter {
  append(ctx: { orgId: OrgId; userId: UserId }, row: { dossierId: string; key: string; oldValue: string; newValue: string; source: "AMA_EDIT" }): Promise<void>;
}
export interface CustomsUow {
  asOrg<T>(ctx: { orgId: OrgId; userId: UserId }, fn: (r: CustomsRepos) => Promise<T>): Promise<T>;
}

export type GatewayError = { code: string; field?: string; message: string; solution?: string; /** Dòng hàng lỗi (rowPosition). */ line?: number };
export type GatewayStatus = { declarationNo?: string; channel?: "GREEN" | "YELLOW" | "RED"; status: string; cleared: boolean; rejected?: boolean; customsTaxVnd?: string; directives?: string[]; info?: CustomsInfo };

/** Cổng Hải quan (spec §4.7). Lỗi tạm (mạng/5xx) → throw; lỗi nghiệp vụ FPT → `errors`. */
export interface CustomsGateway {
  readonly name: string;
  preDeclare(orgId: string, msg: { kind: "IDA" | "EDA"; request: unknown; dossierId: string }, idempotencyKey: string): Promise<{ externalId: string; declarationNo?: string; info?: CustomsInfo; errors?: GatewayError[] }>;
  declare(orgId: string, msg: { kind: "IDC" | "EDC"; externalId: string; dossierId: string }, idempotencyKey: string): Promise<{ accepted: boolean; channel?: "GREEN" | "YELLOW" | "RED"; customsTaxVnd?: string; info?: CustomsInfo; errors?: GatewayError[] }>;
  /** HYS (bộ tập tin đính kèm): số tiếp nhận (TK_JNO) + ngày tiếp nhận `YYYY-MM-DD` (TK_YMD), hoặc lỗi Hải quan. */
  attachDocuments(orgId: string, req: HysGatewayRequest, idempotencyKey: string): Promise<HysGatewayResult>;
  queryStatus(orgId: string, externalId: string, dossierId: string): Promise<GatewayStatus>;
  /**
   * Nghiệp vụ còn lại của luồng: gọi sửa (IDB/IDD/AMB, EDB/EDD), khai tạm sửa đổi (IDA01/EDA01, AMA), khai chính thức sửa đổi (IDE/EDE, AMC),
   * container qua khu vực giám sát (CONT), lệ phí cảng biển (PORT_FEE). Gateway chưa hỗ trợ nghiệp vụ → ném DomainError NOT_SUPPORTED.
   */
  send(orgId: string, msg: { op: CustomsOperation; externalId: string; dossierId: string; request?: unknown }, idempotencyKey: string): Promise<GatewaySendResult>;
}
/** Thông điệp HYS gửi cổng (spec §2.2): thông tin chung của bộ + file (bytes đọc từ kho). */
export type HysGatewayRequest = { dossierId: string; customsOffice: string; processingUnit: string; procedureCode: string; phone: string | null; internalRef: string | null; note: string | null; files: { name: string; bytes: Buffer }[]; certificateId?: string };
export type HysGatewayResult = { receiptNo?: string; registeredOn?: string; errors?: GatewayError[] };
export type GatewaySendResult = { channel?: "GREEN" | "YELLOW" | "RED"; receiptNo?: string; customsTaxVnd?: string; note?: string; errors?: GatewayError[] };

/** Tờ khai + dòng hàng từ module declaration (composition root nối). */
export type DeclarationSnapshot = { declarationId: string; version: number; status: DeclarationStatus; payload: DeclarationPayload; unconfirmedHs: number; estimatedTaxVnd: string; /** Ngày (giờ VN) tra tỷ giá tính thuế khi dựng tờ khai. */ exchangeRateDate: string;
  /** Thuế dự tính (VND) từng tờ khai nhánh (phần tử i = tờ i+1). */ branchTaxVnd?: string[];
  /** Lần phê duyệt hiện tại (ISO) – duyệt lại sau khi mở lại đổi giá trị dù phiên bản giữ nguyên; ghim nội dung đã truyền (pinOf). */ approvedAt?: string | null;
};
export interface DeclarationReader {
  get(orgId: string, dossierId: string): Promise<DeclarationSnapshot | null>;
  markSubmitted(ctx: { orgId: OrgId; userId: UserId }, dossierId: string): Promise<void>;
  /** Mở lại: tờ khai DRAFT, hồ sơ NEEDS_REVIEW/review. */
  markDraft(ctx: { orgId: OrgId; userId: UserId }, dossierId: string): Promise<void>;
  /** Điền số tiếp nhận HYS vào cặp 1.63/2.53 trống đầu tiên (DRAFT hoặc APPROVED, giữ nguyên trạng thái duyệt). Lỗi → LOCKED. */
  fillAttachment(ctx: { orgId: OrgId; userId: UserId }, dossierId: string, input: { procedureCode: string; receiptNo: string; note: string }): Promise<{ outcome: "FILLED" | "ALREADY" | "FULL" | "LOCKED"; slot?: 1 | 2 | 3; afterApproval: boolean }>;
  /** Hồ sơ có tờ khai APPROVED/SUBMITTED (màn Khai báo Hải quan). */
  listForCustoms(orgId: string): Promise<{ dossierId: string; status: DeclarationStatus; approvedAt: Date | null }[]>;
}

export type DossierBrief = { id: string; code: string; direction: "NK" | "XK"; typeCode: string; partner: string; status: DossierStatus; step: StepId; declarationNo: string | null; updatedAt: Date; /** Người tạo hồ sơ (nguyên tắc 4 mắt). */ ownerId?: string };
export interface CustomsDossierPort {
  get(orgId: string, dossierId: string): Promise<DossierBrief | null>;
  update(orgId: string, dossierId: string, patch: { status?: DossierStatus; step?: StepId; declarationNo?: string; channel?: "GREEN" | "YELLOW" | "RED" }): Promise<void>;
  documents(orgId: string, dossierId: string): Promise<{ id: string; kind: DocKind; fileName: string; storageKey: string; mime: string; sizeBytes: number }[]>;
  readFile(storageKey: string): Promise<Buffer>;
  /** Ghi / xóa file riêng (file upload cho bộ HYS – không vào bảng documents). */
  putFile(storageKey: string, bytes: Buffer, mime: string): Promise<void>;
  deleteFile(storageKey: string): Promise<void>;
  publish(orgId: string, dossierId: string, event: ProgressEvent): Promise<void>;
}
export interface ValidationReader {
  blockerFails(orgId: string, dossierId: string): Promise<number>;
}
export interface CertificateReader {
  exists(orgId: string, certificateId: string): Promise<boolean>;
}

export type CustomsDeps = {
  uow: CustomsUow;
  queue: JobQueue;
  gateway: CustomsGateway;
  declarations: DeclarationReader;
  dossiers: CustomsDossierPort;
  validation: ValidationReader;
  certificates: CertificateReader;
  audit: CustomsAuditWriter;
  /** Nhật ký hoạt động doanh nghiệp (mở lại tờ khai); container nối từ identity. */
  orgAudit?: OrgAuditWriter;
  /** Cấu hình doanh nghiệp: nguyên tắc 4 mắt khi phê duyệt bản khai bổ sung. */
  org: { fourEyes(orgId: string): Promise<boolean> };
  /** Khoảng cách giữa hai lần hỏi trạng thái (ms); gateway giả dùng ngắn để demo. */
  pollDelayMs: number;
  notify?: Notifier;
  /** Ghi chi phí Customs Hub vào usage_events (module billing; container nối). Không nối → không ghi. */
  usage?: ServiceUsageMeter;
  clock: Clock;
  idGen: IdGen;
};
