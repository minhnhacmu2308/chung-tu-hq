// AI Agent: tra HS → ánh xạ → dựng tờ khai → số hóa. Worker chạy `runAgent`; web gọi start/get.
import type { AgentMode, AgentRunView, AgentTaskId, Shipment } from "@kb/contracts";
import { profileFor } from "./declaration-profile.js";
import { requireRole, type Ctx } from "../../../shared/ctx.js";
import { domainError } from "../../../shared/errors.js";
import { asOrgId, asUserId } from "../../../shared/ids.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { computeBuilt, currenciesOf, exchangeFor, invoiceRate, mergeUserEdits } from "./_rebuild.js";
import { vnDate } from "../domain/mapping/types.js";
import { loadDossier, syncLineItems, TASKS_BY_MODE, toAgentRunView } from "./_dto.js";
import { hsSummaryLogs, startHsClassification } from "./hs-classification.js";
import type { AgentLog, AgentRunRow, AgentTask, DeclarationDeps } from "./ports.js";

export async function startAgentRun(deps: DeclarationDeps, ctx: Ctx, dossierId: string, mode: AgentMode): Promise<Result<AgentRunView>> {
  const allowed = requireRole(ctx, "DECLARANT", "APPROVER", "ADMIN");
  if (!allowed.ok) return allowed;
  const d = await loadDossier(deps, ctx.orgId, dossierId);
  if (!d.ok) return d;
  if (d.value.status === "SUBMITTED" || d.value.status === "CLEARED" || d.value.status === "CANCELLED") return err(domainError("DOSSIER_LOCKED", "Hồ sơ đã truyền hoặc đã hủy"));
  if (d.value.status === "APPROVED") return err(domainError("DOSSIER_LOCKED", "Tờ khai đã được duyệt – mở lại tờ khai trước khi chạy lại agent"));
  const shipment = await deps.shipments.latest(ctx.orgId, dossierId);
  if (!shipment || shipment.items.length === 0) return err(domainError("NO_ITEMS", "Chưa có dòng hàng – hoàn tất bước OCR & kiểm tra trước"));
  const now = deps.clock.now();
  const run = await deps.uow.asOrg(ctx, async (r) => {
    await syncLineItems(deps, r, ctx.orgId, dossierId, shipment);
    const prev = await r.agentRuns.latest(ctx.orgId, dossierId);
    if (prev?.status === "RUNNING") await r.agentRuns.update(prev.id, { status: "CANCELLED", finishedAt: now });
    const row: AgentRunRow = {
      id: deps.idGen.next("run"), orgId: ctx.orgId, dossierId, mode, status: "RUNNING", startedBy: ctx.userId, startedAt: now, finishedAt: null,
      tasks: TASKS_BY_MODE[mode].map((id) => ({ id, status: "PENDING", progress: 0, message: "Đang chờ" })), log: [],
    };
    await r.agentRuns.insert(row);
    return row;
  });
  await deps.dossiers.update(ctx.orgId, dossierId, { status: "PROCESSING", step: "agent" });
  await deps.queue.enqueue("run-agent", { orgId: ctx.orgId, userId: ctx.userId, dossierId, agentRunId: run.id }, { jobId: `run-agent:${run.id}` });
  await deps.dossiers.publish(ctx.orgId, dossierId, { type: "dossier.updated" });
  return ok(toAgentRunView(run));
}

export async function getAgentRun(deps: DeclarationDeps, ctx: Ctx, dossierId: string): Promise<Result<AgentRunView | null>> {
  const d = await loadDossier(deps, ctx.orgId, dossierId);
  if (!d.ok) return d;
  const run = await deps.uow.asOrg(ctx, (r) => r.agentRuns.latest(ctx.orgId, dossierId));
  return ok(run ? toAgentRunView(run) : null);
}

export type RunAgentInput = { orgId: string; userId: string; dossierId: string; agentRunId: string };

/**
 * Worker. Idempotent: task đã DONE không chạy lại; run không còn RUNNING → bỏ qua.
 * Tra HS qua HSCodePro: dòng cần hỏi lại / lỗi không chặn; lỗi tạm (5xx, 429) ném ra để BullMQ retry.
 * Lượt còn processing → dừng ở HS_LOOKUP (RUNNING); hs-poll đánh dấu xong và đẩy lại run-agent.
 */
