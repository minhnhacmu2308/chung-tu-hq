import type { ClassifyResult, DocKind, Region, Shipment, CustomFieldDef } from "@kb/contracts";
import type { ZodType } from "zod";
import type { OrgId, UserId } from "../../../../shared/ids.js";
import type { ProgressEvent } from "../../../dossier/index.js";
import type { AiFile, AiProvider, AuditRow, DocumentInfo, DocumentsPort, ExtractionRepos, ExtractionRow, ExtractionUow, FieldRow, ShipmentRow, SkillResolver, UsageRecorder, ValidationPort } from "../ports.js";

/** UoW in-memory mô phỏng RLS theo org. */
export class InMemoryExtractionUow implements ExtractionUow {
  readonly data = { extractions: [] as ExtractionRow[], shipments: [] as ShipmentRow[], fields: [] as FieldRow[], audit: [] as AuditRow[] };
  asOrg<T>(ctx: { orgId: OrgId; userId: UserId }, fn: (r: ExtractionRepos) => Promise<T>) {
    const d = this.data;
    const org = ctx.orgId as string;
    const deny = (w: string): never => {
      throw new Error(`new row violates row-level security policy (${w})`);
    };
    const clone = <X>(x: X): X => structuredClone(x);
    return fn({
      lockDossier: async () => {},
      extractions: {
        findByKey: async (k) => clone(d.extractions.find((x) => x.idempotencyKey === k && x.orgId === org) ?? null),
        listDone: async (dossierId, ids) => clone(d.extractions.filter((x) => x.orgId === org && ids.includes(x.documentId) && x.status === "DONE")),
        insert: async (row) => {
          if (row.orgId !== org) deny("extractions");
          if (d.extractions.some((x) => x.idempotencyKey === row.idempotencyKey)) throw new Error("duplicate key value violates unique constraint extractions_idem_uq");
          d.extractions.push(clone(row));
        },
        deleteForDocument: async (id) => void (d.extractions = d.extractions.filter((x) => !(x.documentId === id && x.orgId === org))),
      },
      shipments: {
        latest: async (dossierId) => clone(d.shipments.filter((x) => x.orgId === org && x.dossierId === dossierId).sort((a, b) => b.version - a.version)[0] ?? null),
        insert: async (row) => void (row.orgId === org ? d.shipments.push(clone(row)) : deny("shipments")),
        updateData: async (id, data) => {
          const s = d.shipments.find((x) => x.id === id && x.orgId === org);
          if (s) s.data = clone(data);
        },
      },
      fields: {
        list: async (dossierId) => clone(d.fields.filter((x) => x.orgId === org && x.dossierId === dossierId)),
        get: async (id) => clone(d.fields.find((x) => x.id === id && x.orgId === org) ?? null),
        replaceForDossier: async (dossierId, rows) => {
          if (rows.some((r) => r.orgId !== org)) deny("extracted_fields");
          d.fields = d.fields.filter((x) => !(x.dossierId === dossierId && x.orgId === org)).concat(rows.map(clone));
        },
        update: async (id, patch) => {
          const f = d.fields.find((x) => x.id === id && x.orgId === org);
          if (f) Object.assign(f, patch);
        },
      },
      audit: { insert: async (row) => void (row.orgId === org ? d.audit.push(clone(row)) : deny("field_audit")) },
    });
  }
}

