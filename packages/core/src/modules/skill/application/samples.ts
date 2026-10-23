import { customFieldsOf, extractionSchemaFor, withCustomFields, type LabeledSample, type SampleLabel } from "@kb/contracts";
import { requireRole, type Ctx } from "../../../shared/ctx.js";
import { domainError, type DomainError } from "../../../shared/errors.js";
import { asOrgId, asUserId } from "../../../shared/ids.js";
import { err, ok, type Result } from "../../../shared/result.js";
import type { UploadFile } from "../../dossier/index.js";
import { sampleExt, sampleMime } from "../domain/mime.js";
import { fieldHints, projectResult } from "../domain/schema-keys.js";
import { loadSkill, toSample } from "./_dto.js";
import type { SampleRow, SkillDeps } from "./ports.js";

const MAX_SAMPLE_BYTES = 20 * 1024 * 1024;
const ALLOWED_MIME = new Set(["application/pdf", "image/jpeg", "image/png"]);

export async function listSamples(deps: SkillDeps, ctx: Ctx, skillId: string): Promise<Result<LabeledSample[]>> {
  return deps.uow.asOrg(ctx, async (r) => {
    const l = await loadSkill(r, ctx.orgId, skillId);
    if (!l.ok) return l;
    const rows = await r.samples.list(ctx.orgId, skillId);
    const names = await deps.users.names(ctx.orgId, [...new Set(rows.map((s) => s.labeledBy).filter((x): x is string => !!x))]);
    return ok(rows.map((s) => toSample(s, names)));
  });
}

/** Một mẫu kèm nhãn hiện có (nháp do AI đọc hoặc đã được người sửa) – để mở màn sửa nhãn. */
export async function getSampleLabel(deps: SkillDeps, ctx: Ctx, sampleId: string): Promise<Result<SampleLabel>> {
  return deps.uow.asOrg(ctx, async (r) => {
    const s = await r.samples.get(ctx.orgId, sampleId);
    if (!s) return err(domainError("NOT_FOUND", "Không tìm thấy mẫu"));
    const names = await deps.users.names(ctx.orgId, s.labeledBy ? [s.labeledBy] : []);
    return ok({ sample: toSample(s, names), expected: s.expected });
  });
}

/** Tải mẫu: lưu storage `orgs/{org}/skills/{skill}/samples/{id}`, trạng thái PENDING, đẩy job đọc mẫu (AI) để có nhãn nháp. */
export async function uploadSamples(deps: SkillDeps, ctx: Ctx, skillId: string, files: UploadFile[]): Promise<Result<LabeledSample[]>> {
  const allowed = requireRole(ctx, "DECLARANT", "APPROVER", "ADMIN");
  if (!allowed.ok) return allowed;
  if (files.length === 0) return err(domainError("FILE_INVALID", "Chưa chọn file nào"));
  const inspected: { f: UploadFile; pages: number }[] = [];
  for (const f of files) {
    if (!ALLOWED_MIME.has(f.mime)) return err(domainError("FILE_INVALID", `${f.name}: chỉ nhận PDF, JPG, PNG`));
    if (f.bytes.length > MAX_SAMPLE_BYTES) return err(domainError("FILE_TOO_LARGE", `${f.name}: vượt 20 MB`));
    let info: { pages: number; encrypted: boolean };
    try {
      info = await deps.pdf.inspect(f.bytes, f.mime);
    } catch (e) {
      const de = e as DomainError;
      return err(de && typeof de === "object" && "code" in de ? de : domainError("FILE_INVALID", `${f.name}: không đọc được file`));
    }
    if (info.encrypted) return err(domainError("FILE_INVALID", `${f.name}: file có mật khẩu`));
    inspected.push({ f, pages: info.pages });
  }
  const now = deps.clock.now();
  const created = await deps.uow.asOrg(ctx, async (r) => {
    const l = await loadSkill(r, ctx.orgId, skillId);
    if (!l.ok) return l;
    const rows: SampleRow[] = [];
    for (const { f, pages } of inspected) {
      const id = deps.idGen.next("smp");
      const storageKey = `orgs/${ctx.orgId}/skills/${skillId}/samples/${id}.${sampleExt(sampleMime(f.name, f.bytes))}`;
      await deps.storage.put(storageKey, f.bytes, f.mime);
      const row: SampleRow = { id, orgId: ctx.orgId, skillId, documentId: null, storageKey, fileName: f.name, pages, sizeBytes: f.bytes.length, status: "PENDING", expected: null, labeledBy: ctx.userId, labeledAt: null, createdAt: now, updatedAt: now };
      await r.samples.insert(row);
      rows.push(row);
    }
    await r.skills.update(ctx.orgId, skillId, { updatedAt: now });
    return ok(rows);
  });
  if (!created.ok) return created;
  for (const s of created.value) await deps.queue.enqueue("skill-sample-read", { orgId: ctx.orgId, userId: ctx.userId, sampleId: s.id }, { jobId: `sample-read:${s.id}` });
  const names = await deps.users.names(ctx.orgId, [ctx.userId]);
  return ok(created.value.map((s) => toSample(s, names)));
}

