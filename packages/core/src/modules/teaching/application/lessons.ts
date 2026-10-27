// Bài học của mục Dạy khai báo: xem, duyệt/sửa/tắt, bật dùng bài học, xuất bộ quy tắc .md; cấp bài học cho tờ khai nháp (module declaration).
import type { DraftLessons, Lesson, TeachAccuracyPoint, TeachOverview, UpdateLessonInput } from "@kb/contracts";
import { requireRole, type Ctx } from "../../../shared/ctx.js";
import { domainError } from "../../../shared/errors.js";
import { asOrgId, asUserId } from "../../../shared/ids.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { isAutoFill, lessonContext, lessonsForDraft } from "../domain/lessons.js";
import { rulesMarkdown } from "../domain/markdown.js";
import type { StoredLesson, TeachDeps, TeachSampleRow } from "./ports.js";
import { toTeachSample } from "./samples.js";

const canReview = (ctx: Ctx) => requireRole(ctx, "DECLARANT", "APPROVER", "ADMIN");

export function toLesson(r: StoredLesson, labels: Record<string, string>): Lesson {
  return {
    id: r.id, kind: r.kind, fieldCode: r.fieldCode, label: r.kind === "LINE" ? "Mặt hàng" : labels[r.fieldCode] ?? r.fieldCode, context: r.context, value: r.value, line: r.line,
    hits: r.hits, conflicts: r.conflicts, status: r.status, autoFill: isAutoFill(r), lastDeclarationNo: r.lastDeclarationNo, updatedAt: r.updatedAt.toISOString(),
  };
}

/** % khớp theo tháng upload (chỉ tờ khai có hồ sơ để so). */
export function accuracyByMonth(samples: TeachSampleRow[]): TeachAccuracyPoint[] {
  const by = new Map<string, TeachAccuracyPoint>();
  for (const s of samples) {
    if (s.matched === null || s.total === null || !s.total) continue;
    const month = s.createdAt.toISOString().slice(0, 7);
    const p = by.get(month) ?? { month, matched: 0, total: 0, samples: 0 };
    by.set(month, { month, matched: p.matched + s.matched, total: p.total + s.total, samples: p.samples + 1 });
  }
  return [...by.values()].sort((a, b) => a.month.localeCompare(b.month));
}

export async function getTeachOverview(deps: TeachDeps, ctx: Ctx): Promise<Result<TeachOverview>> {
  const allowed = requireRole(ctx, "VIEWER", "DECLARANT", "APPROVER", "ADMIN");
  if (!allowed.ok) return allowed;
  const { enabled, samples, lessons } = await deps.uow.asOrg(ctx, async (r) => ({ enabled: await r.settings.enabled(ctx.orgId), samples: await r.samples.list(ctx.orgId, 500), lessons: await r.lessons.list(ctx.orgId) }));
  const labels = deps.lots.fieldLabels();
  return ok({ settings: { enabled }, samples: samples.slice(0, 200).map(toTeachSample), lessons: lessons.map((l) => toLesson(l, labels)), accuracy: accuracyByMonth(samples) });
}

export async function setTeachEnabled(deps: TeachDeps, ctx: Ctx, enabled: boolean): Promise<Result<{ enabled: boolean }>> {
  const allowed = requireRole(ctx, "ADMIN");
  if (!allowed.ok) return allowed;
  await deps.uow.asOrg(ctx, (r) => r.settings.set(ctx.orgId, enabled, deps.clock.now()));
  return ok({ enabled });
}

/** Duyệt (ACTIVE), tắt (OFF), đưa về chờ (PENDING) hoặc sửa giá trị (sửa = người dạy chốt giá trị, xóa mâu thuẫn). */
export async function updateLesson(deps: TeachDeps, ctx: Ctx, id: string, input: UpdateLessonInput): Promise<Result<Lesson>> {
  const allowed = canReview(ctx);
  if (!allowed.ok) return allowed;
  const now = deps.clock.now();
  const res = await deps.uow.asOrg(ctx, async (r) => {
    const l = await r.lessons.get(ctx.orgId, id);
    if (!l) return err(domainError("NOT_FOUND", "Không tìm thấy bài học"));
    if (input.value !== undefined && l.kind === "LINE" && input.value.replace(/\D/g, "").length !== 8) return err(domainError("INVALID_HS", "Mã HS phải đủ 8 chữ số (vd 9405.11.99)"));
    const patch = {
      ...(input.status ? { status: input.status } : {}),
      ...(input.value !== undefined ? { value: input.value, conflicts: [] } : {}),
      reviewedBy: ctx.userId, reviewedAt: now, updatedAt: now,
    };
    await r.lessons.update(ctx.orgId, id, patch);
    return ok({ ...l, ...patch });
  });
  if (!res.ok) return res;
  return ok(toLesson(res.value, deps.lots.fieldLabels()));
}

/** Duyệt nhiều bài học một lần (nút "Duyệt các bài học đã chọn"). */
export async function approveLessons(deps: TeachDeps, ctx: Ctx, ids: string[]): Promise<Result<number>> {
  const allowed = canReview(ctx);
  if (!allowed.ok) return allowed;
  const now = deps.clock.now();
  return ok(await deps.uow.asOrg(ctx, async (r) => {
    let n = 0;
    for (const id of ids) {
      const l = await r.lessons.get(ctx.orgId, id);
      if (!l || l.status === "ACTIVE") continue;
      await r.lessons.update(ctx.orgId, id, { status: "ACTIVE", reviewedBy: ctx.userId, reviewedAt: now, updatedAt: now });
      n++;
    }
    return n;
  }));
}

/** Bộ quy tắc khai báo của doanh nghiệp (Markdown) – bản xuất từ bài học đang dùng. */
export async function exportTeachRules(deps: TeachDeps, ctx: Ctx): Promise<Result<{ fileName: string; markdown: string }>> {
  const allowed = requireRole(ctx, "VIEWER", "DECLARANT", "APPROVER", "ADMIN");
  if (!allowed.ok) return allowed;
  const lessons = await deps.uow.asOrg(ctx, (r) => r.lessons.list(ctx.orgId));
  const now = deps.clock.now();
  const markdown = rulesMarkdown({ orgName: await deps.lots.orgName(ctx.orgId), generatedAt: now, lessons, labels: deps.lots.fieldLabels() });
  return ok({ fileName: `quy-tac-khai-bao-${now.toISOString().slice(0, 10)}.md`, markdown });
}

/**
 * Bài học áp cho tờ khai nháp của một hồ sơ (container nối vào module declaration). Nội bộ – không kiểm quyền.
 * Doanh nghiệp chưa bật "Dùng bài học" → null (tờ khai dựng như chưa dạy).
 */
export async function lessonsForDossier(deps: TeachDeps, orgId: string, dossierId: string): Promise<DraftLessons | null> {
  const ctx = { orgId: asOrgId(orgId), userId: asUserId("") };
  const { enabled, lessons } = await deps.uow.asOrg(ctx, async (r) => {
    const on = await r.settings.enabled(orgId);
    return { enabled: on, lessons: on ? await r.lessons.list(orgId) : [] };
  });
  if (!enabled || !lessons.some((l) => l.status === "ACTIVE")) return null;
  const lot = await deps.lots.lot(orgId, dossierId);
  if (!lot) return null;
  return lessonsForDraft(lessons, lessonContext({ sellerName: lot.sellerName, mode: lot.mode, office: lot.office, docs: lot.docs }));
}
