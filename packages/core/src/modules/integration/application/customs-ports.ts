import type { OrgAuditWriter } from "../../../shared/audit.js";
// Cổng cho truyền Hải quan (outbox, nhật ký, kết quả, gateway). Nghiệp vụ không thấy DTO FPT (anti-corruption).
import type { AttachKind, ContainerListRow as ContainerListRowData, ContainerListStatus, CustomsInfo, CustomsOperation, DeclarationStatus, DocKind, DossierStatus, FptTraceEntry, HysFill, HysStatus, KvgsFetchStatus, KvgsSheet, PostAmendment, StepId, SubmissionState, TransportMode } from "@kb/contracts";
import type { Clock } from "../../../shared/clock.js";
import type { Notifier } from "../../../shared/notifier.js";
import type { IdGen, OrgId, UserId } from "../../../shared/ids.js";
import type { JobQueue } from "../../../shared/queue.js";
import type { ServiceUsageMeter } from "../../../shared/usage.js";
import type { DeclarationBilling } from "../../../shared/billing.js";
import type { ProgressEvent } from "../../dossier/index.js";
import type { DeclarationPayload } from "../domain/declaration-to-fpt.js";
import type { PrefillDoc } from "../domain/container-prefill.js";
import type { ResultRaw } from "../domain/state-machine.js";

export type OutboxRow = { id: string; orgId: string; dossierId: string; /** Nhánh tờ khai (≥ 1). */ branch: number; declarationId: string; operation: CustomsOperation; idempotencyKey: string; payload: unknown; status: "PENDING" | "SENT" | "FAILED"; attempts: number; lastError: string | null; nextAttemptAt: Date | null; createdAt: Date; updatedAt: Date };
export type MessageRow = { id: string; orgId: string; dossierId: string; branch: number; operation: CustomsOperation; direction: "OUT" | "IN" | "NOTE"; result: "PENDING" | "OK" | "ERROR"; summary: string; payloadMasked: unknown; externalRef: string | null; at: Date };
/** Thông điệp VNACCSREP trong hộp thư (lưu ngay khi lấy – FPT không trả lại). */
export type InboxRow = { id: string; orgId: string; dedupKey: string; message: GatewayMessage; status: "PENDING" | "APPLIED" | "UNMATCHED"; attempts: number; receivedAt: Date; appliedAt: Date | null };
export type ResultRow = {
  id: string; orgId: string; dossierId: string; branch: number; externalId: string | null; declarationNo: string | null; channel: "GREEN" | "YELLOW" | "RED" | null; channelNote: string | null;
  clearanceStatus: "WAITING" | "INSPECTING" | "CLEARED" | "REJECTED"; customsTaxVnd: string | null; state: SubmissionState; pollCount: number;
  /** Giai đoạn vòng đời + dữ liệu phụ (xem ResultRaw). */
  raw: ResultRaw | null; updatedAt: Date;
};

/** Bộ tập tin đính kèm HYS (khai trước IDA/EDA). Ngày `registeredOn` dạng YYYY-MM-DD; thời điểm là Date (UTC). */
export type HysSubmissionRow = {
  id: string; orgId: string; dossierId: string; seq: number; procedureCode: string | null; attachKind: AttachKind | null; customsOffice: string | null; processingUnit: string | null; phone: string | null; internalRef: string | null; note: string | null;
  purpose: "PRE_DECLARATION" | "SUPPLEMENT" | null; status: HysStatus; attempt: number; receiptNo: string | null; registeredOn: string | null;
  reject: { code: string; message: string; solution?: string }[] | null; fill: HysFill | null; sentBy: string | null; sentAt: Date | null; createdAt: Date; updatedAt: Date;
};
export type HysFileRow = { id: string; orgId: string; submissionId: string; documentId: string | null; storageKey: string; fileName: string; mime: string; sizeBytes: number; position: number; createdAt: Date };

