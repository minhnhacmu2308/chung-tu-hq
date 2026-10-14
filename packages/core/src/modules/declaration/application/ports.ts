import type { AgentMode, AgentTaskId, AgentTaskStatus, DeclarationStatus, DocKind, DossierStatus, Shipment, StepId } from "@kb/contracts";
import type { Clock } from "../../../shared/clock.js";
import type { Notifier } from "../../../shared/notifier.js";
import type { IdGen, OrgId, UserId } from "../../../shared/ids.js";
import type { JobQueue } from "../../../shared/queue.js";
import type { ProgressEvent } from "../../dossier/index.js";
import type { Adjustment } from "../domain/valuation.js";
import type { DossierInfo, HsCatalogRow, OrgInfo, StoredField } from "../domain/types.js";

export type { DossierInfo, HsCatalogRow, OrgInfo, StoredField };

export type LineItemRow = {
  id: string; orgId: string; dossierId: string; lineNo: number; description: string; quantity: string; unit: string; unitPrice: string; amount: string; origin: string;
  invoiceHsCode: string | null; hsSuggested: string | null; hsConfidence: number | null; hsConfirmed: string | null; hsConfirmedBy: string | null; hsConfirmedAt: Date | null;
  importDutyRate: string | null; vatRate: string | null; policyNote: string | null; createdAt: Date; updatedAt: Date;
};
export type HsSuggestionRow = { id: string; orgId: string; lineItemId: string; code: string; description: string; confidence: number; rates: { mfn: string; vat: string } | null; source: string; createdAt: Date };
export type DeclarationRow = {
  id: string; orgId: string; dossierId: string; kind: "IDA" | "EDA"; version: number; status: DeclarationStatus; fields: Record<string, StoredField>;
  exchangeRate: string; exchangeRateDate: string; customsValueVnd: string; valueAdjustments: Adjustment[]; estImportDutyVnd: string; estVatVnd: string;
  approvedBy: string | null; approvedAt: Date | null; createdAt: Date; updatedAt: Date;
};
export type AgentTask = { id: AgentTaskId; status: AgentTaskStatus; progress: number; message: string };
export type AgentLog = { at: string; text: string; tone: "info" | "success" | "warning" };
export type AgentRunRow = { id: string; orgId: string; dossierId: string; mode: AgentMode; status: "RUNNING" | "DONE" | "ERROR" | "CANCELLED"; tasks: AgentTask[]; log: AgentLog[]; startedBy: string; startedAt: Date; finishedAt: Date | null };

export interface DeclarationRepos {
  lineItems: {
    list(orgId: string, dossierId: string): Promise<LineItemRow[]>;
    get(orgId: string, id: string): Promise<LineItemRow | null>;
    /** Ghi dòng hàng theo (dossier, lineNo): dòng đã có giữ HS đã xác nhận; dòng thừa bị xóa. */
    upsertForDossier(dossierId: string, rows: LineItemRow[]): Promise<LineItemRow[]>;
    update(id: string, patch: Partial<Pick<LineItemRow, "hsSuggested" | "hsConfidence" | "hsConfirmed" | "hsConfirmedBy" | "hsConfirmedAt" | "importDutyRate" | "vatRate" | "policyNote" | "updatedAt">>): Promise<void>;
  };
  suggestions: {
    listForItems(lineItemIds: string[]): Promise<HsSuggestionRow[]>;
    replaceForItem(lineItemId: string, rows: HsSuggestionRow[]): Promise<void>;
  };
  declarations: {
    latest(orgId: string, dossierId: string): Promise<DeclarationRow | null>;
    /** Tờ khai mới nhất của mỗi hồ sơ có status trong danh sách (màn Khai báo Hải quan). */
    listLatestByStatus(orgId: string, statuses: DeclarationStatus[]): Promise<DeclarationRow[]>;
    insert(row: DeclarationRow): Promise<void>;
    update(id: string, patch: Partial<Pick<DeclarationRow, "status" | "fields" | "approvedBy" | "approvedAt" | "updatedAt" | "exchangeRate" | "exchangeRateDate" | "customsValueVnd" | "valueAdjustments" | "estImportDutyVnd" | "estVatVnd">>): Promise<void>;
  };
  agentRuns: {
    latest(orgId: string, dossierId: string): Promise<AgentRunRow | null>;
    get(orgId: string, id: string): Promise<AgentRunRow | null>;
    insert(row: AgentRunRow): Promise<void>;
    update(id: string, patch: Partial<Pick<AgentRunRow, "status" | "tasks" | "log" | "finishedAt">>): Promise<void>;
  };
  catalogHs: {
    search(q: string | undefined, limit: number): Promise<HsCatalogRow[]>;
    get(code: string): Promise<HsCatalogRow | null>;
    all(): Promise<HsCatalogRow[]>;
  };
  exchangeRates: {
    /** Tỷ giá gần nhất ≤ ngày (VND / 1 đơn vị). */
    latest(currency: string, date: string): Promise<{ rate: string; date: string } | null>;
  };
}

export interface DeclarationUow {
  asOrg<T>(ctx: { orgId: OrgId; userId: UserId }, fn: (r: DeclarationRepos) => Promise<T>): Promise<T>;
}

/** Gợi ý mã HS (hscodepro hoặc giả). Lỗi tạm → throw; không có gợi ý → []. */
export interface HsClassifier {
  readonly name: string;
  classify(input: { description: string; invoiceHs: string | null; origin: string }): Promise<{ code: string; description: string; confidence: number }[]>;
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
  append(ctx: { orgId: OrgId; userId: UserId }, row: { dossierId: string; key: string; oldValue: string; newValue: string; source: "HS_CONFIRM" | "DECL_EDIT" }): Promise<void>;
}

export interface UserNames {
  names(orgId: string, userIds: string[]): Promise<Map<string, string>>;
}

export type DeclarationDeps = {
  uow: DeclarationUow;
  queue: JobQueue;
  hs: HsClassifier;
  shipments: ShipmentReader;
  dossiers: DossierPort;
  validation: ValidationReader;
  org: OrgReader;
  audit: AuditWriter;
  users: UserNames;
  /** Thông báo trong app (tùy chọn; container nối). */
  notify?: Notifier;
  clock: Clock;
  idGen: IdGen;
};
