import type { DocKind, DocumentStatus, DossierStatus, StepId } from "@kb/contracts";
import type { Clock } from "../../../shared/clock.js";
import type { IdGen, OrgId, UserId } from "../../../shared/ids.js";
import type { JobQueue } from "../../../shared/queue.js";

export type DossierRow = {
  id: string; orgId: string; code: string; direction: "NK" | "XK"; typeCode: string; partner: string; customsOfficeCode: string; customsOfficeName: string;
  skillSetId: string; status: DossierStatus; step: StepId; dueDate: string; ownerId: string; note: string | null; invoiceValue: string; currency: string;
  incoterm: string; transportMode: "SEA" | "AIR" | "ROAD"; billNo: string; suspectFields: number; declarationNo: string | null; channel: string | null;
  createdAt: Date; updatedAt: Date;
};
export type DocumentRow = {
  id: string; orgId: string; dossierId: string; kind: DocKind; kindSource: "AI" | "USER" | "FILENAME"; fileName: string; mime: string; sizeBytes: number;
  pages: number; status: DocumentStatus; error: string | null; storageKey: string; sha256: string; uploadedBy: string; createdAt: Date; updatedAt: Date;
};
export type ProgressRow = { id: string; orgId: string; dossierId: string; jobKind: string; jobId: string; status: string; progress: number; message: string; updatedAt: Date };

export interface DossierRepos {
  dossiers: {
    list(orgId: string, f: { direction?: string | undefined; status?: string | undefined; step?: string | undefined }): Promise<DossierRow[]>;
    get(orgId: string, id: string): Promise<DossierRow | null>;
    codesInMonth(orgId: string, direction: string, prefix: string): Promise<string[]>;
    insert(row: DossierRow): Promise<void>;
    update(id: string, patch: Partial<Omit<DossierRow, "id" | "orgId" | "createdAt">>): Promise<void>;
    /** Số hồ sơ tạo trong [from, to) và tổng trang chứng từ của chúng (mức dùng theo gói). */
    statsInRange(orgId: string, from: Date, to: Date): Promise<{ dossiers: number; pages: number }>;
  };
  documents: {
    list(orgId: string, dossierId: string): Promise<DocumentRow[]>;
    get(orgId: string, id: string): Promise<DocumentRow | null>;
    insert(row: DocumentRow): Promise<void>;
    update(id: string, patch: Partial<Pick<DocumentRow, "kind" | "kindSource" | "status" | "error" | "pages">>): Promise<void>;
    delete(id: string): Promise<void>;
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

export type DossierDeps = {
  uow: DossierUow;
  queue: JobQueue;
  storage: ObjectStorage;
  publisher: ProgressPublisher;
  pdf: PdfInspector;
  unzipper: Unzipper;
  quota: QuotaChecker;
  clock: Clock;
  idGen: IdGen;
};

/** Tên channel Redis pub/sub cho tiến trình một hồ sơ (web SSE subscribe, worker publish). */
export const dossierChannel = (orgId: string, dossierId: string) => `org:${orgId}:dossier:${dossierId}`;
