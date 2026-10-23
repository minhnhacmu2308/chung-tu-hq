// Phân loại HS qua HSCodePro (docs/integrations/hscodepro-api-v1.md): tạo lượt → poll 3 giây → người khai trả lời câu hỏi → phân loại lại.
// Gọi ngoài chỉ chạy trong worker (startHsClassification từ run-agent, pollHsJob từ hs-poll, sendHsAnswer từ hs-answer).
// Web chỉ gọi answerHsQuestion / reclassifyHs: ghi DB + đẩy job.
import type { HsAnswerInput, HsJob, HsReclassifyInput, LineItem } from "@kb/contracts";
import { requireRole, type Ctx } from "../../../shared/ctx.js";
import { domainError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { meterSafely } from "../../../shared/usage.js";
import { candidatesFromResult, chunk, toHsRequestItems } from "../domain/hscodepro-map.js";
import { vnDate } from "../domain/mapping/types.js";
import { rebuildDraft } from "./_rebuild.js";
import { toLineItem } from "./_dto.js";
import { HsApiError, type AgentLog, type DeclarationDeps, type DeclarationRepos, type HsJobRow, type LineItemRow } from "./ports.js";

export const HS_POLL_MS = 3000;
/** 300 × 3 giây = 15 phút (tài liệu: một lần chạy tối đa 10 phút). */
export const HS_MAX_POLLS = 300;
const CHUNK = 50;

type SysCtx = { orgId: string; userId: string };
/** Còn dòng chờ/đang phân loại → phải poll tiếp, kể cả khi trạng thái gốc là need_info (tài liệu §2: need_info được ưu tiên ở gốc). */
const busyApi = (api: HsJob) => api.items.some((i) => i.status === "queued" || i.status === "processing");
const localStatus = (api: HsJob): HsJobRow["status"] => (busyApi(api) ? "processing" : api.status === "processing" ? "completed" : api.status);
const asCtx = (c: SysCtx) => c as unknown as Ctx;
const LOCKED = ["APPROVED", "SUBMITTED", "CLEARED", "CANCELLED"];

/**
 * Ghi trạng thái/kết quả của một lượt vào các dòng còn thuộc lượt đó (dòng đã chuyển sang lượt khác bị bỏ qua).
 * Trả số dòng vừa có kết quả mới (trước đó chưa completed) – dùng ghi chi phí "nhận kết quả".
 */
async function ingest(deps: DeclarationDeps, r: DeclarationRepos, orgId: string, job: HsJobRow, api: HsJob): Promise<number> {
  const now = deps.clock.now();
  let fresh = 0;
  for (const it of api.items) {
    const row = await r.lineItems.findByHsItem(orgId, it.id);
    if (!row || row.hsJobId !== job.id) continue;
    // Đã trả lời nhưng HSCodePro chưa nhận (job hs-answer chưa chạy) → giữ "đang gửi".
    if (row.hsStatus === "answering" && it.status === "need_info" && it.question?.id === row.hsQuestion?.id) continue;
    if (it.status === "completed" && it.result) {
      if (row.hsStatus !== "completed") fresh++;
      const cands = candidatesFromResult(it.result);
      await r.lineItems.update(row.id, {
        hsStatus: "completed", hsSuggested: cands[0]!.code, hsConfidence: cands[0]!.confidence, hsQuestion: null, hsError: null,
        hsDetail: { reasoning: it.result.reasoning, legalBasis: it.result.legal_basis, warnings: it.result.warnings }, updatedAt: now,
      });
      await r.suggestions.replaceForItem(row.id, cands.map((c) => ({
        id: deps.idGen.next("sug"), orgId, lineItemId: row.id, code: c.code, description: c.description, confidence: c.confidence, whyNot: c.whyNot,
        rates: { importRate: c.importRate, basis: c.basis, agreement: c.agreement, vatRate: c.vatRate }, source: deps.hs.name, createdAt: now,
      })));
    } else if (it.status === "completed" || it.status === "failed" || it.status === "cancelled") {
      const error = it.error ?? { code: "NO_RESULT", message: "HSCodePro không trả kết quả" };
      await r.lineItems.update(row.id, { hsStatus: it.status === "cancelled" ? "cancelled" : "failed", hsQuestion: null, hsError: error, updatedAt: now });
    } else if (it.status === "need_info") {
      await r.lineItems.update(row.id, { hsStatus: "need_info", hsQuestion: it.question, hsError: null, updatedAt: now });
    } else {
      await r.lineItems.update(row.id, { hsStatus: it.status, hsQuestion: null, hsError: null, updatedAt: now });
    }
  }
  return fresh;
}

/** Dòng nhật ký agent cho từng dòng hàng theo trạng thái phân loại. */
export function hsSummaryLogs(rows: LineItemRow[], at: string): AgentLog[] {
  const out: AgentLog[] = [];
  for (const it of rows) {
    if (it.hsConfirmed) continue;
    if (it.hsStatus === "completed" && it.hsSuggested) {
      const conf = Math.round((it.hsConfidence ?? 0) * 100);
      const warn = conf < 70 || !!it.hsDetail?.warnings.length;
      out.push({ at, text: `Dòng ${it.lineNo}: ${it.hsSuggested} (tin cậy ${conf}%)${conf < 70 ? " – cần người xác nhận kỹ" : ""}`, tone: warn ? "warning" : "info" });
    } else if (it.hsStatus === "need_info" || it.hsStatus === "answering") {
      out.push({ at, text: `Dòng ${it.lineNo}: AI cần bổ sung thông tin – trả lời ở bảng "Xác nhận mã HS"`, tone: "warning" });
    } else if (it.hsStatus === "queued" || it.hsStatus === "processing") {
      out.push({ at, text: `Dòng ${it.lineNo}: đang phân loại`, tone: "info" });
    } else {
      out.push({ at, text: `Dòng ${it.lineNo}: không có gợi ý${it.hsError ? ` (${it.hsError.message})` : ""} – chọn mã HS thủ công`, tone: "warning" });
    }
  }
  return out;
}

/**
 * Gửi các dòng chưa xác nhận (hoặc chỉ `lineItemIds`) thành lượt ≤ 50 dòng.
 * Gửi lại cả hồ sơ → hủy lượt cũ còn dở. Kết quả có ngay → ghi luôn; còn processing → hẹn hs-poll.
 */
export async function startHsClassification(
  deps: DeclarationDeps, c: SysCtx, dossierId: string, opts: { lineItemIds?: string[]; extra?: Record<string, string | undefined>; operation?: "CLASSIFY" | "RECLASSIFY" } = {},
): Promise<Result<{ jobIds: string[]; skipped: number; pending: boolean }>> {
  const dossier = await deps.dossiers.get(c.orgId, dossierId);
  if (!dossier) return err(domainError("NOT_FOUND", "Không tìm thấy hồ sơ"));
  const shipment = await deps.shipments.latest(c.orgId, dossierId);
  const ctx = asCtx(c);
  const now = deps.clock.now();
  const rows = await deps.uow.asOrg(ctx, (r) => r.lineItems.list(c.orgId, dossierId));
  const targets = rows.filter((x) => !x.hsConfirmed && (!opts.lineItemIds || opts.lineItemIds.includes(x.id)));

  if (!opts.lineItemIds) {
    const open = await deps.uow.asOrg(ctx, (r) => r.hsJobs.openForDossier(c.orgId, dossierId));
    for (const j of open) {
      // Lượt pending chưa có mã ngoài (có thể chưa từng tới HSCodePro) → chỉ hủy ở ta.
      if (j.externalId) await deps.hs.cancel(j.externalId).catch((e: unknown) => {
        if (!(e instanceof HsApiError)) throw e;
      });
      await deps.uow.asOrg(ctx, (r) => r.hsJobs.update(j.id, { status: "cancelled", updatedAt: now }));
    }
  }

  const byLine = new Map(targets.map((x) => [x.lineNo, x]));
  const { items, skipped } = toHsRequestItems(
    targets.map((x) => ({ lineNo: x.lineNo, description: opts.extra?.[x.id] ? `${x.description} – ${opts.extra[x.id]}` : x.description, quantity: x.quantity, unit: x.unit, amount: x.amount, origin: x.origin, invoiceHsCode: x.invoiceHsCode })),
    {
      invoiceCurrency: shipment?.invoice.currency.value ?? dossier.currency,
      fallbackOrigin: shipment?.origin.country.value ?? shipment?.parties.seller.country.value ?? null,
      coForm: shipment?.origin.coForm.value ?? null,
    },
  );
  await deps.uow.asOrg(ctx, async (r) => {
    for (const s of skipped) await r.lineItems.update(byLine.get(s.lineNo)!.id, { hsStatus: "skipped", hsError: { code: s.code, message: s.message }, hsQuestion: null, hsJobId: null, hsItemId: null, updatedAt: now });
  });

  const jobIds: string[] = [];
  let pending = false;
  const markLines = (lineNos: number[], patch: Parameters<DeclarationRepos["lineItems"]["update"]>[1]) =>
    deps.uow.asOrg(ctx, async (r) => {
      for (const n of lineNos) await r.lineItems.update(byLine.get(n)!.id, { ...patch, hsJobId: null, hsItemId: null, updatedAt: now });
    });
  /** Tạo lượt; 400 có details → bỏ dòng sai (kèm lý do) rồi gửi lại phần còn lại; lỗi không tạm khác → dòng thành failed. Lỗi tạm → ném để BullMQ thử lại. */
  const createSafely = async (part: typeof items, externalRef: string): Promise<HsJob | null> => {
    try {
      return await deps.hs.create({ external_ref: externalRef, import_date: vnDate(now), items: part });
    } catch (e) {
      if (!(e instanceof HsApiError) || e.transient) throw e;
      const bad = new Map<number, string>();
      for (const d of e.details ?? []) {
        const idx = /^items\[(\d+)\]/.exec(d.field)?.[1];
        if (idx !== undefined && part[Number(idx)]) bad.set(part[Number(idx)]!.line_no, `${d.message} (${d.field.replace(/^items\[\d+\]\.?/, "") || "dòng hàng"})`);
      }
      if (e.status === 400 && bad.size > 0) {
        for (const [n, msg] of bad) await markLines([n], { hsStatus: "skipped", hsError: { code: e.code, message: `HSCodePro không nhận dòng này: ${msg} – sửa rồi phân loại lại` }, hsQuestion: null });
        const rest = part.filter((x) => !bad.has(x.line_no));
        return rest.length ? createSafely(rest, externalRef) : null;
      }
      await markLines(part.map((x) => x.line_no), { hsStatus: "failed", hsError: { code: e.code, message: `HSCodePro từ chối: ${e.message}` }, hsQuestion: null });
      return null;
    }
  };
  // Lượt pending của lần chạy trước (ghi DB rồi mà chưa biết HSCodePro đã nhận chưa): dùng lại đúng dòng đó cho cùng tập dòng hàng
  // để chi phí ghi một lần theo job.id và external_ref không đổi (đối chiếu được với HSCodePro nếu lượt cũ thật ra đã tạo).
  const pendingJobs = (await deps.uow.asOrg(ctx, (r) => r.hsJobs.openForDossier(c.orgId, dossierId))).filter((j) => j.status === "pending");
  const lineIdsOf = (jobId: string) => rows.filter((x) => x.hsJobId === jobId).map((x) => x.id).sort().join(",");
  for (const part of chunk(items, CHUNK)) {
    const partIds = part.map((it) => byLine.get(it.line_no)!.id);
    const partKey = [...partIds].sort().join(",");
    const reused = pendingJobs.find((j) => lineIdsOf(j.id) === partKey);
    // 1. Ghi "đang gửi" TRƯỚC khi gọi API (gọi ngoài có tính phí): crash/timeout sau đó không tạo bản ghi mồ côi, chạy lại biết dòng nào đang dở.
    const job: HsJobRow = reused ?? { id: deps.idGen.next("hsj"), orgId: c.orgId, dossierId, externalId: "", status: "pending", polls: 0, createdAt: now, updatedAt: now };
    await deps.uow.asOrg(ctx, async (r) => {
      if (!reused) await r.hsJobs.insert(job);
      for (const id of partIds) await r.lineItems.update(id, { hsJobId: job.id, hsItemId: null, hsStatus: "queued", hsQuestion: null, hsError: null, updatedAt: now });
    });
    // 2. Gọi HSCodePro. Lỗi tạm ném ra (job giữ pending, dòng giữ queued); lỗi dữ liệu → createSafely đã đánh dấu dòng, hủy lượt.
    const api = await createSafely(part.map((it) => ({ ...it })), `${dossier.code}#${job.id}`.slice(0, 100));
    if (!api) {
      await deps.uow.asOrg(ctx, (r) => r.hsJobs.update(job.id, { status: "cancelled", updatedAt: now }));
      continue;
    }
    // 3. HSCodePro đã nhận → ghi chi phí theo số dòng gửi, khóa theo job.id nội bộ: chạy lại (timeout rồi thành công) không tính hai lần cho khách.
    await meterSafely(deps.usage, {
      orgId: c.orgId, dossierId, provider: "HSCODEPRO", kind: "HS_CLASSIFY", operation: opts.operation ?? "CLASSIFY", quantity: api.items.length,
      dedupeKey: `hscodepro:create:${job.id}`, meta: { externalJobId: api.id },
    });
    job.externalId = api.id;
    job.status = localStatus(api);
    await deps.uow.asOrg(ctx, async (r) => {
      await r.hsJobs.update(job.id, { externalId: api.id, status: job.status, updatedAt: now });
      for (const it of api.items) {
        const row = byLine.get(it.line_no);
        if (row) await r.lineItems.update(row.id, { hsJobId: job.id, hsItemId: it.id, hsStatus: it.status, hsQuestion: null, hsError: null, hsDetail: null, hsSuggested: null, hsConfidence: null, updatedAt: now });
      }
      await ingest(deps, r, c.orgId, job, api);
    });
    jobIds.push(job.id);
    if (busyApi(api)) {
      pending = true;
      await deps.queue.enqueue("hs-poll", { orgId: c.orgId, userId: c.userId, dossierId, hsJobId: job.id }, { delayMs: HS_POLL_MS });
    }
  }
  await deps.dossiers.publish(c.orgId, dossierId, { type: "dossier.updated" });
  return ok({ jobIds, skipped: skipped.length, pending });
}

/** Dòng hàng chưa gửi được tới HSCodePro: chưa gắn lượt, hoặc gắn lượt còn `pending` (lần trước lỗi/timeout trước khi có mã lượt). */
export async function unsentHsLineIds(deps: DeclarationDeps, c: SysCtx, dossierId: string, rows: LineItemRow[]): Promise<string[]> {
  const open = await deps.uow.asOrg(asCtx(c), (r) => r.hsJobs.openForDossier(c.orgId, dossierId));
  const pending = new Set(open.filter((j) => j.status === "pending").map((j) => j.id));
  return rows.filter((it) => !it.hsConfirmed && it.hsStatus === "queued" && (it.hsJobId === null || pending.has(it.hsJobId))).map((it) => it.id);
}

/** Lượt hết processing và agent đang chờ ở bước tra HS → đánh dấu xong + đẩy lại run-agent. */
async function resumeAgentIfWaiting(deps: DeclarationDeps, c: SysCtx, dossierId: string) {
  const ctx = asCtx(c);
  const open = await deps.uow.asOrg(ctx, (r) => r.hsJobs.openForDossier(c.orgId, dossierId));
  if (open.some((j) => j.status === "processing")) return;
  const run = await deps.uow.asOrg(ctx, (r) => r.agentRuns.latest(c.orgId, dossierId));
  const task = run?.tasks.find((t) => t.id === "HS_LOOKUP");
  if (!run || run.status !== "RUNNING" || task?.status !== "RUNNING") return;
  const rows = await deps.uow.asOrg(ctx, (r) => r.lineItems.list(c.orgId, dossierId));
  const at = deps.clock.now().toISOString();
  const tasks = run.tasks.map((t) => (t.id === "HS_LOOKUP" ? { ...t, status: "DONE" as const, progress: 100, message: `Đã tra ${rows.length}/${rows.length} dòng hàng` } : t));
  const log = [...run.log, ...hsSummaryLogs(rows, at)];
  await deps.uow.asOrg(ctx, (r) => r.agentRuns.update(run.id, { tasks, log }));
  await deps.dossiers.publish(c.orgId, dossierId, { type: "agent.task", taskId: "HS_LOOKUP", status: "DONE", progress: 100, message: tasks.find((t) => t.id === "HS_LOOKUP")!.message });
  await deps.queue.enqueue("run-agent", { orgId: c.orgId, userId: run.startedBy, dossierId, agentRunId: run.id }, { jobId: `run-agent:${run.id}:hs` });
}

/** Job hs-poll: hỏi trạng thái một lượt, ghi vào dòng, hẹn lại khi còn processing. */
export async function pollHsJob(deps: DeclarationDeps, input: SysCtx & { dossierId: string; hsJobId: string }): Promise<Result<{ again: boolean }>> {
  const ctx = asCtx(input);
  const job = await deps.uow.asOrg(ctx, (r) => r.hsJobs.get(input.orgId, input.hsJobId));
  if (!job) return err(domainError("NOT_FOUND", "Không tìm thấy lượt phân loại"));
  if (job.status === "cancelled" || job.status === "completed") return ok({ again: false });
  const api = await deps.hs.get(job.externalId);
  const polls = job.polls + 1;
  const now = deps.clock.now();
  const fresh = await deps.uow.asOrg(ctx, (r) => ingest(deps, r, input.orgId, job, api));
  // Chỉ lượt hỏi có kết quả mới mới ghi (hỏi 3 giây/lần mà chưa xong thì không); chạy lại job → dòng đã completed, không đếm lại.
  if (fresh > 0) await meterSafely(deps.usage, { orgId: input.orgId, dossierId: input.dossierId, provider: "HSCODEPRO", kind: "HS_RESULT", operation: "POLL", quantity: fresh, meta: { externalJobId: job.externalId } });

  const busy = busyApi(api);
  if (busy && polls < HS_MAX_POLLS) {
    await deps.uow.asOrg(ctx, (r) => r.hsJobs.update(job.id, { polls, status: "processing", updatedAt: now }));
    await deps.queue.enqueue("hs-poll", { orgId: input.orgId, userId: input.userId, dossierId: input.dossierId, hsJobId: job.id }, { delayMs: HS_POLL_MS });
    await deps.dossiers.publish(input.orgId, input.dossierId, { type: "dossier.updated" });
    return ok({ again: true });
  }
  await deps.uow.asOrg(ctx, async (r) => {
    if (busy) {
      // Quá thời gian chờ: dòng chưa xong → lỗi TIMEOUT, người khai bấm "Phân loại lại".
      for (const row of await r.lineItems.list(input.orgId, input.dossierId)) {
        if (row.hsJobId === job.id && (row.hsStatus === "queued" || row.hsStatus === "processing")) await r.lineItems.update(row.id, { hsStatus: "failed", hsError: { code: "TIMEOUT", message: "Phân loại quá 15 phút chưa xong" }, updatedAt: now });
      }
    }
    await r.hsJobs.update(job.id, { polls, status: busy ? "completed" : localStatus(api), updatedAt: now });
  });
  await resumeAgentIfWaiting(deps, input, input.dossierId);
  await deps.dossiers.publish(input.orgId, input.dossierId, { type: "dossier.updated" });
  return ok({ again: false });
}

async function loadItem(deps: DeclarationDeps, ctx: Ctx, lineItemId: string) {
  const row = await deps.uow.asOrg(ctx, (r) => r.lineItems.get(ctx.orgId, lineItemId));
  return row ? ok(row) : err(domainError("NOT_FOUND", "Không tìm thấy dòng hàng"));
}
async function view(deps: DeclarationDeps, ctx: Ctx, lineItemId: string): Promise<LineItem> {
  return deps.uow.asOrg(ctx, async (r) => {
    const row = (await r.lineItems.get(ctx.orgId, lineItemId))!;
    return toLineItem(row, await r.suggestions.listForItems([row.id]));
  });
}

/** Người khai trả lời câu hỏi của AI. Chỉ khi dòng đang chờ đúng câu hỏi đó; gửi đi qua job hs-answer. */
export async function answerHsQuestion(deps: DeclarationDeps, ctx: Ctx, lineItemId: string, input: HsAnswerInput): Promise<Result<LineItem>> {
  const allowed = requireRole(ctx, "DECLARANT", "APPROVER", "ADMIN");
  if (!allowed.ok) return allowed;
  const row = await loadItem(deps, ctx, lineItemId);
  if (!row.ok) return row;
  const it = row.value;
  if (it.hsStatus !== "need_info" || it.hsQuestion?.id !== input.questionId) return err(domainError("INVALID_STATE", "Câu hỏi đã được trả lời hoặc không còn hiệu lực – tải lại bảng"));
  const ids = new Set(it.hsQuestion.questions.map((q) => q.id));
  if (input.answers.length !== ids.size || input.answers.some((a) => !ids.has(a.id))) return err(domainError("VALIDATION", "Cần trả lời đủ từng câu hỏi"));
  await deps.uow.asOrg(ctx, (r) => r.lineItems.update(it.id, { hsStatus: "answering", updatedAt: deps.clock.now() }));
  await deps.queue.enqueue("hs-answer", { orgId: ctx.orgId, userId: ctx.userId, dossierId: it.dossierId, lineItemId: it.id, questionId: input.questionId, answers: input.answers }, { jobId: `hs-answer:${it.id}:${deps.idGen.next("job")}` });
  await deps.dossiers.publish(ctx.orgId, it.dossierId, { type: "dossier.updated" });
  return ok(await view(deps, ctx, it.id));
}

/** Job hs-answer: gửi câu trả lời tới HSCodePro rồi poll lại. 409 (đã gửi) bỏ qua; 400 → trả dòng về chờ hỏi kèm lỗi. */
export async function sendHsAnswer(
  deps: DeclarationDeps, input: SysCtx & { dossierId: string; lineItemId: string; questionId: string; answers: HsAnswerInput["answers"] },
): Promise<Result<void>> {
  const ctx = asCtx(input);
  const now = deps.clock.now();
  const found = await deps.uow.asOrg(ctx, async (r) => {
    const row = await r.lineItems.get(input.orgId, input.lineItemId);
    const job = row?.hsJobId ? await r.hsJobs.get(input.orgId, row.hsJobId) : null;
    return row && job && row.hsItemId ? { row, job, itemId: row.hsItemId } : null;
  });
  if (!found) return ok(undefined);
  try {
    await deps.hs.answer(found.job.externalId, found.itemId, { question_id: input.questionId, answers: input.answers.map((a) => ({ id: a.id, selected: a.selected, custom: a.custom })) });
    // HSCodePro nhận câu trả lời → phân loại lại dòng đó: ghi chi phí 1 dòng. 409 (đã gửi ở lần chạy trước) không ghi lại.
    await meterSafely(deps.usage, {
      orgId: input.orgId, dossierId: input.dossierId, provider: "HSCODEPRO", kind: "HS_ANSWER", operation: "ANSWER", quantity: 1,
      dedupeKey: `hscodepro:answer:${found.job.externalId}:${found.itemId}:${input.questionId}`, meta: { externalJobId: found.job.externalId },
    });
  } catch (e) {
    if (!(e instanceof HsApiError) || e.transient) throw e;
    if (e.code !== "INVALID_STATE") {
      await deps.uow.asOrg(ctx, (r) => r.lineItems.update(found.row.id, { hsStatus: "need_info", hsError: { code: e.code, message: e.message }, updatedAt: now }));
      await deps.dossiers.publish(input.orgId, input.dossierId, { type: "dossier.updated" });
      return ok(undefined);
    }
  }
  await deps.uow.asOrg(ctx, (r) => r.hsJobs.update(found.job.id, { status: "processing", polls: 0, updatedAt: now }));
  await deps.queue.enqueue("hs-poll", { orgId: input.orgId, userId: input.userId, dossierId: input.dossierId, hsJobId: found.job.id }, { delayMs: HS_POLL_MS });
  return ok(undefined);
}

/** Phân loại lại một dòng (sau lỗi/hủy, hoặc người khai bổ sung mô tả/xuất xứ): lượt mới chỉ chứa dòng đó, chạy trong worker. */
export async function reclassifyHs(deps: DeclarationDeps, ctx: Ctx, lineItemId: string, input: HsReclassifyInput): Promise<Result<LineItem>> {
  const allowed = requireRole(ctx, "DECLARANT", "APPROVER", "ADMIN");
  if (!allowed.ok) return allowed;
  const row = await loadItem(deps, ctx, lineItemId);
  if (!row.ok) return row;
  const it = row.value;
  if (it.hsConfirmed) return err(domainError("INVALID_STATE", "Dòng đã xác nhận mã HS – bỏ xác nhận trước khi phân loại lại"));
  const dossier = await deps.dossiers.get(ctx.orgId, it.dossierId);
  if (!dossier) return err(domainError("NOT_FOUND", "Không tìm thấy hồ sơ"));
  if (LOCKED.includes(dossier.status)) return err(domainError("DOSSIER_LOCKED", "Tờ khai đã duyệt/truyền – mở lại tờ khai trước"));
  // Gỡ dòng khỏi lượt cũ ngay (kết quả cũ về muộn không ghi đè), rồi để worker tạo lượt mới.
  const originChanged = !!input.origin && input.origin !== it.origin;
  await deps.uow.asOrg(ctx, (r) => r.lineItems.update(it.id, { ...(originChanged ? { origin: input.origin! } : {}), hsStatus: "queued", hsError: null, hsQuestion: null, hsJobId: null, hsItemId: null, updatedAt: deps.clock.now() }));
  if (originChanged) {
    // Xuất xứ là dữ liệu tờ khai: ghi field_audit (bất biến 6) và dựng lại tờ khai nháp.
    await deps.audit.append(ctx, { dossierId: it.dossierId, key: `origin:${it.lineNo}`, oldValue: it.origin, newValue: input.origin!, source: "DECL_EDIT" });
    const rebuilt = await rebuildDraft(deps, ctx, it.dossierId);
    if (!rebuilt.ok) return rebuilt;
  }
  await deps.queue.enqueue("hs-reclassify", { orgId: ctx.orgId, userId: ctx.userId, dossierId: it.dossierId, lineItemId: it.id, ...(input.extraDescription ? { extraDescription: input.extraDescription } : {}) });
  await deps.dossiers.publish(ctx.orgId, it.dossierId, { type: "dossier.updated" });
  return ok(await view(deps, ctx, it.id));
}

/** Job hs-reclassify: tạo lượt mới cho một dòng. */
export async function runHsReclassify(deps: DeclarationDeps, input: SysCtx & { dossierId: string; lineItemId: string; extraDescription?: string }): Promise<Result<{ pending: boolean }>> {
  const r = await startHsClassification(deps, input, input.dossierId, { lineItemIds: [input.lineItemId], extra: { [input.lineItemId]: input.extraDescription }, operation: "RECLASSIFY" });
  return r.ok ? ok({ pending: r.value.pending }) : r;
}

/**
 * Worker hết lượt thử cho hs-poll / hs-answer / hs-reclassify: không để dòng quay mãi.
 * Lượt → completed; dòng còn chờ/đang chạy/đang gửi → failed POLL_FAILED (hiện nút "Phân loại lại"); agent đang chờ thì đi tiếp.
 */
export async function failHsWork(deps: DeclarationDeps, input: SysCtx & { dossierId: string; hsJobId?: string; lineItemId?: string; error: string }): Promise<Result<void>> {
  const ctx = asCtx(input);
  const now = deps.clock.now();
  const busy = ["queued", "processing", "answering"];
  await deps.uow.asOrg(ctx, async (r) => {
    const rows = await r.lineItems.list(input.orgId, input.dossierId);
    const line = input.lineItemId ? rows.find((x) => x.id === input.lineItemId) : undefined;
    const jobId = input.hsJobId ?? line?.hsJobId ?? null;
    if (jobId) await r.hsJobs.update(jobId, { status: "completed", updatedAt: now });
    for (const row of rows) {
      const hit = (jobId && row.hsJobId === jobId) || row.id === input.lineItemId;
      if (hit && busy.includes(row.hsStatus)) await r.lineItems.update(row.id, { hsStatus: "failed", hsError: { code: "POLL_FAILED", message: `Không nhận được kết quả từ HSCodePro (${input.error.slice(0, 160)})` }, updatedAt: now });
    }
  });
  await resumeAgentIfWaiting(deps, input, input.dossierId);
  await deps.dossiers.publish(input.orgId, input.dossierId, { type: "dossier.updated" });
  return ok(undefined);
}
