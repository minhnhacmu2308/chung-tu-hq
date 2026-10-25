// Ảnh chụp nội dung đã gửi từng tờ (raw.sent) + guard tờ chưa gọi về không được đổi (spec tách tờ khai IDC/gọi về §2.5–2.6, thay R3).
import { beforeEach, describe, expect, it } from "vitest";
import { unwrap } from "../../../../shared/result.js";
import { sheetSnapshot } from "../../domain/branches.js";
import type { DeclarationPayload } from "../../domain/declaration-to-fpt.js";
import type { CustomsDeps, OutboxRow } from "../customs-ports.js";
import { getSubmission } from "../get-submission.js";
import { performOperation } from "../perform-operation.js";
import { processOutbox } from "../process-outbox.js";
import { reopenDeclaration } from "../reopen-declaration.js";
import { checkSentSheets } from "../sent-sheets.js";
import { submitDeclaration } from "../submit-declaration.js";
import { D, declarant, lines, lot as lotOf, makeHarness, ORG, seed as seedOf, type Harness } from "./_sheets-harness.js";

let h: Harness;
let deps: CustomsDeps;
beforeEach(() => {
  h = makeHarness();
  ({ deps } = h);
});
/** Dòng hàng có id (ô HANG.<id>.*). */
const withIds = (n: number): DeclarationPayload["items"] => lines(n).map((it) => ({ ...it, id: `it${it.lineNo}` }));
const sendAll = async (max = 30) => {
  for (let i = 0; i < max; i++) {
    const at = h.queue.jobs.findIndex((j) => j.name === "customs-send");
    if (at < 0) return;
    const [job] = h.queue.jobs.splice(at, 1);
    unwrap(await processOutbox(deps, { orgId: ORG, userId: "usr_chau", outboxId: String((job!.payload as Record<string, unknown>)["outboxId"]) }));
  }
};
const guard = () => checkSentSheets(deps, ORG, D);
/** Lô 3 tờ (120 dòng, có id), tờ ở giai đoạn `stages`; ảnh chụp đã gửi = payload lúc gieo. Tờ khai đang sửa (DRAFT) sau khi gọi về. */
const lot = (...stages: string[]) => {
  h.decls.items = withIds(120);
  stages.forEach((st, i) => seedOf(h, i + 1, st));
  h.decls.status = "DRAFT";
  h.dossiers.rows[0]!.status = "NEEDS_REVIEW";
};
/** Duyệt lại (tờ khai + hồ sơ APPROVED, lần duyệt mới). */
const reapprove = () => {
  h.decls.status = "APPROVED";
  h.decls.approvedAt = "2026-10-14T05:00:00.000Z";
  h.dossiers.rows[0]!.status = "APPROVED";
};
const item = (lineNo: number) => h.decls.items!.find((i) => i.lineNo === lineNo)!;
type IdaReq = { objVN_IDA: Record<string, unknown> };
const idaOf = (o: OutboxRow) => (o.payload as { request: IdaReq }).request.objVN_IDA;

describe("ảnh chụp nội dung đã gửi (raw.sent)", () => {
  it("khai tạm lô 3 tờ: outbox mang `sent`; IDA tờ k thành công → raw.sent tờ k = sheetSnapshot của payload đã gửi", async () => {
    h.decls.items = withIds(120);
    unwrap(await submitDeclaration(deps, declarant, D, "cert_1"));
    const p = h.decls.payloadNow();
    expect((h.uow.data.outbox[0]!.payload as { sent?: unknown }).sent).toEqual(sheetSnapshot(p, 1));
    await sendAll();
    expect(h.uow.data.results.map((r) => [r.branch, r.raw?.stage])).toEqual([[1, "PRE_DECLARED"], [2, "PRE_DECLARED"], [3, "PRE_DECLARED"]]);
    for (const no of [1, 2, 3]) expect(h.uow.data.results.find((r) => r.branch === no)!.raw?.sent).toEqual(sheetSnapshot(p, no));
    expect(await guard()).toBeNull();
  });
  it("lô một tờ: không ghi `sent`, không kiểm", async () => {
    h.decls.items = withIds(10);
    unwrap(await submitDeclaration(deps, declarant, D, "cert_1"));
    expect((h.uow.data.outbox[0]!.payload as { sent?: unknown }).sent).toBeUndefined();
    await sendAll();
    expect(h.uow.data.results[0]!.raw?.sent).toBeUndefined();
    h.decls.fields = { CQHQ: { value: "01AB – khác" } };
    expect(await guard()).toBeNull();
  });
});

