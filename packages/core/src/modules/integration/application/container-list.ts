// Danh sách container khai trước (ADR 0014, spec §2.3): sửa bảng (field_audit từng ô), điền lại từ chứng từ, gửi (outbox CONT_LIST + job customs-send).
import { checkContainerList, containerListRequired, normalizeContainerNo, type ContainerListIssue, type ContainerListRow, type KvgsView, type SaveContainerListInput } from "@kb/contracts";
import { requireRole, type Ctx } from "../../../shared/ctx.js";
import { domainError, reasonError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import type { ContainerListRecord, CustomsDeps, OutboxRow } from "./customs-ports.js";
import { isDuplicate, buildView, checkOperation, KVGS_ROLES, loadScope, preload, prefillRows, type KvgsScope } from "./kvgs.js";

const FIELDS = ["billNo", "containerNo", "sealNo", "note"] as const;
const describeIssues = (issues: ContainerListIssue[]) => issues.map((i) => `${i.row === 0 ? "bảng" : `dòng ${i.row}`} ${i.field} ${i.code}`).join(", ");
const clean = (rows: ContainerListRow[]): ContainerListRow[] => rows.map((r) => ({ ...r, containerNo: normalizeContainerNo(r.containerNo) }));

/** Ô đổi giữa hai bảng (theo vị trí dòng): khóa `cont:<nhánh>:<dòng>:<trường>`. Dòng thêm/bớt tính từng ô khác rỗng. */
export function diffCells(branch: number, before: ContainerListRow[], after: ContainerListRow[]) {
  const out: { key: string; oldValue: string; newValue: string }[] = [];
  for (let i = 0; i < Math.max(before.length, after.length); i++) {
    for (const f of FIELDS) {
      const oldValue = before[i]?.[f] ?? "";
      const newValue = after[i]?.[f] ?? "";
      if (oldValue !== newValue) out.push({ key: `cont:${branch}:${i + 1}:${f}`, oldValue, newValue });
    }
  }
  return out;
}

const newRecord = (deps: CustomsDeps, ctx: Ctx, scope: KvgsScope, attempt: number, rows: ContainerListRow[]): ContainerListRecord => {
  const now = deps.clock.now();
  return { id: deps.idGen.next("cls"), orgId: ctx.orgId, dossierId: scope.dossier.id, branch: scope.branch, attempt, rows, status: "DRAFT", refId: null, receiptNo: null, receiptDate: null, errors: null, sentRows: null, sentBy: null, sentAt: null, createdAt: now, updatedAt: now };
};

/** Phần chung của lưu / điền lại: ghi `rows` vào bản đang sửa (SENDING → khóa; ACCEPTED → lần khai mới), ghi field_audit từng ô đổi. */
async function writeRows(deps: CustomsDeps, ctx: Ctx, dossierId: string, branch: number, rowsOf: () => Promise<ContainerListRow[]>): Promise<Result<KvgsView>> {
  const allowed = requireRole(ctx, ...KVGS_ROLES);
  if (!allowed.ok) return allowed;
  const pre = await preload(deps, ctx, dossierId);
  if (!pre.ok) return pre;
  const { dossier, snap } = pre.value;
  const incoming = await rowsOf();
  const done = await deps.uow.asOrg(ctx, async (r) => {
    const scope = await loadScope(ctx, dossier, branch, r);
    if (!scope.ok) return scope;
    if (!containerListRequired(scope.value.dossier.direction, scope.value.dossier.transportMode)) return err(reasonError("INVALID_STATE", "CONT_LIST_NOT_APPLICABLE"));
    const cur = await r.containerLists.latest(ctx.orgId, dossierId, branch);
    if (cur?.status === "SENDING") return err(reasonError("INVALID_STATE", "CONT_LIST_LOCKED"));
    const rows = clean(incoming);
    const changes = diffCells(branch, cur?.rows ?? [], rows);
    const now = deps.clock.now();
    let list: ContainerListRecord;
    if (!cur || cur.status === "ACCEPTED") {
      list = newRecord(deps, ctx, scope.value, (cur?.attempt ?? 0) + 1, rows);
      try {
        await r.containerLists.insert(list);
      } catch (e) {
        if (isDuplicate(e)) return err(reasonError("INVALID_STATE", "KVGS_ALREADY_SENDING"));
        throw e;
      }
    } else {
      // DRAFT / REJECTED / NO_RESPONSE: sửa tại chỗ (lỗi cũ không còn đúng với nội dung mới).
      const patch = { rows, ...(cur.status === "DRAFT" ? {} : { status: "DRAFT" as const, errors: null }), updatedAt: now };
      await r.containerLists.update(ctx.orgId, cur.id, patch);
      list = { ...cur, ...patch };
    }
    // Bất biến 6: mỗi ô người dùng đổi → field_audit append-only, cùng transaction với lệnh lưu bảng.
    await r.fieldAudit.append(ctx, now, changes.map((c) => ({ dossierId, ...c, source: "CONT_LIST_EDIT" as const })));
    return ok({ scope: scope.value, list });
  });
  if (!done.ok) return done;
  return deps.uow.asOrg(ctx, async (r) => ok(await buildView(ctx, snap, done.value.scope, r, done.value.list, null)));
}

/** Lưu bảng người dùng sửa. DRAFT/REJECTED/NO_RESPONSE sửa tại chỗ; ACCEPTED → lần khai mới (attempt + 1); SENDING → CONT_LIST_LOCKED. */
export const saveContainerList = (deps: CustomsDeps, ctx: Ctx, dossierId: string, branch: number, input: SaveContainerListInput) => writeRows(deps, ctx, dossierId, branch, async () => input.rows);

/** Ghi đè bảng bằng dữ liệu đọc lại từ chứng từ (cùng quy tắc khóa và audit như lưu). */
export const refillContainerList = (deps: CustomsDeps, ctx: Ctx, dossierId: string, branch: number) => writeRows(deps, ctx, dossierId, branch, () => prefillRows(deps, ctx.orgId, dossierId));

/**
 * Gửi danh sách container: đang SENDING → KVGS_ALREADY_SENDING; điều kiện luồng (customs-flow); bảng không hợp lệ → CONT_LIST_INVALID.
 * Một giao dịch: status SENDING + sentRows + outbox `cont:<listId>:a<attempt>`; rồi xếp job customs-send. Gửi lại bản đã từng gửi
 * (REJECTED/NO_RESPONSE) → lần khai mới (attempt + 1) để khóa idempotency không trùng.
 */
export async function sendContainerList(deps: CustomsDeps, ctx: Ctx, dossierId: string, branch: number): Promise<Result<KvgsView>> {
  const allowed = requireRole(ctx, ...KVGS_ROLES);
  if (!allowed.ok) return allowed;
  const pre = await preload(deps, ctx, dossierId);
  if (!pre.ok) return pre;
  const { dossier, snap } = pre.value;
  const sent = await deps.uow.asOrg(ctx, async (r) => {
    const scope = await loadScope(ctx, dossier, branch, r);
    if (!scope.ok) return scope;
    const cur = await r.containerLists.latest(ctx.orgId, dossierId, branch);
    // SENDING trước điều kiện luồng: outbox đang chờ làm availability báo "đang chờ" chung chung.
    if (cur?.status === "SENDING") return err(reasonError("INVALID_STATE", "KVGS_ALREADY_SENDING"));
    const blocked = await checkOperation(r, ctx, scope.value, "CONT_LIST");
    if (blocked) return err(blocked);
    if (cur?.status === "ACCEPTED") return err(reasonError("INVALID_STATE", "CONT_LIST_LOCKED"));
    const rows = cur?.rows ?? [];
    const issues = checkContainerList(rows);
    if (issues.length) return err(reasonError("VALIDATION", "CONT_LIST_INVALID", { issues: describeIssues(issues) }, { issues }));
    if (!snap) return err(domainError("NO_DECLARATION", "Chưa dựng tờ khai"));
    const now = deps.clock.now();
    const fields = { status: "SENDING" as const, sentRows: rows, sentBy: ctx.userId as string, sentAt: now, errors: null, updatedAt: now };
    let list: ContainerListRecord;
    try {
      if (cur && cur.sentAt === null) {
        await r.containerLists.update(ctx.orgId, cur.id, fields);
        list = { ...cur, ...fields };
      } else {
        list = { ...newRecord(deps, ctx, scope.value, (cur?.attempt ?? 0) + 1, rows), ...fields };
        await r.containerLists.insert(list);
      }
      const outbox: OutboxRow = {
        id: deps.idGen.next("msg"), orgId: ctx.orgId, dossierId, branch, declarationId: snap.declarationId, operation: "CONT_LIST", idempotencyKey: `cont:${list.id}:a${list.attempt}`,
        payload: { listId: list.id }, status: "PENDING", attempts: 0, lastError: null, nextAttemptAt: null, createdAt: now, updatedAt: now,
      };
      await r.outbox.insert(outbox);
      return ok({ outboxId: outbox.id, scope: scope.value, list });
    } catch (e) {
      if (isDuplicate(e)) return err(reasonError("INVALID_STATE", "KVGS_ALREADY_SENDING"));
      throw e;
    }
  });
  if (!sent.ok) return sent;
  await deps.queue.enqueue("customs-send", { orgId: ctx.orgId, userId: ctx.userId, outboxId: sent.value.outboxId }, { jobId: `customs-send:${sent.value.outboxId}` });
  await deps.dossiers.publish(ctx.orgId, dossierId, { type: "customs.message" });
  return deps.uow.asOrg(ctx, async (r) => ok(await buildView(ctx, snap, sent.value.scope, r, sent.value.list, null)));
}
