// Tờ khai mẫu của mục Dạy khai báo: upload → job AI đọc tờ khai → ghép hồ sơ cùng lô → so với tờ khai nháp → rút bài học (chờ duyệt).
import {
  CUSTOMS_DECLARATION_HINTS, CustomsDeclarationExtractionSchema, fillMissingNullable, type CustomsDeclarationExtraction, type TeachComparison, type TeachSample,
} from "@kb/contracts";
import { requireRole, type Ctx } from "../../../shared/ctx.js";
import { domainError } from "../../../shared/errors.js";
import { asOrgId, asUserId } from "../../../shared/ids.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { AiDataError, type AiProvider } from "../../extraction/index.js";
import type { UploadFile } from "../../dossier/index.js";
import { compareFields, compareLines, pairLines, score, type DocData, type DraftField, type DraftLine } from "../domain/compare.js";
import { applyObservation, lessonContext, lessonIdentity, observe, type Observation } from "../domain/lessons.js";
import type { StoredLesson, TeachDeps, TeachRepos, TeachSampleRow } from "./ports.js";

const ALLOWED = new Map([["application/pdf", "pdf"], ["image/png", "png"], ["image/jpeg", "jpg"]]);
const MAX_BYTES = 20 * 1024 * 1024;
const MAX_FILES = 50;

export function toTeachSample(r: TeachSampleRow): TeachSample {
  return {
    id: r.id, fileName: r.fileName, status: r.status, declarationNo: r.declarationNo, dossierId: r.dossierId, dossierCode: r.dossierCode,
    matched: r.matched, total: r.total, lessons: r.lessons, error: r.error, createdAt: r.createdAt.toISOString(),
  };
}

/** Upload tờ khai đã thông quan (PDF scan/PDF/ảnh), nhiều file một lần; mỗi file một job đọc. */
export async function uploadTeachSamples(deps: TeachDeps, ctx: Ctx, files: UploadFile[]): Promise<Result<TeachSample[]>> {
  const allowed = requireRole(ctx, "DECLARANT", "APPROVER", "ADMIN");
  if (!allowed.ok) return allowed;
  if (!files.length) return err(domainError("FILE_INVALID", "Chưa chọn file nào"));
  if (files.length > MAX_FILES) return err(domainError("FILE_INVALID", `Tối đa ${MAX_FILES} file một lần`));
  const checked: { f: UploadFile; pages: number; ext: string }[] = [];
  for (const f of files) {
    const ext = ALLOWED.get(f.mime);
    if (!ext) return err(domainError("FILE_INVALID", `${f.name}: chỉ nhận PDF, JPG, PNG`));
    if (f.bytes.length > MAX_BYTES) return err(domainError("FILE_TOO_LARGE", `${f.name}: vượt 20 MB`));
    const info = await deps.pdf.inspect(f.bytes, f.mime).catch(() => null);
    if (!info) return err(domainError("FILE_INVALID", `${f.name}: không đọc được file`));
    if (info.encrypted) return err(domainError("FILE_INVALID", `${f.name}: file có mật khẩu`));
    checked.push({ f, pages: info.pages, ext });
  }
  const now = deps.clock.now();
  const rows: TeachSampleRow[] = [];
  for (const { f, pages, ext } of checked) {
    const id = deps.idGen.next("tks");
    const storageKey = `orgs/${ctx.orgId}/teach/${id}.${ext}`;
    await deps.storage.put(storageKey, f.bytes, f.mime);
    rows.push({
      id, orgId: ctx.orgId, storageKey, fileName: f.name, pages, sizeBytes: f.bytes.length, status: "UPLOADED", declarationNo: null, read: null, dossierId: null, dossierCode: null,
      comparison: null, matched: null, total: null, lessons: 0, error: null, uploadedBy: ctx.userId, createdAt: now, updatedAt: now,
    });
  }
  await deps.uow.asOrg(ctx, async (r) => { for (const row of rows) await r.samples.insert(row); });
  for (const row of rows) await deps.queue.enqueue("teach-sample-read", { orgId: ctx.orgId, userId: ctx.userId, sampleId: row.id }, { jobId: `teach-read:${row.id}` });
  return ok(rows.map(toTeachSample));
}