export async function runAgent(deps: DeclarationDeps, input: RunAgentInput): Promise<Result<AgentRunView>> {
  const ctx = { orgId: asOrgId(input.orgId), userId: asUserId(input.userId) };
  const run = await deps.uow.asOrg(ctx, (r) => r.agentRuns.get(input.orgId, input.agentRunId));
  if (!run) return err(domainError("NOT_FOUND", "Không tìm thấy lần chạy"));
  if (run.status !== "RUNNING") return ok(toAgentRunView(run));
  const dossier = await deps.dossiers.get(input.orgId, input.dossierId);
  if (!dossier) return err(domainError("NOT_FOUND", "Không tìm thấy hồ sơ"));
  const shipment = await deps.shipments.latest(input.orgId, input.dossierId);
  if (!shipment) return err(domainError("NOT_READY", "Chưa có dữ liệu lô hàng"));
  const org = await deps.org.get(input.orgId);

  const tasks: AgentTask[] = run.tasks.map((t) => ({ ...t }));
  const log: AgentLog[] = [...run.log];
  const at = () => deps.clock.now().toISOString();
  const say = (text: string, tone: AgentLog["tone"] = "info") => void log.push({ at: at(), text, tone });
  const save = (id: string) => deps.uow.asOrg(ctx, (r) => r.agentRuns.update(id, { tasks, log }));
  const task = (id: AgentTaskId) => tasks.find((t) => t.id === id)!;
  const setTask = async (id: AgentTaskId, status: AgentTask["status"], progress: number, message: string) => {
    Object.assign(task(id), { status, progress, message });
    await save(run.id);
    await deps.dossiers.publish(input.orgId, input.dossierId, { type: "agent.task", taskId: id, status, progress, message });
  };

  try {
    for (const t of tasks) {
      if (t.status === "DONE") continue;
      if (t.id === "HS_LOOKUP") {
        const open = await deps.uow.asOrg(ctx, (r) => r.hsJobs.openForDossier(input.orgId, input.dossierId));
        const waiting = open.some((j) => j.status === "processing");
        const items = await deps.uow.asOrg(ctx, (r) => r.lineItems.list(input.orgId, input.dossierId));
        let started: Result<{ pending: boolean }>;
        if (t.status === "RUNNING") {
          // Chạy lại (BullMQ thử lại / hs-poll đẩy lại): gửi nốt dòng chưa có lượt (lỗi giữa chừng lần trước); còn lượt đang chạy → chờ hs-poll.
          const unsent = items.filter((it) => !it.hsConfirmed && it.hsJobId === null && it.hsStatus === "queued").map((it) => it.id);
          started = unsent.length ? await startHsClassification(deps, ctx, input.dossierId, { lineItemIds: unsent }) : ok({ pending: false });
        } else {
          const todo = items.filter((it) => !it.hsConfirmed);
          await setTask("HS_LOOKUP", "RUNNING", 10, `Đang gửi ${todo.length}/${items.length} dòng hàng`);
          say(`${deps.hs.name} – bắt đầu tra ${todo.length} dòng hàng`);
          for (const it of items) if (it.hsConfirmed) say(`Dòng ${it.lineNo}: giữ mã đã xác nhận ${it.hsConfirmed}`);
          started = todo.length ? await startHsClassification(deps, ctx, input.dossierId) : ok({ pending: false });
        }
        if (!started.ok) return started;
        if (started.value.pending || (t.status === "RUNNING" && waiting)) {
          say("Đã gửi HSCodePro – đang chờ kết quả phân loại (AI có thể hỏi lại người khai)");
          await setTask("HS_LOOKUP", "RUNNING", 30, "Đang chờ kết quả phân loại HS");
          return ok(toAgentRunView({ ...run, tasks, log }));
        }
        const after = await deps.uow.asOrg(ctx, (r) => r.lineItems.list(input.orgId, input.dossierId));
        log.push(...hsSummaryLogs(after, at()));
        await setTask("HS_LOOKUP", "DONE", 100, `Đã tra ${items.length}/${items.length} dòng hàng`);
      } else if (t.id === "MAPPING") {
        await setTask("MAPPING", "RUNNING", 10, `Đang áp quy tắc ánh xạ ${dossier.direction === "NK" ? "IDA" : "EDA"}`);
        say(`Áp quy tắc ánh xạ tờ khai ${dossier.direction === "NK" ? "nhập khẩu (IDA)" : "xuất khẩu (EDA)"} – code + cấu hình, không dùng AI`);
        if (dossier.direction === "NK") say("Người nhập khẩu lấy theo MST doanh nghiệp, không theo tên tiếng Anh trên invoice");
        await setTask("MAPPING", "DONE", 100, "Đã ánh xạ chỉ tiêu");
      } else if (t.id === "BUILD_DECLARATION") {
        await setTask("BUILD_DECLARATION", "RUNNING", 20, "Đang tính trị giá tính thuế");
        say("Tính trị giá tính thuế, cộng khoản điều chỉnh theo Incoterm");
        const built = await deps.uow.asOrg(ctx, async (r) => {
          const items = await r.lineItems.list(input.orgId, input.dossierId);
          const exchange = await exchangeFor(r, currenciesOf(shipment, dossier), vnDate(deps.clock.now()));
          const b = computeBuilt(deps, shipment, dossier, org, items, exchange, await profileFor(r, input.orgId, dossier.direction));
          const prev = await r.declarations.latest(input.orgId, input.dossierId);
          if (prev && prev.status !== "DRAFT") return { b, skipped: true as const, exchange };
          const now = deps.clock.now();
          await r.declarations.insert({
            id: deps.idGen.next("dec"), orgId: input.orgId, dossierId: input.dossierId, kind: b.kind, version: (prev?.version ?? 0) + 1, status: "DRAFT",
            fields: mergeUserEdits(b.fields, prev?.fields), exchangeRate: invoiceRate(exchange, shipment, dossier), exchangeRateDate: exchange.date, customsValueVnd: b.valuation.customsValueVnd,
            valueAdjustments: b.adjustments, estImportDutyVnd: b.taxes.importDutyVnd, estVatVnd: b.taxes.vatVnd, approvedBy: null, approvedAt: null, createdAt: now, updatedAt: now,
          });
          return { b, skipped: false as const, exchange };
        });
        for (const n of built.b.notes) say(n, "warning");
        if (built.exchange.missing.length) say(`Chưa có tỷ giá tính thuế cho ${built.exchange.missing.join(", ")} – nhập ở Quản trị hệ thống`, "warning");
        if (built.skipped) say("Tờ khai đã được duyệt/truyền – không dựng lại", "warning");
        else say(`Tờ khai nháp đã sẵn sàng (${Object.keys(built.b.fields).length} chỉ tiêu, ${built.b.suspectCount} cần kiểm tra) – chờ xác nhận mã HS và phê duyệt`, "success");
        await setTask("BUILD_DECLARATION", "DONE", 100, "Đã dựng tờ khai nháp");
      } else if (t.id === "DIGITIZE") {
        const docs = await deps.dossiers.documents(input.orgId, input.dossierId);
        await setTask("DIGITIZE", "RUNNING", 10, "Đang tạo dữ liệu số (JSON)");
        say(`Số hóa ${docs.length} chứng từ để đính kèm HYS`);
        const extractions = await deps.shipments.extractions(input.orgId, input.dossierId);
        for (const [i, doc] of docs.entries()) {
          const ex = extractions.find((e) => e.documentId === doc.id);
          const body = Buffer.from(JSON.stringify({ documentId: doc.id, kind: doc.kind, fileName: doc.fileName, data: ex?.raw ?? null, digitizedAt: at() }, null, 2));
          await deps.dossiers.putFile(`orgs/${input.orgId}/dossiers/${input.dossierId}/digitized/${doc.id}.json`, body, "application/json");
          await setTask("DIGITIZE", "RUNNING", Math.round(((i + 1) / docs.length) * 100), `Đã số hóa ${i + 1}/${docs.length}`);
        }
        say("Dữ liệu số hóa đã lưu", "success");
        await setTask("DIGITIZE", "DONE", 100, `Đã số hóa ${docs.length} chứng từ`);
      }
    }
  } catch (e) {
    // Lỗi tạm: ghi nhật ký, giữ RUNNING để BullMQ retry (task DONE không chạy lại).
    say(`Lỗi tạm thời: ${e instanceof Error ? e.message : String(e)} – sẽ thử lại`, "warning");
    await save(run.id);
    throw e;
  }

  const finishedAt = deps.clock.now();
  const done: AgentRunRow = { ...run, tasks, log, status: "DONE", finishedAt };
  await deps.uow.asOrg(ctx, (r) => r.agentRuns.update(run.id, { status: "DONE", tasks, log, finishedAt }));
  if (dossier.status === "PROCESSING" && dossier.step === "agent") await deps.dossiers.update(input.orgId, input.dossierId, { status: "NEEDS_REVIEW" });
  await deps.dossiers.publish(input.orgId, input.dossierId, { type: "dossier.updated" });
  await deps.notify?.notify(input.orgId, { dossierOwnerOf: input.dossierId }, { title: `AI Agent đã xử lý xong ${dossier.code}`, body: run.mode === "DIGITIZE" ? "Dữ liệu số hóa đã sẵn sàng." : "Tờ khai nháp đã dựng – xác nhận mã HS rồi chuyển Review.", href: `/dossiers/${input.dossierId}?step=agent` });
  return ok(toAgentRunView(done));
}
