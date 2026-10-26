// Skill tự học từ việc người dùng kiểm tra chứng từ – người dùng không phải vào trang cấu hình:
// 1) Xác nhận dữ liệu ở bước OCR → chứng từ có trường bị sửa thành mẫu đã gắn nhãn; cùng nhà cung cấp bị sửa nhiều lần → tự tạo skill riêng.
// 2) Chỉ/sửa giá trị trên file gốc → gợi ý thêm nhãn in trên chứng từ cho trường; người dùng đồng ý mới áp, rồi tự đánh giá lại.
// 3) Skill đổi → gợi ý đọc lại các chứng từ còn ở bước kiểm tra đã đọc bằng cấu hình cũ.
import { MIN_SAMPLES_FOR_ACCURACY, nextSkillCode, resolveSkillFieldKey, type DocKind, type LearnSummary, type Skill, type SkillSuggestion, type StaleReads } from "@kb/contracts";
import { requireRole, type Ctx } from "../../../shared/ctx.js";
import { domainError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { applyFieldPatch, resolveCandidates } from "../domain/field-rules.js";
import { AUTO_SUPPLIER_SKILL_AFTER, hasAlias, MAX_REVIEW_SAMPLES, normalizeAlias, sameSupplier, supplierSkillName } from "../domain/learning.js";
import { sampleExt, sampleMime } from "../domain/mime.js";
import { projectResult } from "../domain/schema-keys.js";
import { loadSkill, toSkill, toSuggestion } from "./_dto.js";
import { commitVersion } from "./edit-fields.js";
import { evaluateSkill } from "./evaluate.js";
import type { SampleRow, SkillDeps, SkillRepos, SkillRow } from "./ports.js";

/** Một chứng từ đã kiểm tra: bản đọc đã ghi đè giá trị người dùng sửa (extraction cung cấp qua route). */
export type LearnDocument = {
  documentId: string; kind: DocKind; fileName: string; mime: string; pages: number; storageKey: string;
  data: Record<string, unknown>; corrections: { key: string }[]; supplier: string | null;
};

const MAX_DOC_BYTES = 20 * 1024 * 1024;

async function createSupplierSkill(deps: SkillDeps, ctx: Ctx, r: SkillRepos, base: SkillRow, supplier: string, all: SkillRow[]): Promise<SkillRow | null> {
  const v = await r.versions.get(base.id, base.currentVersion);
  if (!v || !base.docKind) return null;
  const now = deps.clock.now();
  const row: SkillRow = {
    id: deps.idGen.next("sk"), orgId: ctx.orgId, code: nextSkillCode(base.docKind, all.map((s) => s.code)), name: supplierSkillName(base.docKind, supplier), kind: "SUPPLIER", docKind: base.docKind,
    supplier, language: base.language, enabled: true, isTemplate: false, templateId: null, currentVersion: 1, labeledSamples: 0, accuracy: null, createdAt: now, updatedAt: now,
  };
  await r.skills.insert(row);
  await r.versions.insert({ id: deps.idGen.next("sk"), orgId: ctx.orgId, skillId: row.id, version: 1, fields: v.fields, promptNotes: v.promptNotes, createdBy: ctx.userId, createdAt: now });
  all.push(row);
  return row;
}

/**
 * Ghi nhớ cách đọc từ các chứng từ người dùng vừa kiểm tra. Chỉ chứng từ có trường bị sửa mới thành mẫu (đọc đúng hết thì không cần dạy).
 * Mỗi chứng từ một mẫu cho mỗi skill (xác nhận lại → cập nhật nhãn). Lỗi lưu file một chứng từ không chặn chứng từ khác.
 */
export async function learnFromReview(deps: SkillDeps, ctx: Ctx, docs: LearnDocument[]): Promise<Result<LearnSummary>> {
  const allowed = requireRole(ctx, "DECLARANT", "APPROVER", "ADMIN");
  if (!allowed.ok) return allowed;
  const todo = docs.filter((d) => d.corrections.length > 0);
  if (!todo.length) return ok({ learned: 0, skills: [] });
  const created: SkillRow[] = [];
  const res = await deps.uow.asOrg(ctx, async (r) => {
    const all = await r.skills.list(ctx.orgId);
    const touched = new Map<string, { skill: SkillRow; created: boolean }>();
    let learned = 0;
    for (const d of todo) {
      let skill = resolveCandidates(all, d.kind, d.supplier);
      if (!skill) continue;
      const now = deps.clock.now();
      let samples = await r.samples.list(ctx.orgId, skill.id);
      // Đủ số lần sửa cho cùng nhà cung cấp mà chưa có skill riêng → tạo skill riêng, chép các mẫu của nhà cung cấp đó sang.
      if (skill.kind === "DOCUMENT" && d.supplier) {
        const same = samples.filter((s) => s.source === "REVIEW" && s.documentId !== d.documentId && sameSupplier(s.supplier, d.supplier));
        if (same.length + 1 >= AUTO_SUPPLIER_SKILL_AFTER) {
          const sup = await createSupplierSkill(deps, ctx, r, skill, d.supplier, all);
          if (sup) {
            for (const s of same) await r.samples.insert({ ...s, id: deps.idGen.next("smp"), skillId: sup.id, createdAt: now, updatedAt: now });
            await r.skills.update(ctx.orgId, sup.id, { labeledSamples: same.filter((s) => s.status === "LABELED").length, updatedAt: now });
            sup.labeledSamples = same.filter((s) => s.status === "LABELED").length;
            created.push(sup);
            touched.set(sup.id, { skill: sup, created: true });
            skill = sup;
            samples = await r.samples.list(ctx.orgId, sup.id);
          }
        }
      }
      const v = await r.versions.get(skill.id, skill.currentVersion);
      if (!v || !skill.docKind) continue;
      const expected = projectResult(skill.docKind, v.fields, d.data);
      const existing = samples.find((s) => s.documentId === d.documentId);
      if (existing) {
        await r.samples.update(ctx.orgId, existing.id, { status: "LABELED", expected, labeledBy: ctx.userId, labeledAt: now, updatedAt: now });
        if (existing.status !== "LABELED") skill.labeledSamples += 1;
      } else {
        if (samples.filter((s) => s.source === "REVIEW").length >= MAX_REVIEW_SAMPLES) continue;
        let bytes: Buffer;
        try {
          bytes = await deps.storage.get(d.storageKey);
        } catch {
          continue; // file gốc đã bị xóa – bỏ qua chứng từ này
        }
        if (bytes.length > MAX_DOC_BYTES) continue;
        const id = deps.idGen.next("smp");
        const storageKey = `orgs/${ctx.orgId}/skills/${skill.id}/samples/${id}.${sampleExt(sampleMime(d.fileName, bytes))}`;
        await deps.storage.put(storageKey, bytes, d.mime);
        const row: SampleRow = {
          id, orgId: ctx.orgId, skillId: skill.id, documentId: d.documentId, storageKey, fileName: d.fileName, pages: d.pages, sizeBytes: bytes.length,
          status: "LABELED", source: "REVIEW", supplier: d.supplier, expected, labeledBy: ctx.userId, labeledAt: now, createdAt: now, updatedAt: now,
        };
        await r.samples.insert(row);
        skill.labeledSamples += 1;
      }
      await r.skills.update(ctx.orgId, skill.id, { labeledSamples: skill.labeledSamples, updatedAt: now });
      learned += 1;
      if (!touched.has(skill.id)) touched.set(skill.id, { skill, created: false });
    }
    return {
      learned,
      skills: [...touched.values()].map(({ skill, created }) => ({ id: skill.id, name: skill.name, created, ...(skill.supplier ? { supplier: skill.supplier } : {}) })),
    };
  });
  for (const s of created) await deps.audit?.record(ctx, { action: "SKILL_AUTO_CREATED", targetType: "skill", targetId: s.id, targetLabel: s.name, detail: { code: s.code, supplier: s.supplier } });
  return ok(res);
}

/** Vị trí giá trị một trường trên chứng từ (extraction cung cấp): loại chứng từ, chỗ trong dữ liệu model, nhà cung cấp. */
export type FieldSource = { documentId: string; kind: DocKind; rawPath: string; supplier: string | null };

/**
 * Nhãn in cạnh giá trị trên chứng từ (người dùng chỉ/sửa trên file gốc) → gợi ý thêm alias cho trường tương ứng của skill.
 * Đã có nhãn đó, trường không thuộc skill, hoặc người dùng từng bỏ qua gợi ý này → null.
 */
export async function suggestAlias(deps: SkillDeps, ctx: Ctx, src: FieldSource, label: string): Promise<Result<SkillSuggestion | null>> {
  const allowed = requireRole(ctx, "DECLARANT", "APPROVER", "ADMIN");
  if (!allowed.ok) return allowed;
  const alias = normalizeAlias(label);
  // Dòng hàng: nhãn là tiêu đề cột, không gắn với một trường của skill.
  if (!alias || src.rawPath.startsWith("items.")) return ok(null);
  const top = src.rawPath.split(".")[0]!;
  return deps.uow.asOrg(ctx, async (r) => {
    const skill = resolveCandidates(await r.skills.list(ctx.orgId), src.kind, src.supplier);
    if (!skill?.docKind) return ok(null);
    const v = await r.versions.get(skill.id, skill.currentVersion);
    const field = v?.fields.find((f) => resolveSkillFieldKey(src.kind, f.key).key === top);
    if (!v || !field || hasAlias(field, alias)) return ok(null);
    const now = deps.clock.now();
    const prev = await r.suggestions.find(ctx.orgId, skill.id, field.key, alias);
    if (prev) {
      if (prev.status !== "PENDING") return ok(null);
      await r.suggestions.update(ctx.orgId, prev.id, { hits: prev.hits + 1, supplier: src.supplier ?? prev.supplier, documentId: src.documentId, updatedAt: now });
      return ok(toSuggestion({ ...prev, hits: prev.hits + 1 }, { name: skill.name, fields: v.fields }));
    }
    const row = { id: deps.idGen.next("sug"), orgId: ctx.orgId, skillId: skill.id, fieldKey: field.key, alias, hits: 1, status: "PENDING" as const, supplier: src.supplier, documentId: src.documentId, createdAt: now, updatedAt: now };
    await r.suggestions.insert(row);
    return ok(toSuggestion(row, { name: skill.name, fields: v.fields }));
  });
}

/** Gợi ý đang chờ (của một skill hoặc cả doanh nghiệp), nhiều lần gặp trước. */
export async function listSuggestions(deps: SkillDeps, ctx: Ctx, skillId?: string): Promise<Result<SkillSuggestion[]>> {
  return deps.uow.asOrg(ctx, async (r) => {
    const rows = await r.suggestions.list(ctx.orgId, { skillId, status: "PENDING" });
    const out: SkillSuggestion[] = [];
    const cache = new Map<string, { name: string; fields: { key: string; label: string }[] } | null>();
    for (const s of rows) {
      if (!cache.has(s.skillId)) {
        const l = await loadSkill(r, ctx.orgId, s.skillId);
        cache.set(s.skillId, l.ok ? { name: l.value.skill.name, fields: l.value.version.fields } : null);
      }
      const sk = cache.get(s.skillId);
      if (sk) out.push(toSuggestion(s, sk));
    }
    return ok(out);
  });
}

/** Đồng ý: thêm nhãn vào trường (phiên bản skill mới), rồi tự đánh giá lại nếu đủ mẫu để thấy độ chính xác trước/sau. */
export async function acceptSuggestion(deps: SkillDeps, ctx: Ctx, id: string): Promise<Result<{ skill: Skill; evaluationQueued: boolean }>> {
  const allowed = requireRole(ctx, "APPROVER", "ADMIN");
  if (!allowed.ok) return allowed;
  const res = await deps.uow.asOrg(ctx, async (r) => {
    const s = await r.suggestions.get(ctx.orgId, id);
    if (!s || s.status !== "PENDING") return err(domainError("NOT_FOUND", "Gợi ý không còn"));
    const l = await loadSkill(r, ctx.orgId, s.skillId);
    if (!l.ok) return l;
    const field = l.value.version.fields.find((f) => f.key === s.fieldKey);
    if (!field) return err(domainError("NOT_FOUND", "Không tìm thấy trường"));
    await r.suggestions.update(ctx.orgId, s.id, { status: "ACCEPTED", updatedAt: deps.clock.now() });
    if (hasAlias(field, s.alias)) return ok({ skill: null, s, labeled: l.value.skill.labeledSamples });
    const next = applyFieldPatch(l.value.version.fields, field.key, { aliases: [...field.aliases, s.alias] });
    if (!next.ok) return next;
    return ok({ skill: await commitVersion(deps, ctx, r, l.value.skill, next.value), s, labeled: l.value.skill.labeledSamples });
  });
  if (!res.ok) return res;
  const { s, labeled } = res.value;
  let skill = res.value.skill;
  if (!skill) {
    const l = await deps.uow.asOrg(ctx, (r) => loadSkill(r, ctx.orgId, s.skillId));
    if (!l.ok) return l;
    skill = toSkill(l.value.skill, l.value.version);
  }
  await deps.audit?.record(ctx, { action: "SKILL_SUGGESTION_ACCEPTED", targetType: "skill", targetId: s.skillId, targetLabel: skill.name, detail: { field: s.fieldKey, alias: s.alias } });
  const evaluationQueued = labeled >= MIN_SAMPLES_FOR_ACCURACY && (await evaluateSkill(deps, ctx, s.skillId)).ok;
  return ok({ skill, evaluationQueued });
}

export async function dismissSuggestion(deps: SkillDeps, ctx: Ctx, id: string): Promise<Result<void>> {
  const allowed = requireRole(ctx, "DECLARANT", "APPROVER", "ADMIN");
  if (!allowed.ok) return allowed;
  return deps.uow.asOrg(ctx, async (r) => {
    const s = await r.suggestions.get(ctx.orgId, id);
    if (!s) return err(domainError("NOT_FOUND", "Gợi ý không còn"));
    await r.suggestions.update(ctx.orgId, s.id, { status: "DISMISSED", updatedAt: deps.clock.now() });
    return ok(undefined);
  });
}

async function computeStale(deps: SkillDeps, ctx: Ctx, skillId: string): Promise<Result<StaleReads>> {
  if (!deps.reads) return ok({ documents: [], dossiers: 0 });
  const prep = await deps.uow.asOrg(ctx, async (r) => {
    const l = await loadSkill(r, ctx.orgId, skillId);
    if (!l.ok) return l;
    return ok({ all: await r.skills.list(ctx.orgId), skill: l.value.skill, currentVersionId: l.value.version.id });
  });
  if (!prep.ok) return prep;
  const { all, skill, currentVersionId } = prep.value;
  if (!skill.docKind || !skill.enabled) return ok({ documents: [], dossiers: 0 });
  // Chứng từ mà bây giờ sẽ được đọc bằng skill này (kể cả skill nhà cung cấp mới tạo) nhưng lần đọc gần nhất dùng cấu hình khác.
  const stale = (await deps.reads.open(ctx.orgId)).filter((d) => d.kind === skill.docKind && d.skillVersionId !== currentVersionId && resolveCandidates(all, d.kind, d.supplier)?.id === skill.id);
  return ok({ documents: stale.map((d) => ({ documentId: d.documentId, dossierId: d.dossierId, dossierCode: d.dossierCode, fileName: d.fileName })), dossiers: new Set(stale.map((d) => d.dossierId)).size });
}

/** Chứng từ trong hồ sơ còn ở bước kiểm tra đã đọc bằng cấu hình cũ của skill. */
export async function staleReads(deps: SkillDeps, ctx: Ctx, skillId: string): Promise<Result<StaleReads>> {
  return computeStale(deps, ctx, skillId);
}

/** Đọc lại các chứng từ đó bằng cấu hình mới (giữ nguyên giá trị người dùng đã xác nhận). */
export async function rereadStale(deps: SkillDeps, ctx: Ctx, skillId: string): Promise<Result<{ queued: number }>> {
  const allowed = requireRole(ctx, "DECLARANT", "APPROVER", "ADMIN");
  if (!allowed.ok) return allowed;
  const s = await computeStale(deps, ctx, skillId);
  if (!s.ok) return s;
  if (!deps.reads || !s.value.documents.length) return ok({ queued: 0 });
  return ok({ queued: await deps.reads.reread(ctx, s.value.documents.map((d) => d.documentId)) });
}
