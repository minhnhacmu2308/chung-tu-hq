// Xác nhận tờ khai đã hủy (spec trạng thái hồ sơ §6).
import type { ConfirmCancelledInput } from "@kb/contracts";
import { beforeEach, describe, expect, it } from "vitest";
import { RecordingOrgAudit } from "../../../../shared/audit.js";
import type { RecordingNotifier } from "../../../../shared/notifier.js";
import { stageOf } from "../../domain/state-machine.js";
import { confirmDeclarationCancelled } from "../confirm-cancelled.js";
import { getSubmission } from "../get-submission.js";
import { performOperation } from "../perform-operation.js";
import { pollStatus } from "../poll-status.js";
import { processOutbox } from "../process-outbox.js";
import { unwrap } from "../../../../shared/result.js";
import { approver, D, declarant, makeHarness, ORG, other, seed, T, type Harness } from "./_sheets-harness.js";

let h: Harness;
let audit: RecordingOrgAudit;
beforeEach(() => {
  h = makeHarness();
  audit = new RecordingOrgAudit();
  h.deps.orgAudit = audit;
});
const input = (p: Partial<ConfirmCancelledInput> = {}): ConfirmCancelledInput => ({ branch: 1, reason: "H01", date: "2026-10-20", ...p });
const cancel = (p: Partial<ConfirmCancelledInput> = {}, ctx = approver) => confirmDeclarationCancelled(h.deps, ctx, D, input(p));
const errOf = (r: Awaited<ReturnType<typeof cancel>>) => (r.ok ? null : r.error);
const sheet = () => h.uow.data.results[0]!;

describe("confirmDeclarationCancelled", () => {
  it("cancel_ok_sets_stage_and_audit", async () => {
    seed(h, 1, "PRE_DECLARED");
    expect((await cancel({ docNo: "CV-1", note: "ghi chú" })).ok).toBe(true);
    expect(stageOf(sheet())).toBe("CANCELLED");
    expect(sheet().state).toBe("REJECTED");
    expect(sheet().raw?.cancellation).toMatchObject({ reason: "H01", date: "2026-10-20", docNo: "CV-1", note: "ghi chú", by: "usr_duyet" });
    expect(h.uow.data.messages).toHaveLength(1);
    expect(h.uow.data.messages[0]).toMatchObject({ orgId: ORG, direction: "IN", result: "OK", branch: 1 });
    expect(h.uow.data.messages[0]!.summary).toContain("đã hủy");
    expect(audit.entries.filter((e) => e.action === "DECLARATION_CANCEL_CONFIRMED")).toHaveLength(1);
    expect(audit.entries[0]!.detail).toMatchObject({ branch: 1, declarationNo: "104000000001", reason: "H01", date: "2026-10-20" });
    expect((h.deps.notify as RecordingNotifier).sent).toHaveLength(1);
  });

  it("cancel_requires_number", async () => {
    seed(h, 1, "NOT_SENT");
    sheet().declarationNo = null;
    const e = errOf(await cancel());
    expect(e).toMatchObject({ code: "INVALID_STATE", reason: "CANCEL_NOT_ALLOWED" });
    expect(stageOf(sheet())).toBe("NOT_SENT");
  });

  it.each(["CLEARED", "POST_EDITING", "REJECTED"])("cancel_rejects_cleared (%s)", async (stage) => {
    seed(h, 1, stage);
    expect(errOf(await cancel())).toMatchObject({ code: "INVALID_STATE", reason: "CANCEL_NOT_ALLOWED" });
    expect(stageOf(sheet())).toBe(stage);
    expect(h.uow.data.messages).toHaveLength(0);
  });

  it("cancel_role_declarant_forbidden", async () => {
    seed(h, 1, "PRE_DECLARED");
    expect(errOf(await cancel({}, declarant))?.code).toBe("FORBIDDEN");
    expect(stageOf(sheet())).toBe("PRE_DECLARED");
  });

  it("cancel_idempotent", async () => {
    seed(h, 1, "DECLARED");
    expect((await cancel()).ok).toBe(true);
    expect((await cancel()).ok).toBe(true);
    expect(h.uow.data.messages).toHaveLength(1);
    expect(audit.entries).toHaveLength(1);
  });

  it("cancel_unknown_reason", async () => {
    seed(h, 1, "PRE_DECLARED");
    expect(errOf(await cancel({ reason: "ZZZ" }))?.code).toBe("VALIDATION");
    expect(stageOf(sheet())).toBe("PRE_DECLARED");
  });

  it("cancel_other_org_not_found", async () => {
    seed(h, 1, "PRE_DECLARED");
    expect(errOf(await cancel({}, other))?.code).toBe("NOT_FOUND");
    expect(stageOf(sheet())).toBe("PRE_DECLARED");
  });
});