/** Danh sách container khai qua khu vực giám sát (V5ContainerReq/Res, ADR 0014); mỗi lần khai (attempt) một dòng. Ngày `receiptDate` YYYY-MM-DD; thời điểm là Date (UTC). */
export type ContainerListRecord = {
  id: string; orgId: string; dossierId: string; branch: number; attempt: number; rows: ContainerListRowData[]; status: ContainerListStatus; refId: string | null; receiptNo: string | null; receiptDate: string | null;
  errors: GatewayError[] | null; sentRows: ContainerListRowData[] | null; sentBy: string | null; sentAt: Date | null; createdAt: Date; updatedAt: Date;
};
/** Bảng kê qua khu vực giám sát lấy từ Hải quan (ADR 0014); mỗi lần lấy một dòng, `raw` = phản hồi thô. */
export type KvgsSheetRecord = {
  id: string; orgId: string; dossierId: string; branch: number; status: KvgsFetchStatus; refId: string | null; receiptNo: string | null; receiptDate: string | null; errors: GatewayError[] | null;
  sheet: KvgsSheet | null; raw: unknown; requestedBy: string; requestedAt: Date; fetchedAt: Date | null; createdAt: Date; updatedAt: Date;
};

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
    /** Thông điệp IN thành công của các nghiệp vụ `operations` từ `since` (cả org, một truy vấn) – đối soát lượt. */
    listSucceededSince(orgId: string, operations: string[], since: Date): Promise<MessageRow[]>;
    insert(row: MessageRow): Promise<void>;
  };
  results: {
    /** `branch` vắng = nhánh 1. */
    get(orgId: string, dossierId: string, branch?: number): Promise<ResultRow | null>;
    /** Mọi nhánh của hồ sơ, sắp theo nhánh. */
    listForDossier(orgId: string, dossierId: string): Promise<ResultRow[]>;
    listForOrg(orgId: string): Promise<ResultRow[]>;
    /** Tờ khai nhánh đã có số tờ khai của org (cập nhật từ `updatedSince` nếu có) – đếm lượt đang giữ / đối soát lượt (ADR 0011). */
    listNumbered(orgId: string, updatedSince?: Date): Promise<ResultRow[]>;
    /** Tờ khai nhánh có số tờ khai (hoặc mã tham chiếu FPT) này – áp thông điệp Hải quan trả sau. */
    findByNumber(orgId: string, no: string): Promise<ResultRow | null>;
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
    /** Bản khai bổ sung mang số tờ khai bổ sung TK_SYN này (header hoặc kết quả AMA). */
    findBySyn(orgId: string, syn: string): Promise<PostAmendmentRow | null>;
    insert(row: PostAmendmentRow): Promise<void>;
    update(row: PostAmendmentRow): Promise<void>;
  };
  /** Hộp thư VNACCSREP: ghi cả lô ngay khi lấy (trùng dedupKey bỏ qua), áp dần thông điệp PENDING. */
  inbox: {
    insertMany(rows: InboxRow[]): Promise<void>;
    /** PENDING cũ trước, tối đa `limit`. */
    listPending(orgId: string, limit: number): Promise<InboxRow[]>;
    update(orgId: string, id: string, patch: Partial<Pick<InboxRow, "status" | "attempts" | "appliedAt">>): Promise<void>;
    /** Giữ thông điệp để áp: PENDING → APPLIED có điều kiện (khóa dòng). false = job khác đã áp – bỏ qua, không ghi/báo trùng. */
    claim(orgId: string, id: string, at: Date): Promise<boolean>;
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
  /** Danh sách container qua KVGS: `latest` = lần khai (attempt) lớn nhất của (hồ sơ, nhánh). */
  containerLists: {
    latest(orgId: string, dossierId: string, branch: number): Promise<ContainerListRecord | null>;
    get(orgId: string, id: string): Promise<ContainerListRecord | null>;
    insert(row: ContainerListRecord): Promise<void>;
    update(orgId: string, id: string, patch: Partial<Omit<ContainerListRecord, "id" | "orgId" | "dossierId" | "branch" | "attempt" | "createdAt">>): Promise<void>;
  };
  /** Bảng kê KVGS lấy từ Hải quan: `latest` = lần yêu cầu mới nhất, `latestOk` = lần ACCEPTED mới nhất (bản in dùng bản này). */
  kvgs: {
    latest(orgId: string, dossierId: string, branch: number): Promise<KvgsSheetRecord | null>;
    latestOk(orgId: string, dossierId: string, branch: number): Promise<KvgsSheetRecord | null>;
    get(orgId: string, id: string): Promise<KvgsSheetRecord | null>;
    insert(row: KvgsSheetRecord): Promise<void>;
    update(orgId: string, id: string, patch: Partial<Omit<KvgsSheetRecord, "id" | "orgId" | "dossierId" | "branch" | "createdAt">>): Promise<void>;
  };
}

/** Bản khai bổ sung trong DB (thời điểm là Date; DTO `PostAmendment` dùng chuỗi ISO). */
export type PostAmendmentRow = Omit<PostAmendment, "approvedAt" | "createdAt" | "updatedAt"> & { orgId: string; branch: number; approvedAt: Date | null; createdAt: Date; updatedAt: Date };

