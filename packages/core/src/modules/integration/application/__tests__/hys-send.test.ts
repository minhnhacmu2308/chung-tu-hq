import { beforeEach, describe, expect, it } from "vitest";
import { fixedClock } from "../../../../shared/clock.js";
import { RecordingNotifier } from "../../../../shared/notifier.js";
import type { ServiceUsage } from "../../../../shared/usage.js";
import { createHysSubmission, updateHysSubmission } from "../hys-submissions.js";
import { processOutbox } from "../process-outbox.js";
import { markOutboxFailed } from "../reopen-declaration.js";
import { sendHysSubmission } from "../send-hys.js";
import { FakeCustomsGateway } from "../test/fake-customs-gateway.js";
import { D, declarant, makeHarness, ORG, other, seed, viewer, type Harness } from "./_sheets-harness.js";

let h: Harness;
let gateway: FakeCustomsGateway;
let usage: ServiceUsage[];
let notifier: RecordingNotifier;
beforeEach(() => {
  h = makeHarness();
  gateway = new FakeCustomsGateway({ flakyHys: false, clock: fixedClock("2026-10-14T03:00:00.000Z") });
  h.deps.gateway = gateway;
  usage = [];
  h.deps.usage = { record: async (e) => { usage.push(e); } };
  notifier = new RecordingNotifier();
  h.deps.notify = notifier;
});

/** Bộ A02 có 1 file chứng từ hồ sơ (inv.pdf). */
const draft = async (withFile = true) => {
  const c = await createHysSubmission(h.deps, declarant, D, { procedureCode: "A02" });
  if (!c.ok) throw new Error(JSON.stringify(c.error));
  if (withFile) {
    const u = await updateHysSubmission(h.deps, declarant, D, c.value.id, { documentIds: ["doc_1"] });
    if (!u.ok) throw new Error(JSON.stringify(u.error));
  }
  return c.value.id;
};
const send = async (id: string) => {
  const r = await sendHysSubmission(h.deps, declarant, D, id, { certificateId: "cert_1" });
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.value;
};
const run = (outboxId: string) => processOutbox(h.deps, { orgId: ORG, userId: declarant.userId, outboxId });
const sub = (id: string) => h.uow.data.hys.find((x) => x.id === id)!;
const lastOutbox = () => h.uow.data.outbox.at(-1)!;