const MODE_BY_PTVC: Record<string, string> = { "1": "AIR", "2": "SEA_CONTAINER", "3": "SEA_BULK", "4": "ROAD", "5": "RAIL", "6": "RIVER", "9": "OTHER" };
/** Mã hàng in trong mô tả tờ khai ("…, code: 2118.564-ACOT-96") – để tờ khai cũ không có hồ sơ vẫn dạy được mặt hàng theo mã hàng. */
export function partNoInDescription(description: string | null): string | null {
  const m = /(?:\bcode|m[ãa] h[àa]ng|model|p\/?n|part\s*no)\s*[:.]?\s*([A-Z0-9][A-Z0-9.\-/]{3,})/i.exec(description ?? "");
  return m ? m[1]!.replace(/[.,;]+$/, "") : null;
}

async function readDeclaration(ai: AiProvider, bytes: Buffer, s: TeachSampleRow) {
  const mime = s.storageKey.endsWith(".png") ? "image/png" : s.storageKey.endsWith(".jpg") ? "image/jpeg" : "application/pdf";
  const pages = Array.from({ length: Math.max(1, s.pages) }, (_, i) => i + 1);
  const res = await ai.extract({ bytes, mime, pages: s.pages, fileName: s.fileName }, pages, CustomsDeclarationExtractionSchema, {
    kind: "OTHER", title: "Đây là tờ khai hải quan đã thông quan (bản in VNACCS)", skillHints: CUSTOMS_DECLARATION_HINTS, examples: [], supplierHint: null, regions: false,
  });
  const parsed = CustomsDeclarationExtractionSchema.safeParse(fillMissingNullable(CustomsDeclarationExtractionSchema, res.result));
  return { usage: res.usage, read: parsed.success ? parsed.data : null };
}

/** Ghép hồ sơ cùng lô và so; không có hồ sơ (tờ khai cũ) → chỉ quan sát từ tờ khai (ngữ cảnh lấy trên tờ khai). */
async function analyse(deps: TeachDeps, orgId: string, read: CustomsDeclarationExtraction) {
  const found = read.SO_VD ? await deps.lots.findDossier(orgId, read.SO_VD) : null;
  const [draft, lot] = found ? await Promise.all([deps.lots.draft(orgId, found.id), deps.lots.lot(orgId, found.id)]) : [null, null];
  if (found && draft && lot) {
    const fields = compareFields(draft.fields, read, lot.docs);
    const pairs = pairLines(draft.lines, read.items);
    const lines = compareLines(pairs);
    const context = lessonContext({ sellerName: lot.sellerName, mode: lot.mode, office: lot.office, docs: lot.docs });
    return { dossier: found, comparison: { fields, lines }, ...score(fields, lines), observations: observe({ diffs: fields, draft: draft.fields, real: read, context, docs: lot.docs, lines: pairs }) };
  }
  const docs: DocData[] = [{ kind: "OTHER", data: read as unknown as Record<string, unknown> }];
  const context = lessonContext({ sellerName: read.NXK_TEN, mode: read.PTVC ? MODE_BY_PTVC[read.PTVC] ?? null : null, office: read.CQHQ, docs });
  const empty = (code: string): DraftField => ({ code, label: code, value: "", source: "DOSSIER" });
  const draftFields = ["KHO", "CANG_DO", "CANG_XEP", "PT_TT", "VBPQ", "CT_TG", "GHI_CHU"].map(empty);
  const lines: DraftLine[] = read.items.map((l) => ({ lineNo: l.lineNo, description: l.description ?? "", amount: String(l.invoiceValue ?? ""), hs: null, importRate: null, vatRate: null, partNo: partNoInDescription(l.description) }));
  const fields = compareFields(draftFields, read, []);
  const observations = observe({ diffs: fields, draft: draftFields, real: read, context, docs: [], lines: read.items.map((r, i) => ({ draft: lines[i] ?? null, real: r })) })
    // Không có hồ sơ: mặt hàng chỉ học được khi tờ khai in mã hàng (mô tả tiếng Việt không khớp mô tả invoice lô sau).
    .filter((o) => o.kind !== "LINE" || (o.context.partNo ?? "").startsWith("P:"));
  return { dossier: found, comparison: null, matched: null, total: null, observations };
}