/** field_audit (append-only, bất biến 6) – composition root nối sang bảng của extraction. */
export interface CustomsAuditWriter {
  append(ctx: { orgId: OrgId; userId: UserId }, row: { dossierId: string; key: string; oldValue: string; newValue: string; source: "AMA_EDIT" | "CONT_LIST_EDIT" }): Promise<void>;
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
  /** Tra cứu: IID (nhập, tK_ICN) / IEX (xuất, tK_ECN). `direction` vắng → suy từ số tờ khai (3… = xuất). */
  queryStatus(orgId: string, externalId: string, dossierId: string, direction?: "NK" | "XK"): Promise<GatewayStatus>;
  /**
   * Thông điệp Hải quan trả sau (loại P – phân luồng, thông quan, kiểm tra thực tế, kết quả tờ khai bổ sung…) của tài khoản VNACCS doanh nghiệp
   * (FPT VNACCSREP). Coi là lấy một lần: người gọi lưu cả lô vào hộp thư (`inbox`) ngay, rồi mới áp. Gateway không hỗ trợ → không khai báo.
   */
  pullMessages?(orgId: string): Promise<GatewayMessage[]>;
  /**
   * Nghiệp vụ còn lại của luồng: gọi sửa (IDB/IDD/AMB, EDB/EDD), khai tạm sửa đổi (IDA01/EDA01, AMA), khai chính thức sửa đổi (IDE/EDE, AMC),
   * container qua khu vực giám sát (CONT), lệ phí cảng biển (PORT_FEE). Gateway chưa hỗ trợ nghiệp vụ → ném DomainError NOT_SUPPORTED.
   */
  send(orgId: string, msg: { op: CustomsOperation; externalId: string; dossierId: string; request?: unknown }, idempotencyKey: string): Promise<GatewaySendResult>;
  /** Danh sách container qua khu vực giám sát, bước 1 (V5ContainerReq): trả REF_ID hoặc lỗi Hải quan (ADR 0014). */
  sendContainerList(orgId: string, req: ContainerListGatewayRequest, idempotencyKey: string): Promise<{ refId?: string; errors?: GatewayError[] }>;
  /** Bước 2 (V5ContainerRes): hỏi kết quả theo REF_ID – body KHÔNG có dòng container; phản hồi không trả lại dòng (giữ sentRows ở DB). */
  containerListResult(orgId: string, req: Omit<ContainerListGatewayRequest, "rows"> & { refId: string }): Promise<RefResult>;
  /** Lấy bảng kê qua khu vực giám sát (KVGS), bước 1: trả REF_ID hoặc lỗi. */
  requestKvgs(orgId: string, req: KvgsGatewayRequest, idempotencyKey: string): Promise<{ refId?: string; errors?: GatewayError[] }>;
  /** Bước 2: hỏi phản hồi KVGS theo REF_ID; `sheet` đã chuẩn hóa, `raw` = phản hồi thô. Thiếu trường để in → ACCEPTED, không có `sheet`, `errors` = KVGS_RESPONSE_INCOMPLETE. */
  kvgsResult(orgId: string, req: KvgsGatewayRequest & { refId: string }): Promise<RefResult & { sheet?: KvgsSheet; raw?: unknown }>;
}
/** Kết quả hỏi theo REF_ID: `12` → ACCEPTED, `10` → REJECTED, `0`/`11` → PENDING. `receiptDate` YYYY-MM-DD. */
export type RefResult = { state: "PENDING" | "ACCEPTED" | "REJECTED"; receiptNo?: string; receiptDate?: string; errors?: GatewayError[] };
/** Danh sách container gửi cổng: ngày `registeredOn` YYYY-MM-DD (cổng đổi sang dd/MM/yyyy); `userId` = user id tài khoản VNACCS của doanh nghiệp (không gửi mật khẩu). `dossierId` chỉ để ghi nhật ký gỡ lỗi. */
export type ContainerListGatewayRequest = {
  dossierId?: string; declarationNo: string; registeredOn: string; typeCode: string; customsOffice: string; taxCode: string; companyName: string;
  agent?: { taxCode: string; name: string }; userId: string; rows: { billNo: string; containerNo: string; sealNo: string; note: string }[];
};
export type KvgsGatewayRequest = { dossierId?: string; declarationNo: string; registeredOn: string; customsOffice: string; taxCode: string; kind: "CONTAINER" | "CARGO" };
/** Thông điệp HYS gửi cổng (spec §2.2): thông tin chung của bộ + file (bytes đọc từ kho). */
export type HysGatewayRequest = { dossierId: string; customsOffice: string; processingUnit: string; procedureCode: string; phone: string | null; internalRef: string | null; note: string | null; files: { name: string; bytes: Buffer }[]; certificateId?: string };
export type HysGatewayResult = { receiptNo?: string; registeredOn?: string; errors?: GatewayError[] };
/** Một thông điệp Hải quan trả về (VNACCSREP): `declarationNo` = số tờ khai (hoặc số tờ khai bổ sung với AMA). */
export type GatewayMessage = {
  kind: "IDA" | "EDA" | "AMA"; code: string; name: string; declarationNo: string; at?: string; status?: GatewayStatus;
  /** Loại thông điệp FPT (objMsgResult.type): B = kèm EDI bản in, C = thông báo. */
  msgType?: string;
  /** Thông điệp loại B: EDI chuẩn Hải quan (base64) – lưu trong hộp thư để lưu trữ / in tờ khai (PrintEdiRef). */
  ediBase64?: string;
};
/** GỠ LỖI TẠM (FPT_DEBUG_TRACE): đọc lại body gửi / phản hồi thô của các lần gọi FPT. */
export interface FptTraceReader {
  list(orgId: string, dossierId: string): Promise<FptTraceEntry[]>;
}
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
  /** Điền (phân loại đính kèm TK_EA, số tiếp nhận HYS TK_EB) vào cặp 1.63/2.53 trống đầu tiên – hết cặp trống thì thay cặp `replaceSlot` (REPLACED) nếu có (DRAFT hoặc APPROVED, giữ nguyên trạng thái duyệt). Lỗi → LOCKED. */
  fillAttachment(
    ctx: { orgId: OrgId; userId: UserId },
    dossierId: string,
    input: { attachKind: string; receiptNo: string; note: string; replaceSlot?: 1 | 2 | 3 },
  ): Promise<{ outcome: "FILLED" | "ALREADY" | "FULL" | "REPLACED" | "LOCKED"; slot?: 1 | 2 | 3; replaced?: { code: string; receipt: string }; afterApproval: boolean }>;
  /** Hồ sơ có tờ khai APPROVED/SUBMITTED (màn Khai báo Hải quan). */
  listForCustoms(orgId: string): Promise<{ dossierId: string; status: DeclarationStatus; approvedAt: Date | null }[]>;
}