describe("guard tờ chưa gọi về (SENT_SHEETS_CHANGED, thay R3)", () => {
  it("chỉ tờ 2 RECALLED, sửa chỉ tiêu chung → lỗi nêu tờ 1, 3; không tạo outbox khi truyền", async () => {
    lot("PRE_DECLARED", "RECALLED", "PRE_DECLARED");
    h.decls.fields = { CQHQ: { value: "01AB – khác" } };
    expect(await guard()).toMatchObject({ code: "BLOCKER_FAILED", reason: "SENT_SHEETS_CHANGED", params: { sheets: "1, 3", linesOnly: "0" } });
    reapprove();
    expect(await submitDeclaration(deps, declarant, D, "cert_1")).toMatchObject({ ok: false, error: { reason: "SENT_SHEETS_CHANGED", params: { sheets: "1, 3" } } });
    expect(await performOperation(deps, declarant, D, "IDA", 2)).toMatchObject({ ok: false, error: { reason: "SENT_SHEETS_CHANGED" } });
    expect(h.uow.data.outbox).toHaveLength(0);
  });
  it("sửa mô tả dòng của tờ 2 (không đổi 1.51) → duyệt được; truyền chỉ gửi tờ 2 (IDA) với TK_FIC = số tờ 1", async () => {
    lot("PRE_DECLARED", "RECALLED", "PRE_DECLARED");
    item(60).description = "Vòng bi sửa mô tả";
    expect(await guard()).toBeNull();
    reapprove();
    unwrap(await submitDeclaration(deps, declarant, D, "cert_1"));
    expect(h.uow.data.outbox.map((o) => [o.branch, o.operation])).toEqual([[2, "IDA"]]);
    expect(idaOf(h.uow.data.outbox[0]!)).toMatchObject({ tK_FIC: "104000000001", tK_BNO: 2 });
    expect((h.uow.data.outbox[0]!.payload as { sent?: unknown }).sent).toEqual(sheetSnapshot(h.decls.payloadNow(), 2));
  });
  it("sửa số tiền dòng tờ 2 → TK_TP đổi → lỗi nêu tờ 1, 3, chỉ tiêu 1.51", async () => {
    lot("PRE_DECLARED", "RECALLED", "PRE_DECLARED");
    item(60).amount = "9999";
    const e = await guard();
    expect(e).toMatchObject({ reason: "SENT_SHEETS_CHANGED", params: { sheets: "1, 3" } });
    expect(String(e?.params?.["fields"])).toContain("1.51");
  });
  it("sửa ô dòng hàng (HANG.<id>.*) của tờ 1 chưa gọi về → lỗi chỉ tờ 1, linesOnly", async () => {
    lot("PRE_DECLARED", "RECALLED", "PRE_DECLARED");
    h.decls.fields = { "HANG.it10.TG_HD": { value: "1" } };
    expect(await guard()).toMatchObject({ reason: "SENT_SHEETS_CHANGED", params: { sheets: "1", fields: "dòng hàng", linesOnly: "1" } });
  });
  it("tờ còn hiệu lực không có ảnh chụp (gửi trước khi có tính năng) → không kiểm được, phải gọi về", async () => {
    h.decls.items = withIds(120);
    seedOf(h, 1, "PRE_DECLARED");
    seedOf(h, 2, "RECALLED");
    seedOf(h, 3, "PRE_DECLARED", { sent: false });
    expect(await guard()).toMatchObject({ reason: "SENT_SHEETS_CHANGED", params: { sheets: "3" } });
  });
  it("tờ đã thông quan / RECALLED không xét", async () => {
    lot("CLEARED", "RECALLED", "RECALLED");
    h.decls.fields = { CQHQ: { value: "01AB – khác" } };
    expect(await guard()).toBeNull();
  });
  it("mở lại lô nhiều tờ khi chỉ tờ 2 RECALLED → được (bỏ R3)", async () => {
    lot("PRE_DECLARED", "RECALLED", "PRE_DECLARED");
    reapprove();
    unwrap(await reopenDeclaration(deps, declarant, D));
    expect(h.decls.status).toBe("DRAFT");
  });
  it("gọi về một phần, nội dung tờ còn hiệu lực không đổi → submit / IDA tờ 2 không bị chặn (không SHEETS_RECALL_FIRST)", async () => {
    lot("PRE_DECLARED", "RECALLED", "PRE_DECLARED");
    reapprove();
    unwrap(await performOperation(deps, declarant, D, "IDA", 2));
    expect(h.uow.data.outbox.map((o) => [o.branch, o.operation])).toEqual([[2, "IDA"]]);
  });
  it("getSubmission: sentChanges theo tờ (tờ còn hiệu lực bị đổi), tờ khác null", async () => {
    lot("PRE_DECLARED", "RECALLED", "PRE_DECLARED");
    h.decls.fields = { CQHQ: { value: "01AB – khác" } };
    const v = unwrap(await getSubmission(deps, declarant, D));
    expect(v.branches.map((b) => b.sentChanges)).toEqual([{ common: ["CQHQ"], lines: false }, null, { common: ["CQHQ"], lines: false }]);
  });
  it("org khác không đọc được kết quả → không kiểm (null)", async () => {
    lot("PRE_DECLARED", "RECALLED", "PRE_DECLARED");
    h.decls.fields = { CQHQ: { value: "01AB – khác" } };
    expect(await checkSentSheets(deps, "org_b", D)).toBeNull();
  });
});