/** Gộp quan sát vào bài học của org (cùng identity → cộng lần gặp). */
async function mergeLessons(deps: TeachDeps, r: TeachRepos, orgId: string, sample: { id: string; declarationNo: string | null }, obs: Observation[]): Promise<number> {
  const ids = [...new Set(obs.map(lessonIdentity))];
  const existing = new Map((await r.lessons.byIdentities(orgId, ids)).map((l) => [l.identity, l]));
  const now = deps.clock.now();
  const done = new Set<string>();
  for (const o of obs) {
    const identity = lessonIdentity(o);
    if (done.has(identity)) continue;
    done.add(identity);
    const prev = existing.get(identity) ?? null;
    const next = applyObservation(prev, o, sample, { id: prev?.id ?? deps.idGen.next("les"), orgId, now });
    const row: StoredLesson = { ...next, identity, reviewedBy: prev?.reviewedBy ?? null, reviewedAt: prev?.reviewedAt ?? null };
    await r.lessons.upsert(row);
  }
  return done.size;
}

/** Job: AI đọc tờ khai → so → bài học. Lỗi dữ liệu (file hỏng, đọc không ra tờ khai) → FAILED; lỗi tạm → ném để hàng đợi thử lại. */
export async function processTeachSample(deps: TeachDeps, input: { orgId: string; userId: string; sampleId: string }): Promise<Result<void>> {
  const ctx = { orgId: asOrgId(input.orgId), userId: asUserId(input.userId) };
  const sample = await deps.uow.asOrg(ctx, (r) => r.samples.get(input.orgId, input.sampleId));
  if (!sample) return err(domainError("NOT_FOUND", "Không tìm thấy tờ khai mẫu"));
  if (sample.status === "READ") return ok(undefined);
  await deps.uow.asOrg(ctx, (r) => r.samples.update(input.orgId, sample.id, { status: "READING", error: null, updatedAt: deps.clock.now() }));
  let read: CustomsDeclarationExtraction | null;
  try {
    const bytes = await deps.storage.get(sample.storageKey);
    const res = await readDeclaration(deps.ai, bytes, sample);
    await deps.usage.record({ orgId: input.orgId, dossierId: null, documentId: null, kind: "AI_EXTRACT", provider: deps.ai.name, model: res.usage.model, inputTokens: res.usage.inputTokens, outputTokens: res.usage.outputTokens, dedupeKey: `ai:teach:${sample.id}` });
    read = res.read;
  } catch (e) {
    if (!(e instanceof AiDataError)) throw e;
    if (e.usage) await deps.usage.record({ orgId: input.orgId, dossierId: null, documentId: null, kind: "AI_EXTRACT", provider: deps.ai.name, model: e.usage.model, inputTokens: e.usage.inputTokens, outputTokens: e.usage.outputTokens, dedupeKey: `ai:teach:${sample.id}` });
    await deps.uow.asOrg(ctx, (r) => r.samples.update(input.orgId, sample.id, { status: "FAILED", error: e.message, updatedAt: deps.clock.now() }));
    return ok(undefined);
  }
  if (!read || (!read.SOTK && !read.items.length)) {
    await deps.uow.asOrg(ctx, (r) => r.samples.update(input.orgId, sample.id, { status: "FAILED", error: "Không đọc ra tờ khai hải quan trong file này", updatedAt: deps.clock.now() }));
    return ok(undefined);
  }
  const a = await analyse(deps, input.orgId, read);
  const declarationNo = read.SOTK;
  await deps.uow.asOrg(ctx, async (r) => {
    const lessons = await mergeLessons(deps, r, input.orgId, { id: sample.id, declarationNo }, a.observations);
    await r.samples.update(input.orgId, sample.id, {
      status: "READ", declarationNo, read, dossierId: a.dossier?.id ?? null, dossierCode: a.dossier?.code ?? null, comparison: a.comparison,
      matched: a.matched, total: a.total, lessons, error: null, updatedAt: deps.clock.now(),
    });
  });
  return ok(undefined);
}