/** Job: AI đọc mẫu bằng cấu hình hiện tại → `expected` nháp (người dùng kiểm tra rồi xác nhận hoặc sửa bằng labelSample). */
export async function readSample(deps: SkillDeps, input: { orgId: string; userId: string; sampleId: string }): Promise<Result<void>> {
  const ctx = { orgId: asOrgId(input.orgId), userId: asUserId(input.userId) };
  const prep = await deps.uow.asOrg(ctx, async (r) => {
    const s = await r.samples.get(input.orgId, input.sampleId);
    if (!s) return err(domainError("NOT_FOUND", "Không tìm thấy mẫu"));
    const l = await loadSkill(r, input.orgId, s.skillId);
    if (!l.ok) return l;
    return ok({ sample: s, ...l.value });
  });
  if (!prep.ok) return prep;
  const { sample, skill, version } = prep.value;
  if (sample.status === "LABELED" || !skill.docKind) return ok(undefined);
  const bytes = await deps.storage.get(sample.storageKey);
  const mime = sampleMime(sample.fileName, bytes);
  const pages = Array.from({ length: Math.max(1, sample.pages) }, (_, i) => i + 1);
  const res = await deps.ai.extract({ bytes, mime, pages: sample.pages, fileName: sample.fileName }, pages, withCustomFields(extractionSchemaFor(skill.docKind), customFieldsOf(skill.docKind, version.fields)), { kind: skill.docKind, skillHints: fieldHints(skill.docKind, version.fields), examples: [], supplierHint: skill.supplier });
  // Khóa theo (mẫu, phiên bản skill): job đọc mẫu chạy lại không tính tiền hai lần.
  await deps.usage.record({ orgId: input.orgId, dossierId: null, documentId: null, kind: "AI_EXTRACT", provider: deps.ai.name, model: res.usage.model, inputTokens: res.usage.inputTokens, outputTokens: res.usage.outputTokens, dedupeKey: `ai:sample:${sample.id}:${version.version}` });
  const expected = projectResult(skill.docKind, version.fields, res.result);
  await deps.uow.asOrg(ctx, (r) => r.samples.update(sample.orgId, sample.id, { expected, updatedAt: deps.clock.now() }));
  return ok(undefined);
}

/** Người duyệt ghi giá trị đúng cho mẫu (theo key trường skill) → LABELED. */
export async function labelSample(deps: SkillDeps, ctx: Ctx, sampleId: string, expected: Record<string, unknown>): Promise<Result<LabeledSample>> {
  const allowed = requireRole(ctx, "DECLARANT", "APPROVER", "ADMIN");
  if (!allowed.ok) return allowed;
  const now = deps.clock.now();
  return deps.uow.asOrg(ctx, async (r) => {
    const s = await r.samples.get(ctx.orgId, sampleId);
    if (!s) return err(domainError("NOT_FOUND", "Không tìm thấy mẫu"));
    const l = await loadSkill(r, ctx.orgId, s.skillId);
    if (!l.ok) return l;
    const patch = { status: "LABELED" as const, expected, labeledBy: ctx.userId, labeledAt: now, updatedAt: now };
    await r.samples.update(ctx.orgId, sampleId, patch);
    if (s.status !== "LABELED") await r.skills.update(s.orgId, s.skillId, { labeledSamples: l.value.skill.labeledSamples + 1, updatedAt: now });
    const names = await deps.users.names(ctx.orgId, [ctx.userId]);
    return ok(toSample({ ...s, ...patch }, names));
  });
}

/**
 * Xác nhận các mẫu chờ đã có nhãn nháp (AI đọc xong) → LABELED; trả số mẫu vừa xác nhận.
 * Mẫu chờ mà chưa có nhãn nháp (job đọc chưa chạy/mất) được đẩy lại job đọc – tự chữa, không cần tải lại.
 */
export async function confirmPendingSamples(deps: SkillDeps, ctx: Ctx, skillId: string): Promise<Result<number>> {
  const allowed = requireRole(ctx, "DECLARANT", "APPROVER", "ADMIN");
  if (!allowed.ok) return allowed;
  const now = deps.clock.now();
  const r = await deps.uow.asOrg(ctx, async (r) => {
    const l = await loadSkill(r, ctx.orgId, skillId);
    if (!l.ok) return l;
    const pending = (await r.samples.list(ctx.orgId, skillId)).filter((s) => s.status === "PENDING");
    const ready = pending.filter((s) => s.expected !== null);
    for (const s of ready) await r.samples.update(s.orgId, s.id, { status: "LABELED", labeledBy: ctx.userId, labeledAt: now, updatedAt: now });
    if (ready.length) await r.skills.update(ctx.orgId, skillId, { labeledSamples: l.value.skill.labeledSamples + ready.length, updatedAt: now });
    return ok({ confirmed: ready.length, unread: pending.filter((s) => s.expected === null).map((s) => s.id) });
  });
  if (!r.ok) return r;
  for (const id of r.value.unread) await deps.queue.enqueue("skill-sample-read", { orgId: ctx.orgId, userId: ctx.userId, sampleId: id }, { jobId: `sample-read:${id}:${now.getTime()}` });
  return ok(r.value.confirmed);
}
