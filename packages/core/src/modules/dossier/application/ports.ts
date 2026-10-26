import type { OrgAuditWriter } from "../../../shared/audit.js";
import type { CustomsSummary, DocKind, EditSheet, DocumentStatus, DossierStatus, PartyClass, StepId, TransportMode } from "@kb/contracts";
import type { Clock } from "../../../shared/clock.js";
import type { IdGen, OrgId, UserId } from "../../../shared/ids.js";
import type { JobQueue } from "../../../shared/queue.js";

export type DossierRow = {
  id: string; orgId: string; code: string; direction: "NK" | "XK"; typeCode: string; partner: string; customsOfficeCode: string; customsOfficeName: string;
  skillSetId: string; status: DossierStatus; step: StepId; dueDate: string; ownerId: string; note: string | null; invoiceValue: string; currency: string;
  incoterm: string; transportMode: TransportMode; partyClass: PartyClass; billNo: string; suspectFields: number; declarationNo: string | null; channel: string | null;
  createdAt: Date; updatedAt: Date;
};
export type DocumentRow = {
  id: string; orgId: string; dossierId: string; kind: DocKind; kindSource: "AI" | "USER" | "FILENAME"; fileName: string; mime: string; sizeBytes: number;
  pages: number; status: DocumentStatus; error: string | null; storageKey: string; sha256: string; uploadedBy: string; createdAt: Date; updatedAt: Date;
};
export type DossierListFilter = { direction?: string | undefined; status?: string | undefined; step?: string | undefined; q?: string | undefined };
export type ProgressRow = { id: string; orgId: string; dossierId: string; jobKind: string; jobId: string; status: string; progress: number; message: string; updatedAt: Date };

export interface DossierRepos {
  dossiers: {
    /** Mới nhất trước; `page` bắt buộc để không bao giờ kéo cả bảng. */
    list(orgId: string, f: DossierListFilter, page: { limit: number; offset: number }): Promise<DossierRow[]>;
    count(orgId: string, f: DossierListFilter): Promise<number>;
    get(orgId: string, id: string): Promise<DossierRow | null>;
    codesInMonth(orgId: string, direction: string, prefix: string): Promise<string[]>;
    insert(row: DossierRow): Promise<void>;
    update(orgId: string, id: string, patch: Partial<Omit<DossierRow, "id" | "orgId" | "createdAt">>): Promise<void>;
    /** Số hồ sơ tạo trong [from, to) và tổng trang chứng từ của chúng (mức dùng theo gói). */
    statsInRange(orgId: string, from: Date, to: Date): Promise<{ dossiers: number; pages: number }>;
    /** Xóa hẳn hồ sơ + chứng từ, tiến trình (bảng của module khác có FK cascade theo hồ sơ / chứng từ). */
    delete(orgId: string, id: string): Promise<void>;
  };
  documents: {
    list(orgId: string, dossierId: string): Promise<DocumentRow[]>;
    get(orgId: string, id: string): Promise<DocumentRow | null>;
    insert(row: DocumentRow): Promise<void>;
    update(orgId: string, id: string, patch: Partial<Pick<DocumentRow, "kind" | "kindSource" | "status" | "error" | "pages">>): Promise<void>;
    delete(orgId: string, id: string): Promise<void>;
    /** Chứng từ QUEUED không được cập nhật từ trước `before` – job có thể đã mất (job quét định kỳ). */
    listStuckQueued(orgId: string, before: Date): Promise<DocumentRow[]>;
  };
  progress: {
    upsert(row: ProgressRow): Promise<void>;
    list(orgId: string, dossierId: string): Promise<ProgressRow[]>;
  };
}

export interface DossierUow {
  asOrg<T>(ctx: { orgId: OrgId; userId: UserId }, fn: (r: DossierRepos) => Promise<T>): Promise<T>;
}

export interface ObjectStorage {
  put(key: string, body: Buffer, mime: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  presignGet(key: string, ttlSec: number): Promise<string>;
  /** File còn trong kho không (vd trước khi đưa link xem cho trình duyệt). */
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
}

export type ProgressEvent =
  | { type: "document.status"; documentId: string; status: DocumentStatus; error?: string }
  | { type: "fields.updated" }
  | { type: "agent.task"; taskId: string; status: string; progress: number; message: string }
  | { type: "customs.message" }
  | { type: "dossier.updated" };

export interface ProgressPublisher {
  publish(orgId: string, dossierId: string, event: ProgressEvent): Promise<void>;
}

export interface PdfInspector {
  /** { pages, encrypted }; ảnh → pages = 1. Ném FILE_INVALID (DomainError) nếu không đọc được. */
  inspect(bytes: Buffer, mime: string): Promise<{ pages: number; encrypted: boolean }>;
}

export interface QuotaChecker {
  /** DOSSIER: amount = số hồ sơ sẽ có trong tháng; PAGES: tổng trang hồ sơ sau khi thêm. */
  check(orgId: string, kind: "DOSSIER" | "PAGES", amount: number): Promise<boolean>;
}

export type UploadFile = { name: string; mime: string; bytes: Buffer };

export interface Unzipper {
  entries(bytes: Buffer): Promise<{ name: string; bytes: Buffer }[]>;
}

/** Tóm tắt Hải quan theo tờ khai nhánh ("Thông quan k/N") – composition root nối sang module integration (dossier không import integration). */
export interface DossierCustomsReader {
  /** Một lần gọi cho cả trang; hồ sơ chưa truyền không có mục. */
  summaries(ctx: { orgId: OrgId; userId: UserId }, dossierIds: string[]): Promise<Map<string, CustomsSummary>>;
}

export type DossierDeps = {
  uow: DossierUow;
  queue: JobQueue;
  storage: ObjectStorage;
  publisher: ProgressPublisher;
  pdf: PdfInspector;
  unzipper: Unzipper;
  quota: QuotaChecker;
  /** Nhật ký hoạt động doanh nghiệp (hủy hồ sơ); container nối từ identity. */
  audit?: OrgAuditWriter;
  /** Không nối → hồ sơ không có `customs`. */
  customs?: DossierCustomsReader;
  /** Các tờ khai nhánh đã lập ở Hải quan (module integration; container nối) – chặn đổi bộ chứng từ khi lô nhiều tờ còn tờ chưa gọi về. Không nối → không kiểm. */
  customsSheets?: (orgId: string, dossierId: string) => Promise<EditSheet[]>;
  /** Sau khi xóa hẳn hồ sơ (container nối: file hộp thư đã xếp vào hồ sơ trở lại "chờ xếp"). */
  onDeleted?: (ctx: { orgId: OrgId; userId: UserId }, dossierId: string) => Promise<void>;
  clock: Clock;
  idGen: IdGen;
};

/** Tên channel Redis pub/sub cho tiến trình một hồ sơ (web SSE subscribe, worker publish). */
export const dossierChannel = (orgId: string, dossierId: string) => `org:${orgId}:dossier:${dossierId}`;