/** Job đọc hết số lần thử (AI lỗi liên tục) → FAILED để người dùng bấm "Đọc lại", không kẹt "AI đang đọc". */
export async function failTeachSample(deps: TeachDeps, input: { orgId: string; sampleId: string; error: string }): Promise<void> {
  const ctx = { orgId: asOrgId(input.orgId), userId: asUserId("system") };
  await deps.uow.asOrg(ctx, async (r) => {
    const s = await r.samples.get(input.orgId, input.sampleId);
    if (s && s.status !== "READ") await r.samples.update(input.orgId, s.id, { status: "FAILED", error: input.error, updatedAt: deps.clock.now() });
  });
}

/** Đọc lại một tờ khai mẫu (sau khi hồ sơ cùng lô có tờ khai nháp mới): so và quan sát lại; bài học không bị cộng hai lần. */
export async function retryTeachSample(deps: TeachDeps, ctx: Ctx, id: string): Promise<Result<TeachSample>> {
  const allowed = requireRole(ctx, "DECLARANT", "APPROVER", "ADMIN");
  if (!allowed.ok) return allowed;
  const s = await deps.uow.asOrg(ctx, (r) => r.samples.get(ctx.orgId, id));
  if (!s) return err(domainError("NOT_FOUND", "Không tìm thấy tờ khai mẫu"));
  if (s.status === "READ" && s.read) {
    const a = await analyse(deps, ctx.orgId, s.read);
    const row = await deps.uow.asOrg(ctx, async (r) => {
      const lessons = await mergeLessons(deps, r, ctx.orgId, { id: s.id, declarationNo: s.declarationNo }, a.observations);
      const patch = { dossierId: a.dossier?.id ?? null, dossierCode: a.dossier?.code ?? null, comparison: a.comparison, matched: a.matched, total: a.total, lessons, updatedAt: deps.clock.now() };
      await r.samples.update(ctx.orgId, s.id, patch);
      return { ...s, ...patch };
    });
    return ok(toTeachSample(row));
  }
  await deps.uow.asOrg(ctx, (r) => r.samples.update(ctx.orgId, s.id, { status: "UPLOADED", error: null, updatedAt: deps.clock.now() }));
  await deps.queue.enqueue("teach-sample-read", { orgId: ctx.orgId, userId: ctx.userId, sampleId: s.id }, { jobId: `teach-read:${s.id}:${deps.clock.now().getTime()}` });
  return ok(toTeachSample({ ...s, status: "UPLOADED", error: null }));
}

export async function deleteTeachSample(deps: TeachDeps, ctx: Ctx, id: string): Promise<Result<void>> {
  const allowed = requireRole(ctx, "DECLARANT", "APPROVER", "ADMIN");
  if (!allowed.ok) return allowed;
  const s = await deps.uow.asOrg(ctx, (r) => r.samples.get(ctx.orgId, id));
  if (!s) return err(domainError("NOT_FOUND", "Không tìm thấy tờ khai mẫu"));
  await deps.uow.asOrg(ctx, (r) => r.samples.delete(ctx.orgId, id));
  await deps.storage.delete(s.storageKey).catch(() => undefined);
  return ok(undefined);
}

export async function getTeachComparison(deps: TeachDeps, ctx: Ctx, id: string): Promise<Result<TeachComparison>> {
  const allowed = requireRole(ctx, "VIEWER", "DECLARANT", "APPROVER", "ADMIN");
  if (!allowed.ok) return allowed;
  const s = await deps.uow.asOrg(ctx, (r) => r.samples.get(ctx.orgId, id));
  if (!s) return err(domainError("NOT_FOUND", "Không tìm thấy tờ khai mẫu"));
  const c = (s.comparison ?? { fields: [], lines: [] }) as Pick<TeachComparison, "fields" | "lines">;
  return ok({ sample: toTeachSample(s), fields: c.fields, lines: c.lines });
}
