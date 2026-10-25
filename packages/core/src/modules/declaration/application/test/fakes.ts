import type { DocKind, HsAnswerRequest, HsCreateRequest, HsJob, HsJobItem, Shipment } from "@kb/contracts";
import type { ProgressEvent } from "../../../dossier/index.js";
import { HsApiError, type AuditWriter, type DossierInfo, type DossierPort, type HsClassificationService, type OrgInfo, type OrgReader, type ShipmentReader, type UserNames, type ValidationReader } from "../ports.js";

/**
 * HSCodePro giả cho test use case. Mặc định: lượt hoàn tất ngay theo `rules` (khớp mô tả).
 * `onGet(jobId)` cho phép kịch bản trạng thái theo từng lần hỏi; ghi lại create/answer/cancel.
 */
export class ScriptedHs implements HsClassificationService {
  readonly name = "fake-hs";
  calls = 0;
  failOn: string | null = null;
  created: HsCreateRequest[] = [];
  answers: { jobId: string; itemId: string; body: HsAnswerRequest }[] = [];
  cancelled: string[] = [];
  answerError: Error | null = null;
  jobs = new Map<string, HsJob>();
  onGet: ((job: HsJob) => HsJob) | null = null;
  private seq = 0;
  constructor(private rules: { match: RegExp; code: string; description: string; confidence: number; importRate?: number; basis?: "MFN" | "FTA"; agreement?: string; vat?: number; alternatives?: { code: string; importRate: number; whyNot: string }[] }[]) {}
  async create(req: HsCreateRequest): Promise<HsJob> {
    this.created.push(req);
    if (this.failOn && req.items.some((i) => i.description.includes(this.failOn!))) throw new HsApiError(503, "HTTP_503", "classifier 503");
    const id = `hsjob_${++this.seq}`;
    const tax = (rate: number, basis: "MFN" | "FTA" = "MFN", agreement: string | null = null, vat = 10) => ({ import: { rate, basis, agreement }, vat: { rate: vat, note: null }, source_date: req.import_date ?? "" });
    const items: HsJobItem[] = req.items.map((it, i) => {
      this.calls++;
      const r = this.rules.find((x) => x.match.test(it.description));
      const base = { id: `${id}_it${i + 1}`, line_no: it.line_no, question: null };
      if (!r) return { ...base, status: "failed" as const, result: null, error: { code: "NO_SUGGESTION", message: "Không có gợi ý" } };
      return { ...base, status: "completed" as const, error: null, result: {
        hs_code: r.code.replace(/\D/g, ""), hs_description: r.description, confidence: Math.round(r.confidence * 100), reasoning: "test", legal_basis: [], warnings: [], tax: tax(r.importRate ?? 5, r.basis, r.agreement ?? null, r.vat),
        alternatives: (r.alternatives ?? []).map((a) => ({ hs_code: a.code.replace(/\D/g, ""), hs_description: "", confidence: 10, why_not: a.whyNot, tax: tax(a.importRate) })),
      } };
    });
    const job: HsJob = { id, external_ref: req.external_ref ?? null, import_date: req.import_date ?? "", status: "completed", created_at: "2026-10-14T03:00:00.000Z", items };
    this.jobs.set(id, job);
    return structuredClone(job);
  }
  async get(jobId: string): Promise<HsJob> {
    const j = this.jobs.get(jobId);
    if (!j) throw new HsApiError(404, "NOT_FOUND", "không có lượt");
    const next = this.onGet ? this.onGet(structuredClone(j)) : j;
    this.jobs.set(jobId, next);
    return structuredClone(next);
  }
  async answer(jobId: string, itemId: string, body: HsAnswerRequest) {
    if (this.answerError) throw this.answerError;
    this.answers.push({ jobId, itemId, body });
  }
  async cancel(jobId: string) {
    this.cancelled.push(jobId);
  }
}

export class FakeShipments implements ShipmentReader {
  constructor(public byDossier: Record<string, Shipment>, public raws: Record<string, { documentId: string; kind: DocKind; raw: unknown }[]> = {}) {}
  async latest(_orgId: string, dossierId: string) {
    return this.byDossier[dossierId] ?? null;
  }
  async extractions(_orgId: string, dossierId: string) {
    return this.raws[dossierId] ?? [];
  }
}

export class FakeDossiers implements DossierPort {
  readonly events: ProgressEvent[] = [];
  readonly files = new Map<string, Buffer>();
  constructor(public rows: (DossierInfo & { orgId: string; suspectFields?: number })[], public docs: Record<string, { id: string; kind: DocKind; fileName: string }[]> = {}) {}
  async get(orgId: string, id: string) {
    const d = this.rows.find((x) => x.id === id && x.orgId === orgId);
    return d ? { ...d } : null;
  }
  async update(orgId: string, id: string, patch: { status?: DossierInfo["status"]; step?: DossierInfo["step"]; suspectFields?: number }) {
    const d = this.rows.find((x) => x.id === id && x.orgId === orgId);
    if (d) Object.assign(d, patch);
  }
  async documents(_orgId: string, dossierId: string) {
    return this.docs[dossierId] ?? [];
  }
  async publish(_orgId: string, _dossierId: string, event: ProgressEvent) {
    this.events.push(event);
  }
  async putFile(key: string, body: Buffer) {
    this.files.set(key, body);
  }
}

export class RecordingAudit implements AuditWriter {
  readonly rows: { orgId: string; dossierId: string; key: string; oldValue: string; newValue: string; source: string }[] = [];
  async append(ctx: { orgId: string }, row: { dossierId: string; key: string; oldValue: string; newValue: string; source: "HS_CONFIRM" | "DECL_EDIT" | "AMA_EDIT" | "CHARGE_EDIT" }) {
    this.rows.push({ orgId: ctx.orgId, ...row });
  }
}

export const fakeOrg = (info: OrgInfo): OrgReader => ({ get: async () => info });
export const fakeValidation = (fails: Record<string, number> = {}): ValidationReader => ({ blockerFails: async (_o, d) => fails[d] ?? 0 });
export const fakeUsers: UserNames = { names: async (_o, ids) => new Map(ids.map((id) => [id, `Tên ${id}`])) };