export type DossierBrief = { id: string; code: string; direction: "NK" | "XK"; transportMode: TransportMode; typeCode: string; partner: string; status: DossierStatus; step: StepId; declarationNo: string | null; updatedAt: Date; /** Người tạo hồ sơ (nguyên tắc 4 mắt). */ ownerId?: string };
export interface CustomsDossierPort {
  get(orgId: string, dossierId: string): Promise<DossierBrief | null>;
  /** Trạng thái nhiều hồ sơ một lần (đếm lượt đang giữ); thiếu → gọi `get` từng hồ sơ. */
  statuses?(orgId: string, dossierIds: string[]): Promise<Map<string, DossierStatus>>;
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
  /** Chứng từ đã đọc của hồ sơ → nguồn điền sẵn danh sách container (composition root nối từ extraction). Không nối → bảng điền sẵn rỗng. */
  containerSources?: (orgId: string, dossierId: string) => Promise<PrefillDoc[]>;
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
  /** User id tài khoản VNACCS của doanh nghiệp (USER_ID của danh sách container); chưa cấu hình → null. Không nối → rỗng (gateway giả). */
  vnaccsUserId?: (orgId: string) => Promise<string | null>;
  notify?: Notifier;
  /** Ghi chi phí Customs Hub vào usage_events (module billing; container nối). Không nối → không ghi. */
  usage?: ServiceUsageMeter;
  /** Lượt khai (ADR 0011, module billing; container nối): chặn khai tạm lần đầu khi thiếu lượt/hợp đồng hết hạn, ghi lượt khi IDC/EDC được chấp nhận. Không nối → không chặn, không ghi. */
  billing?: DeclarationBilling;
  /** GỠ LỖI TẠM (FPT_DEBUG_TRACE): có = đang bật ghi nhật ký API FPT. */
  fptTrace?: FptTraceReader;
  /** GỠ LỖI TẠM (FPT_DEBUG_TRACE): bật xem trước body gửi FPT (previewFptPayload). */
  fptDebug?: boolean;
  clock: Clock;
  idGen: IdGen;
};