describe("confirmDeclarationCancelled – đọc khóa dòng, gọi lại", () => {
  // In-memory không mô phỏng đua thật; khóa thật là SELECT … FOR UPDATE ở drizzle-customs-uow (results.getForUpdate).
  it("cancel_second_call_changes_nothing_but_resyncs", async () => {
    seed(h, 1, "PRE_DECLARED");
    await cancel();
    const snap = () => ({ m: h.uow.data.messages.length, a: audit.entries.length, n: (h.deps.notify as RecordingNotifier).sent.length });
    const before = snap();
    expect(before).toEqual({ m: 1, a: 1, n: 1 });
    expect((await cancel()).ok).toBe(true);
    expect(snap()).toEqual(before);
  });
});

describe("confirmDeclarationCancelled – hồ sơ đã hủy, phát sự kiện", () => {
  it("cancel_dossier_cancelled_refused", async () => {
    seed(h, 1, "PRE_DECLARED");
    h.dossiers.rows[0]!.status = "CANCELLED";
    expect(errOf(await cancel())).toMatchObject({ code: "INVALID_STATE", reason: "CANCEL_NOT_ALLOWED" });
    expect(stageOf(sheet())).toBe("PRE_DECLARED");
  });
  it("submission_exposes_cancellation", async () => {
    seed(h, 1, "DECLARED");
    expect(unwrap(await getSubmission(h.deps, approver, D)).branches[0]!.cancellation).toBeUndefined();
    await cancel({ docNo: "CV-1", note: "nội bộ" });
    const b = unwrap(await getSubmission(h.deps, approver, D)).branches[0]!;
    expect(b.cancellation).toEqual({ reason: "H01", date: "2026-10-20", docNo: "CV-1" });
  });
  it("cancel_publishes_customs_message", async () => {
    seed(h, 1, "PRE_DECLARED");
    await cancel();
    expect(h.dossiers.events).toContainEqual({ type: "customs.message" });
  });
});

describe("tờ đang gửi / kết quả về muộn sau khi hủy", () => {
  const cancelSheet = (branch = 1) => {
    const r = h.uow.data.results.find((x) => x.branch === branch)!;
    Object.assign(r, { state: "REJECTED", raw: { ...(r.raw ?? {}), stage: "CANCELLED" } });
  };
  it("cancel_rejected_while_outbox_pending", async () => {
    seed(h, 1, "PRE_DECLARED");
    h.uow.data.outbox.push({
      id: "ob_1", orgId: ORG, dossierId: D, branch: 1, declarationId: "dec_1", operation: "IDC", idempotencyKey: `${D}:IDC:b1`,
      payload: {}, status: "PENDING", attempts: 1, lastError: null, nextAttemptAt: null, createdAt: T, updatedAt: T,
    });
    expect(errOf(await cancel())).toMatchObject({ code: "INVALID_STATE", reason: "DECLARATION_SENDING" });
    expect(stageOf(sheet())).toBe("PRE_DECLARED");
    expect(h.uow.data.messages).toHaveLength(0);
  });
  it("late_outbox_result_keeps_cancelled", async () => {
    seed(h, 1, "PRE_DECLARED");
    h.dossiers.rows[0]!.status = "SUBMITTED";
    h.decls.status = "SUBMITTED";
    unwrap(await performOperation(h.deps, declarant, D, "IDC"));
    const ob = h.uow.data.outbox.find((o) => o.operation === "IDC")!;
    const declare = h.deps.gateway.declare.bind(h.deps.gateway);
    // Hủy được ghi nhận trong lúc IDC đang chờ Hải quan trả lời (đua).
    h.deps.gateway.declare = async (...a) => { cancelSheet(); return declare(...a); };
    unwrap(await processOutbox(h.deps, { orgId: ORG, userId: "usr_chau", outboxId: ob.id }));
    expect(stageOf(sheet())).toBe("CANCELLED");
    expect(sheet().channel).toBeNull();
    expect(h.uow.data.outbox.find((o) => o.id === ob.id)!.status).toBe("SENT");
    expect(h.queue.jobs.filter((j) => j.name === "customs-poll")).toHaveLength(0);
  });
  it("late_poll_result_keeps_cancelled", async () => {
    seed(h, 1, "DECLARED");
    const query = h.deps.gateway.queryStatus.bind(h.deps.gateway);
    h.deps.gateway.queryStatus = async (...a) => { cancelSheet(); return { ...(await query(...a)), cleared: true }; };
    expect(unwrap(await pollStatus(h.deps, { orgId: ORG, userId: "usr_chau", dossierId: D, attempt: 1 }))).toEqual({ done: true, cleared: false });
    expect(stageOf(sheet())).toBe("CANCELLED");
    expect(sheet().clearanceStatus).toBe("WAITING");
  });
  it("late_query_now_keeps_cancelled", async () => {
    seed(h, 1, "DECLARED");
    h.dossiers.rows[0]!.status = "SUBMITTED";
    h.decls.status = "SUBMITTED";
    const query = h.deps.gateway.queryStatus.bind(h.deps.gateway);
    h.deps.gateway.queryStatus = async (...a) => { cancelSheet(); return { ...(await query(...a)), cleared: true }; };
    unwrap(await performOperation(h.deps, declarant, D, "IID"));
    expect(stageOf(sheet())).toBe("CANCELLED");
  });
});