describe("gửi bộ HYS", () => {
  it("bộ hợp lệ → outbox hys:<id>:n1, SENDING, PRE_DECLARATION (chưa có kết quả truyền), xếp job customs-send", async () => {
    const id = await draft();
    const v = await send(id);
    expect(v).toMatchObject({ status: "SENDING", attempt: 1, purpose: "PRE_DECLARATION" });
    expect(sub(id)).toMatchObject({ sentBy: declarant.userId, sentAt: new Date("2026-10-14T03:00:00.000Z") });
    expect(h.uow.data.outbox).toEqual([expect.objectContaining({ operation: "HYS", branch: 1, declarationId: "dec_1", idempotencyKey: `hys:${id}:n1`, payload: { submissionId: id, certificateId: "cert_1" }, status: "PENDING" })]);
    expect(h.queue.jobs).toEqual([expect.objectContaining({ name: "customs-send", payload: { orgId: ORG, userId: declarant.userId, outboxId: lastOutbox().id } })]);
  });

  it("worker: ACCEPTED, số tiếp nhận 12 ký tự, ngày tiếp nhận; điền 1.63 cặp 1 một lần; không ghi customs_results; ghi chi phí", async () => {
    const id = await draft();
    await send(id);
    expect(await run(lastOutbox().id)).toEqual({ ok: true, value: { status: "SENT", next: null } });
    const s = sub(id);
    expect(s).toMatchObject({ status: "ACCEPTED", registeredOn: "2026-10-14", fill: { outcome: "FILLED", slot: 1, afterApproval: true } });
    expect(s.receiptNo).toMatch(/^3\d{11}$/);
    expect(h.decls.attachments).toEqual([{ dossierId: D, procedureCode: "A02", receiptNo: s.receiptNo, note: `HYS 1 – ${s.receiptNo}` }]);
    expect(h.decls.fields).toMatchObject({ TK_EA1: { value: "A02" }, TK_EB1: { value: s.receiptNo } });
    expect(gateway.hysCalls).toEqual([expect.objectContaining({ dossierId: D, customsOffice: "03CE", procedureCode: "A02", internalRef: "HS-NK-2610-021", certificateId: "cert_1", files: [{ name: "inv.pdf", bytes: Buffer.from("%PDF") }] })]);
    expect(h.uow.data.messages.map((m) => [m.operation, m.direction, m.result])).toEqual([["HYS", "OUT", "OK"], ["HYS", "IN", "OK"]]);
    expect(h.uow.data.messages[1]!.summary).toBe(`Đã tiếp nhận HYS A02 – số tiếp nhận ${s.receiptNo}`);
    expect(h.uow.data.results).toHaveLength(0);
    expect(lastOutbox().status).toBe("SENT");
    expect(usage).toEqual([expect.objectContaining({ operation: "HYS", kind: "CUSTOMS_SEND", dedupeKey: `customs:hys:${id}:n1` })]);
    expect(h.dossiers.events).toContainEqual({ type: "customs.message" });
  });

  it("chạy lại cùng outbox sau ACCEPTED → không gọi cổng lần 2, không điền lần 2", async () => {
    const id = await draft();
    await send(id);
    await run(lastOutbox().id);
    await run(lastOutbox().id);
    expect(gateway.hysCalls).toHaveLength(1);
    expect(h.decls.attachments).toHaveLength(1);
  });

  it("crash giữa ghi ACCEPTED và điền 1.63 (outbox còn PENDING, chưa có fill) → chạy lại không gửi, điền tiếp → ALREADY", async () => {
    const id = await draft();
    await send(id);
    const ob = lastOutbox();
    await run(ob.id);
    ob.status = "PENDING";
    sub(id).fill = null;
    expect((await run(ob.id)).ok).toBe(true);
    expect(gateway.hysCalls).toHaveLength(1);
    expect(sub(id).fill).toEqual({ outcome: "ALREADY", slot: 1, afterApproval: true });
    expect(ob.status).toBe("SENT");
  });

  it("lô gọi về một phần lúc nhận số (tờ 1 PRE_DECLARED, tờ 2 RECALLED) → LOCKED, không gọi fillAttachment", async () => {
    const id = await draft();
    await send(id);
    h.decls.status = "DRAFT";
    seed(h, 1, "PRE_DECLARED");
    seed(h, 2, "RECALLED");
    await run(lastOutbox().id);
    expect(sub(id)).toMatchObject({ status: "ACCEPTED", fill: { outcome: "LOCKED" } });
    expect(h.decls.attachments).toHaveLength(0);
    expect(h.decls.fields["TK_EB1"]).toBeUndefined();
  });

  it("tờ khai đã truyền (SUBMITTED) → LOCKED dù 1.63 đã có sẵn đúng số tiếp nhận", async () => {
    const id = await draft();
    await send(id);
    h.deps.gateway = { ...gateway, attachDocuments: async () => ({ receiptNo: "300000000001", registeredOn: "2026-10-14" }) } as unknown as FakeCustomsGateway;
    h.decls.status = "SUBMITTED";
    h.decls.fields = { TK_EA1: { value: "A02" }, TK_EB1: { value: "300000000001" } };
    await run(lastOutbox().id);
    expect(sub(id)).toMatchObject({ status: "ACCEPTED", receiptNo: "300000000001", fill: { outcome: "LOCKED" } });
    expect(h.decls.attachments).toHaveLength(0);
  });

  it("gửi khi lô không còn sửa được → purpose SUPPLEMENT → LOCKED", async () => {
    const id = await draft();
    h.decls.status = "SUBMITTED";
    seed(h, 1, "DECLARED");
    expect((await send(id)).purpose).toBe("SUPPLEMENT");
    h.decls.status = "APPROVED";
    await run(lastOutbox().id);
    expect(sub(id).fill).toEqual({ outcome: "LOCKED" });
  });

  it("thành công không có số → ACCEPTED, NO_RECEIPT, không điền", async () => {
    const id = await draft();
    await send(id);
    h.deps.gateway = { ...gateway, attachDocuments: async () => ({}) } as unknown as FakeCustomsGateway;
    await run(lastOutbox().id);
    expect(sub(id)).toMatchObject({ status: "ACCEPTED", receiptNo: null, fill: { outcome: "NO_RECEIPT" } });
    expect(h.decls.attachments).toHaveLength(0);
    expect(h.uow.data.messages.at(-1)!.summary).toMatch(/chưa nhận được số tiếp nhận/);
  });

  it("Hải quan từ chối (rejectHys) → REJECTED + reject, outbox SENT; sửa rồi gửi lại → khóa n2", async () => {
    gateway = new FakeCustomsGateway({ flakyHys: false, rejectHys: true });
    h.deps.gateway = gateway;
    const id = await draft();
    await send(id);
    const first = lastOutbox();
    expect(await run(first.id)).toEqual({ ok: true, value: { status: "SENT", next: null } });
    expect(sub(id)).toMatchObject({ status: "REJECTED", reject: [{ code: "E-HYS-TSB", message: expect.any(String), solution: expect.any(String) }] });
    expect(first.status).toBe("SENT");
    expect(h.uow.data.messages.at(-1)).toMatchObject({ direction: "IN", result: "ERROR", summary: expect.stringMatching(/E-HYS-TSB/) });
    const again = await send(id);
    expect(again).toMatchObject({ status: "SENDING", attempt: 2, reject: null });
    expect(lastOutbox().idempotencyKey).toBe(`hys:${id}:n2`);
  });

  it("bị từ chối → báo người phụ trách hồ sơ, dẫn tới bước Khai báo", async () => {
    h.deps.gateway = new FakeCustomsGateway({ flakyHys: false, rejectHys: true });
    const id = await draft();
    await send(id);
    await run(lastOutbox().id);
    expect(notifier.sent).toEqual([{ orgId: ORG, audience: { dossierOwnerOf: D }, draft: { title: expect.stringMatching(/HYS A02 bị từ chối/), body: expect.stringMatching(/E-HYS-TSB/), href: `/dossiers/${D}?step=submit` } }]);
  });

  it("lỗi kiểm schema tại chỗ (E-SCHEMA, chưa gọi cổng) → SEND_FAILED, ghi là lỗi dữ liệu, không tính chi phí", async () => {
    const id = await draft();
    await send(id);
    h.deps.gateway = { ...gateway, attachDocuments: async () => ({ errors: [{ code: "E-SCHEMA", field: "tK_CH", message: "tK_CH: Required", solution: "Sửa" }] }) } as unknown as FakeCustomsGateway;
    expect(await run(lastOutbox().id)).toEqual({ ok: true, value: { status: "FAILED", next: null } });
    expect(sub(id)).toMatchObject({ status: "SEND_FAILED", reject: [{ code: "E-SCHEMA", message: "tK_CH: Required" }] });
    expect(h.uow.data.messages.at(-1)!.summary).toMatch(/chưa gửi Hải quan/);
    expect(h.uow.data.messages.at(-1)!.summary).not.toMatch(/từ chối/);
    expect(usage).toHaveLength(0);
    expect(notifier.sent).toHaveLength(1);
  });

  it("file mất trong kho → SEND_FAILED nêu tên file, outbox FAILED, không gọi cổng", async () => {
    const id = await draft();
    await send(id);
    h.dossiers.readFile = async () => { throw new Error("NoSuchKey"); };
    expect(await run(lastOutbox().id)).toEqual({ ok: true, value: { status: "FAILED", next: null } });
    expect(sub(id)).toMatchObject({ status: "SEND_FAILED", reject: [{ message: expect.stringMatching(/Không đọc được file inv\.pdf/) }] });
    expect(lastOutbox().status).toBe("FAILED");
    expect(gateway.hysCalls).toHaveLength(0);
  });

  it("lỗi tạm → ném để thử lại, giữ PENDING/SENDING; hết lượt → SEND_FAILED", async () => {
    const id = await draft();
    await send(id);
    h.deps.gateway = { ...gateway, attachDocuments: async () => { throw new Error("FPT 503"); } } as unknown as FakeCustomsGateway;
    const ob = lastOutbox();
    await expect(run(ob.id)).rejects.toThrow(/503/);
    expect(ob).toMatchObject({ status: "PENDING", attempts: 1, lastError: "FPT 503" });
    expect(sub(id).status).toBe("SENDING");
    ob.attempts = 5;
    expect(await run(ob.id)).toEqual({ ok: true, value: { status: "FAILED", next: null } });
    expect(sub(id)).toMatchObject({ status: "SEND_FAILED", reject: [{ code: "E-SEND", message: "FPT 503" }] });
    expect(usage).toHaveLength(0);
    expect(notifier.sent).toEqual([{ orgId: ORG, audience: { dossierOwnerOf: D }, draft: { title: expect.stringMatching(/HYS A02 không gửi được/), body: expect.stringMatching(/FPT 503/), href: `/dossiers/${D}?step=submit` } }]);
  });

  it("lỗi vĩnh viễn của cổng (DomainError) → SEND_FAILED, không thử lại", async () => {
    const id = await draft();
    await send(id);
    h.deps.gateway = { ...gateway, attachDocuments: async () => { throw { code: "INTEGRATION_NOT_CONFIGURED", message: "Chưa cấu hình" }; } } as unknown as FakeCustomsGateway;
    expect(await run(lastOutbox().id)).toEqual({ ok: true, value: { status: "FAILED", next: null } });
    expect(sub(id)).toMatchObject({ status: "SEND_FAILED", reject: [{ code: "INTEGRATION_NOT_CONFIGURED", message: "Chưa cấu hình" }] });
  });

  it("markOutboxFailed outbox HYS → bộ SEND_FAILED, không tạo kết quả truyền", async () => {
    const id = await draft();
    await send(id);
    expect((await markOutboxFailed(h.deps, { orgId: ORG, outboxId: lastOutbox().id, reason: "timeout" })).ok).toBe(true);
    expect(sub(id)).toMatchObject({ status: "SEND_FAILED", reject: [{ code: "E-SEND", message: "timeout" }] });
    expect(lastOutbox().status).toBe("FAILED");
    expect(h.uow.data.results).toHaveLength(0);
  });

  it("SEND_FAILED đã có số tiếp nhận → gửi lại chỉ chuyển ACCEPTED, không tạo outbox", async () => {
    const id = await draft();
    await send(id);
    Object.assign(sub(id), { status: "SEND_FAILED", receiptNo: "300000000009" });
    const v = await send(id);
    expect(v).toMatchObject({ status: "ACCEPTED", receiptNo: "300000000009", attempt: 1 });
    expect(h.uow.data.outbox).toHaveLength(1);
    expect(h.queue.jobs).toHaveLength(1);
  });

  it("bộ thiếu file → HYS_INVALID, không tạo outbox", async () => {
    const id = await draft(false);
    const r = await sendHysSubmission(h.deps, declarant, D, id, { certificateId: "cert_1" });
    expect(!r.ok && r.error).toMatchObject({ code: "VALIDATION", reason: "HYS_INVALID", params: { issues: "NO_FILE" } });
    expect(h.uow.data.outbox).toHaveLength(0);
    expect(sub(id).status).toBe("DRAFT");
  });

  it("đang gửi → HYS_NOT_EDITABLE; không chứng thư → NO_CERT; VIEWER → FORBIDDEN; org khác → NOT_FOUND", async () => {
    const id = await draft();
    const noCert = await sendHysSubmission(h.deps, declarant, D, id, { certificateId: "cert_x" });
    expect(!noCert.ok && noCert.error.code).toBe("NO_CERT");
    expect((await sendHysSubmission(h.deps, viewer, D, id, { certificateId: "cert_1" })).ok).toBe(false);
    const foreign = await sendHysSubmission(h.deps, other, D, id, { certificateId: "cert_1" });
    expect(!foreign.ok && foreign.error.code).toBe("NOT_FOUND");
    await send(id);
    const twice = await sendHysSubmission(h.deps, declarant, D, id, { certificateId: "cert_1" });
    expect(!twice.ok && twice.error).toMatchObject({ code: "INVALID_STATE", reason: "HYS_NOT_EDITABLE" });
    expect(h.uow.data.outbox).toHaveLength(1);
  });

  describe("1.63 đã đủ 3 cặp", () => {
    const FULL = () => ({ TK_EA1: { value: "A01" }, TK_EB1: { value: "300000000001" }, TK_EA2: { value: "A08" }, TK_EB2: { value: "300000000002" }, TK_EA3: { value: "A99" }, TK_EB3: { value: "300000000003" } });

    it("không chọn cặp → HYS_SLOTS_FULL (1.63), không outbox, bộ giữ DRAFT", async () => {
      const id = await draft();
      h.decls.fields = FULL();
      const r = await sendHysSubmission(h.deps, declarant, D, id, { certificateId: "cert_1" });
      expect(!r.ok && r.error).toMatchObject({ code: "VALIDATION", reason: "HYS_SLOTS_FULL", params: { field: "1.63" } });
      expect(h.uow.data.outbox).toHaveLength(0);
      expect(sub(id).status).toBe("DRAFT");
    });

    it("EDA → field 2.53", async () => {
      h.decls.kind = "EDA";
      const id = await draft();
      h.decls.fields = FULL();
      const r = await sendHysSubmission(h.deps, declarant, D, id, { certificateId: "cert_1" });
      expect(!r.ok && r.error).toMatchObject({ reason: "HYS_SLOTS_FULL", params: { field: "2.53" } });
    });

    it("replaceSlot=2 → payload outbox mang replaceSlot; nhận số → cặp 2 = mã/số mới, fill REPLACED kèm cặp cũ", async () => {
      const id = await draft();
      h.decls.fields = FULL();
      await sendHysSubmission(h.deps, declarant, D, id, { certificateId: "cert_1", replaceSlot: 2 });
      expect(lastOutbox().payload).toEqual({ submissionId: id, certificateId: "cert_1", replaceSlot: 2 });
      await run(lastOutbox().id);
      const s = sub(id);
      expect(s.fill).toEqual({ outcome: "REPLACED", slot: 2, replaced: { code: "A08", receipt: "300000000002" }, afterApproval: true });
      expect(h.decls.attachments).toEqual([{ dossierId: D, procedureCode: "A02", receiptNo: s.receiptNo, note: `HYS 1 – ${s.receiptNo}`, replaceSlot: 2 }]);
      expect(h.decls.fields).toMatchObject({ TK_EA1: { value: "A01" }, TK_EA2: { value: "A02" }, TK_EB2: { value: s.receiptNo }, TK_EB3: { value: "300000000003" } });
    });

    it("lô không còn sửa được → không đòi replaceSlot (SUPPLEMENT)", async () => {
      const id = await draft();
      h.decls.fields = FULL();
      h.decls.status = "SUBMITTED";
      seed(h, 1, "DECLARED");
      expect((await send(id)).purpose).toBe("SUPPLEMENT");
      expect(lastOutbox().payload).toEqual({ submissionId: id, certificateId: "cert_1" });
    });

    it("còn cặp trống mà có replaceSlot → vẫn điền cặp trống (FILLED)", async () => {
      const id = await draft();
      h.decls.fields = { TK_EA1: { value: "A01" }, TK_EB1: { value: "300000000001" } };
      await sendHysSubmission(h.deps, declarant, D, id, { certificateId: "cert_1", replaceSlot: 1 });
      await run(lastOutbox().id);
      expect(sub(id).fill).toEqual({ outcome: "FILLED", slot: 2, afterApproval: true });
      expect(h.decls.fields).toMatchObject({ TK_EB1: { value: "300000000001" } });
    });

    it("payload outbox replaceSlot sai → FAILED (parse Zod), không gọi cổng", async () => {
      const id = await draft();
      await send(id);
      lastOutbox().payload = { submissionId: id, certificateId: "cert_1", replaceSlot: 7 };
      expect(await run(lastOutbox().id)).toEqual({ ok: true, value: { status: "FAILED", next: null } });
      expect(gateway.hysCalls).toHaveLength(0);
    });
  });

  it("outbox HYS kiểu cũ (payload files, không submissionId) → FAILED với hướng dẫn khai bộ mới, không gọi cổng", async () => {
    h.uow.data.outbox.push({ id: "ob_old", orgId: ORG, dossierId: D, branch: 1, declarationId: "dec_1", operation: "HYS", idempotencyKey: `${D}:HYS:n1`, payload: { files: [{ name: "inv.pdf", storageKey: "k/inv.pdf" }] }, status: "PENDING", attempts: 0, lastError: null, nextAttemptAt: null, createdAt: new Date(), updatedAt: new Date() });
    expect(await run("ob_old")).toEqual({ ok: true, value: { status: "FAILED", next: null } });
    expect(h.uow.data.outbox[0]).toMatchObject({ status: "FAILED", lastError: "HYS kiểu cũ không còn hỗ trợ – khai bộ HYS mới" });
    expect(gateway.hysCalls).toHaveLength(0);
  });
});