/** Chứng từ/hồ sơ giả cho pipeline; ghi lại thay đổi trạng thái. */
export class FakeDocuments implements DocumentsPort {
  docs: (DocumentInfo & { orgId: string; error?: string | null })[] = [];
  readonly files = new Map<string, Buffer>();
  readonly dossierUpdates: unknown[] = [];
  readonly events: ProgressEvent[] = [];
  threshold: "STRICT" | "BALANCED" | "RELAXED" = "BALANCED";
  dossierStatusValue: "DRAFT" | "PROCESSING" | "NEEDS_REVIEW" | "APPROVED" | "SUBMITTED" | "CLEARED" | "CANCELLED" = "PROCESSING";
  async dossierStatus() {
    return this.dossierStatusValue;
  }
  async get(orgId: string, id: string) {
    return this.docs.find((x) => x.id === id && x.orgId === orgId) ?? null;
  }
  async listForDossier(orgId: string, dossierId: string) {
    return this.docs.filter((x) => x.dossierId === dossierId && x.orgId === orgId);
  }
  async setStatus(orgId: string, id: string, status: DocumentInfo["status"], patch?: { error?: string | null; kind?: DocKind; kindSource?: "AI" | "USER" | "FILENAME"; pages?: number }) {
    const d = this.docs.find((x) => x.id === id && x.orgId === orgId);
    if (d) Object.assign(d, { status }, patch ?? {});
  }
  async afterMerge(_o: string, dossierId: string, info: unknown) {
    this.dossierUpdates.push({ dossierId, ...(info as object) });
  }
  async finishReading(_o: string, dossierId: string, suspectFields: number) {
    this.dossierUpdates.push({ dossierId, finished: true, suspectFields });
  }
  async readFile(key: string) {
    const b = this.files.get(key);
    if (!b) throw new Error(`no file ${key}`);
    return b;
  }
  async publish(_o: string, _d: string, event: ProgressEvent) {
    this.events.push(event);
  }
  async orgInfo() {
    return { taxCode: "0316789012", name: "CÔNG TY TNHH THIẾT BỊ CÔNG NGHIỆP AN PHÁT", suspectThreshold: this.threshold };
  }
}

export class RecordingUsage implements UsageRecorder {
  readonly events: unknown[] = [];
  async record(e: unknown) {
    this.events.push(e);
    return `use_${this.events.length}`;
  }
}

export class NoSkills implements SkillResolver {
  async resolve() {
    return { skillVersionId: null, fieldHints: [], examples: [], customFields: [] };
  }
}

/** Skill cố định cho test: một phiên bản có trường bổ sung riêng. */
export class FixedSkills implements SkillResolver {
  constructor(private customFields: CustomFieldDef[]) {}
  async resolve() {
    return { skillVersionId: "skv_test", fieldHints: [], examples: [], customFields: this.customFields };
  }
}

export class NoValidation implements ValidationPort {
  readonly runs: { dossierId: string; version: number; shipment: Shipment }[] = [];
  async run(_o: string, dossierId: string, shipment: Shipment, version: number) {
    this.runs.push({ dossierId, version, shipment });
    return [];
  }
}

/** AI giả cho test: dữ liệu theo loại, đếm số lần gọi; `failWith` để mô phỏng lỗi. */
export class ScriptedAi implements AiProvider {
  readonly name = "scripted";
  calls = { classify: 0, extract: 0 };
  failWith: Error | null = null;
  constructor(private byKind: Partial<Record<DocKind, unknown>>, private classify: ClassifyResult | null = null, private regions: Record<string, Region> | null = null) {}
  async classifyPages(file: AiFile) {
    this.calls.classify++;
    if (this.failWith) throw this.failWith;
    return { result: this.classify ?? { documents: [{ kind: "OTHER", pages: Array.from({ length: file.pages }, (_, i) => i + 1), isDuplicateCopy: false, supplierHint: null }] }, usage: { model: "fake", inputTokens: 10, outputTokens: 5 } };
  }
  /** Schema nhận ở lần extract gần nhất (kiểm trường bổ sung). */
  lastSchema: ZodType | null = null;
  async extract(_file: AiFile, _pages: number[], schema: ZodType, prompt: { kind: DocKind }) {
    this.calls.extract++;
    this.lastSchema = schema;
    if (this.failWith) throw this.failWith;
    return { result: this.byKind[prompt.kind] ?? { title: "x", summary: "y", uncertainties: [] }, regions: this.regions, usage: { model: "fake", inputTokens: 100, outputTokens: 50 } };
  }
}
