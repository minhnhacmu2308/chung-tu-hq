import type { ClassifyResult, CrossCheck, DocKind, DocumentStatus, DossierStatus, FieldGroup, FieldStatus, Region, Shipment } from "@kb/contracts";
import type { ZodType } from "zod";
import type { Clock } from "../../../shared/clock.js";
import type { Notifier } from "../../../shared/notifier.js";
import type { IdGen, OrgId, UserId } from "../../../shared/ids.js";
import type { ProgressEvent } from "../../dossier/index.js";

export type ExtractionRow = { id: string; orgId: string; documentId: string; kind: DocKind; skillVersionId: string | null; promptVersion: string; schemaVersion: string; pipelineVersion: string; model: string; idempotencyKey: string; raw: unknown; regions: Record<string, Region> | null; status: "DONE" | "ERROR"; error: string | null; usageEventId: string | null; createdAt: Date };
export type ShipmentRow = { id: string; orgId: string; dossierId: string; version: number; data: Shipment; schemaVersion: string; createdAt: Date };
export type FieldRow = { id: string; orgId: string; dossierId: string; documentId: string; group: FieldGroup; key: string; label: string; value: string; originalValue: string; status: FieldStatus; region: Region | null; note: string | null; shipmentPath: string | null; confirmedBy: string | null; confirmedAt: Date | null };
export type AuditRow = { id: string; orgId: string; dossierId: string; fieldId: string | null; documentId: string | null; key: string; oldValue: string; newValue: string; userId: string; source: "USER_EDIT" | "USER_CONFIRM" | "USER_REVERT" | "HS_CONFIRM" | "DECL_EDIT"; at: Date };

export interface ExtractionRepos {
  /** Khóa theo hồ sơ trong transaction (advisory lock) để hai job không gộp cùng lúc. */
  lockDossier(dossierId: string): Promise<void>;
  extractions: {
    findByKey(key: string): Promise<ExtractionRow | null>;
    listDone(dossierId: string, documentIds: string[]): Promise<ExtractionRow[]>;
    insert(row: ExtractionRow): Promise<void>;
    deleteForDocument(documentId: string): Promise<void>;
  };
  shipments: {
    latest(dossierId: string): Promise<ShipmentRow | null>;
    insert(row: ShipmentRow): Promise<void>;
    updateData(id: string, data: Shipment): Promise<void>;
  };
  fields: {
    list(dossierId: string): Promise<FieldRow[]>;
    get(id: string): Promise<FieldRow | null>;
    replaceForDossier(dossierId: string, rows: FieldRow[]): Promise<void>;
    update(id: string, patch: Partial<Pick<FieldRow, "value" | "status" | "note" | "confirmedBy" | "confirmedAt">>): Promise<void>;
  };
  audit: { insert(row: AuditRow): Promise<void> };
}

export interface ExtractionUow {
  asOrg<T>(ctx: { orgId: OrgId; userId: UserId }, fn: (r: ExtractionRepos) => Promise<T>): Promise<T>;
}

/** Thông tin chứng từ/hồ sơ do module dossier cung cấp (composition root nối), extraction không đọc bảng của dossier. */
export type DocumentInfo = { id: string; dossierId: string; kind: DocKind; kindSource: "AI" | "USER" | "FILENAME"; fileName: string; mime: string; pages: number; status: DocumentStatus; storageKey: string; sha256: string };
export interface DocumentsPort {
  get(orgId: string, documentId: string): Promise<DocumentInfo | null>;
  listForDossier(orgId: string, dossierId: string): Promise<DocumentInfo[]>;
  setStatus(orgId: string, documentId: string, status: DocumentStatus, patch?: { error?: string | null; kind?: DocKind; kindSource?: "AI" | "USER" | "FILENAME"; pages?: number }): Promise<void>;
  /** Sau khi gộp: số trường nghi ngờ; nếu mọi chứng từ đã DONE/ERROR → status NEEDS_REVIEW, step ocr. */
  afterMerge(orgId: string, dossierId: string, info: { suspectFields: number; invoiceValue?: string; currency?: string; billNo?: string; allDone: boolean }): Promise<void>;
  /** Hoàn tất đọc: step ocr / status NEEDS_REVIEW + suspectFields. */
  finishReading(orgId: string, dossierId: string, suspectFields: number): Promise<void>;
  readFile(storageKey: string): Promise<Buffer>;
  publish(orgId: string, dossierId: string, event: ProgressEvent): Promise<void>;
  orgInfo(orgId: string): Promise<{ taxCode: string; name: string; suspectThreshold: "STRICT" | "BALANCED" | "RELAXED" }>;
  /** Trạng thái hồ sơ (khóa sửa khi đã duyệt/truyền/hủy). */
  dossierStatus(orgId: string, dossierId: string): Promise<DossierStatus | null>;
}

export interface ValidationPort {
  run(orgId: string, dossierId: string, shipment: Shipment, version: number, org: { taxCode: string; name: string }): Promise<CrossCheck[]>;
}

export type AiUsage = { model: string; inputTokens: number; outputTokens: number };
export type AiFile = { bytes: Buffer; mime: string; pages: number; fileName: string };
export type ExtractPrompt = { kind: DocKind; skillHints: string[]; examples: unknown[]; supplierHint: string | null };
export interface AiProvider {
  readonly name: string;
  classifyPages(file: AiFile): Promise<{ result: ClassifyResult; usage: AiUsage }>;
  extract(file: AiFile, pages: number[], schema: ZodType, prompt: ExtractPrompt): Promise<{ result: unknown; regions: Record<string, Region> | null; usage: AiUsage }>;
}

/** Lỗi dữ liệu (file hỏng, model trả rác không parse được) – không retry; lỗi tạm (429/5xx/timeout) → throw Error thường. */
export class AiDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiDataError";
  }
}

export interface UsageRecorder {
  record(e: { orgId: string; dossierId: string | null; documentId: string | null; kind: "AI_CLASSIFY" | "AI_EXTRACT"; provider: string; model: string; inputTokens: number; outputTokens: number }): Promise<string>;
}

export interface SkillResolver {
  resolve(orgId: string, kind: DocKind, supplierHint: string | null): Promise<{ skillVersionId: string | null; fieldHints: string[]; examples: unknown[] }>;
}

export type ExtractionDeps = {
  uow: ExtractionUow;
  documents: DocumentsPort;
  validation: ValidationPort;
  ai: AiProvider;
  usage: UsageRecorder;
  skills: SkillResolver;
  notify?: Notifier;
  clock: Clock;
  idGen: IdGen;
};

export const PIPELINE_VERSION = "1";
export const PROMPT_VERSION = "1";
