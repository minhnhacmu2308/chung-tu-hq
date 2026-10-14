import type { DocKind, Shipment } from "@kb/contracts";
import type { ProgressEvent } from "../../../dossier/index.js";
import type { AuditWriter, DossierInfo, DossierPort, HsClassifier, OrgInfo, OrgReader, ShipmentReader, UserNames, ValidationReader } from "../ports.js";

/** Classifier giả: gợi ý theo từ khóa cấu hình; mô tả không khớp → []. `failOn` ném lỗi tạm (test retry). */
export class ScriptedHs implements HsClassifier {
  readonly name = "fake-hs";
  calls = 0;
  failOn: string | null = null;
  constructor(private rules: { match: RegExp; code: string; description: string; confidence: number }[]) {}
  async classify(input: { description: string; invoiceHs: string | null; origin: string }) {
    this.calls++;
    if (this.failOn && input.description.includes(this.failOn)) throw new Error("classifier 503");
    return this.rules.filter((r) => r.match.test(input.description)).map(({ code, description, confidence }) => ({ code, description, confidence }));
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
  async append(ctx: { orgId: string }, row: { dossierId: string; key: string; oldValue: string; newValue: string; source: "HS_CONFIRM" | "DECL_EDIT" }) {
    this.rows.push({ orgId: ctx.orgId, ...row });
  }
}

export const fakeOrg = (info: OrgInfo): OrgReader => ({ get: async () => info });
export const fakeValidation = (fails: Record<string, number> = {}): ValidationReader => ({ blockerFails: async (_o, d) => fails[d] ?? 0 });
export const fakeUsers: UserNames = { names: async (_o, ids) => new Map(ids.map((id) => [id, `Tên ${id}`])) };
