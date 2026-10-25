import { beforeEach, describe, expect, it } from "vitest";
import { fixedClock } from "../../../../shared/clock.js";
import type { Ctx } from "../../../../shared/ctx.js";
import { asOrgId, asUserId, sequentialIdGen } from "../../../../shared/ids.js";
import { InMemoryJobQueue } from "../../../../shared/queue.js";
import { RecordingNotifier } from "../../../../shared/notifier.js";
import { errCode, unwrap } from "../../../../shared/result.js";
import { DOSSIER, hansol, ORG } from "../../domain/test/shipment.js";
import { failAgentRun, failStaleAgentRuns, getAgentRun, runAgent, startAgentRun } from "../agent-run.js";
import { getDeclarationSnapshot, listDeclarationsForCustoms, markDeclarationDraft, markDeclarationSubmitted } from "../customs-bridge.js";
import type { DeclarationDeps } from "../ports.js";
import { FakeDossiers, FakeShipments, fakeOrg, fakeUsers, fakeValidation, RecordingAudit, ScriptedHs } from "../test/fakes.js";
import { InMemoryDeclarationUow } from "../test/in-memory-uow.js";

const ORG_ID = "org_a";
const declarant: Ctx = { orgId: asOrgId(ORG_ID), userId: asUserId("usr_chau"), role: "DECLARANT" };
const other: Ctx = { orgId: asOrgId("org_b"), userId: asUserId("usr_x"), role: "ADMIN" };
const D = "dos_1";

let uow: InMemoryDeclarationUow;
let queue: InMemoryJobQueue;
let hs: ScriptedHs;
let dossiers: FakeDossiers;
let shipments: FakeShipments;
let deps: DeclarationDeps;
let notifier: RecordingNotifier;

beforeEach(() => {
  uow = new InMemoryDeclarationUow();
  uow.data.catalogHs.push({ code: "8482.10.00", description: "Ổ bi cầu", mfn: "3", pref: { AK: "0" }, vat: "8", policy: null, keywords: ["ball bearing"] });
  uow.data.exchangeRates.push({ currency: "USD", date: "2026-10-13", rate: "25400" });
  queue = new InMemoryJobQueue();
  hs = new ScriptedHs([
    { match: /ball bearing/i, code: "8482.10.00", description: "Ổ bi cầu", confidence: 0.8 },
    { match: /linear guide/i, code: "8466.93.90", description: "Bộ phận máy công cụ", confidence: 0.61 },
  ]);
  dossiers = new FakeDossiers([{ ...DOSSIER, orgId: ORG_ID, status: "NEEDS_REVIEW", step: "ocr" }], { [D]: [{ id: "doc_invoice", kind: "INVOICE", fileName: "inv.pdf" }] });
  shipments = new FakeShipments({ [D]: hansol() });
  notifier = new RecordingNotifier();
  deps = {
    notify: notifier, uow, queue, hs, shipments, dossiers, validation: fakeValidation(), org: fakeOrg(ORG), audit: new RecordingAudit(), users: fakeUsers,
    clock: fixedClock("2026-10-14T03:00:00.000Z"), idGen: sequentialIdGen(),
  };
});

const lastJob = () => queue.jobs.filter((j) => j.name === "run-agent").at(-1)!.payload as { agentRunId: string };
const run = (agentRunId: string, dossierId = D) => runAgent(deps, { orgId: ORG_ID, userId: "usr_chau", dossierId, agentRunId });
async function runFull(mode: "DECLARATION" | "DIGITIZE" | "BOTH" = "DECLARATION") {
  unwrap(await startAgentRun(deps, declarant, D, mode));
  return unwrap(await run(lastJob().agentRunId));
}

describe("customs-bridge", () => {
  it("snapshot: hồ sơ không có / org khác / chưa có tờ khai → null", async () => {
    expect(await getDeclarationSnapshot(deps, ORG_ID, "dos_khong_co")).toBeNull();
    expect(await getDeclarationSnapshot(deps, "org_b", D)).toBeNull();
    expect(await getDeclarationSnapshot(deps, ORG_ID, D)).toBeNull();
  });

  it("snapshot: chỉ tiêu (chỉ giá trị), dòng hàng, khoản điều chỉnh, container, HS chưa xác nhận, thuế dự kiến", async () => {
    await runFull();
    const s = (await getDeclarationSnapshot(deps, ORG_ID, D))!;
    expect(s).toMatchObject({ version: 1, status: "DRAFT", kind: "IDA", direction: "NK", currency: "USD", containers: ["SITU2246781"], unconfirmedHs: 7 });
    expect(s.fields["NNK_MST"]).toEqual({ value: "0316789012", source: "ACCOUNT" });
    expect(s.items).toHaveLength(7);
    expect(s.items[0]).toMatchObject({ lineNo: 1, amount: "3700", hsConfirmed: null });
    expect(s.adjustments).toEqual([{ label: "Cước vận chuyển quốc tế", amount: "1150", currency: "USD", kind: "ADD" }]);
    expect(s.estimatedTaxVnd).toMatch(/^\d+$/);
  });

  it("snapshot: thuế dự tính từng tờ khai nhánh (50 dòng/tờ) cộng lại bằng thuế cả lô; lần duyệt hiện tại", async () => {
    await runFull();
    expect((await getDeclarationSnapshot(deps, ORG_ID, D))!.branchTaxVnd).toHaveLength(1);
    // 7 dòng → 60 dòng có thuế suất: tờ 1 dòng 1–50, tờ 2 dòng 51–60.
    const base = uow.data.lineItems[0]!;
    for (const it of uow.data.lineItems) Object.assign(it, { importDutyRate: "3", vatRate: "8" });
    for (let n = 8; n <= 60; n++) uow.data.lineItems.push({ ...base, id: `itm_x${n}`, lineNo: n, amount: "100", importDutyRate: "3", vatRate: "8" });
    const s = (await getDeclarationSnapshot(deps, ORG_ID, D))!;
    expect(s.branchTaxVnd).toHaveLength(2);
    expect(s.branchTaxVnd!.every((t) => /^\d+$/.test(t) && t !== "0")).toBe(true);
    expect(String(BigInt(s.branchTaxVnd![0]!) + BigInt(s.branchTaxVnd![1]!))).toBe(s.estimatedTaxVnd);
    expect(s.approvedAt).toBeNull();
    uow.data.declarations[0]!.approvedAt = new Date("2026-10-14T05:00:00.000Z");
    expect((await getDeclarationSnapshot(deps, ORG_ID, D))!.approvedAt).toBe("2026-10-14T05:00:00.000Z");
  });

  it("snapshot: lô hàng không còn → không có container", async () => {
    await runFull();
    shipments.byDossier = {};
    expect((await getDeclarationSnapshot(deps, ORG_ID, D))?.containers).toEqual([]);
  });

  it("markDeclarationSubmitted: chưa có tờ khai → NO_DECLARATION; DRAFT → NOT_APPROVED; APPROVED → SUBMITTED; gọi lại → ok (idempotent)", async () => {
    expect(errCode(await markDeclarationSubmitted(deps, declarant, D))).toBe("NO_DECLARATION");
    await runFull();
    expect(errCode(await markDeclarationSubmitted(deps, declarant, D))).toBe("NOT_APPROVED");
    uow.data.declarations[0]!.status = "APPROVED";
    unwrap(await markDeclarationSubmitted(deps, declarant, D));
    expect(uow.data.declarations[0]!.status).toBe("SUBMITTED");
    unwrap(await markDeclarationSubmitted(deps, declarant, D));
    expect(uow.data.declarations[0]!.status).toBe("SUBMITTED");
  });

  it("markDeclarationSubmitted: org khác không thấy tờ khai → NO_DECLARATION", async () => {
    await runFull();
    uow.data.declarations[0]!.status = "APPROVED";
    expect(errCode(await markDeclarationSubmitted(deps, other, D))).toBe("NO_DECLARATION");
    expect(uow.data.declarations[0]!.status).toBe("APPROVED");
  });

  it("markDeclarationDraft sang tuần tỷ giá mới → dựng lại tờ khai với tỷ giá + ngày tra mới (không kẹt RATE_WEEK_CHANGED)", async () => {
    await runFull();
    const d = uow.data.declarations.at(-1)!;
    d.status = "APPROVED";
    expect(d.exchangeRateDate).toBe("2026-10-14");
    uow.data.exchangeRates.push({ currency: "USD", date: "2026-10-19", rate: "25710", source: "VCB" });
    deps.clock = fixedClock("2026-10-19T03:00:00.000Z"); // thứ Hai tuần sau
    unwrap(await markDeclarationDraft(deps, declarant, D));
    expect(uow.data.declarations.at(-1)).toMatchObject({ status: "DRAFT", exchangeRateDate: "2026-10-19", exchangeRate: "25710" });
  });
  it("markDeclarationDraft: chưa có tờ khai → NO_DECLARATION, không đổi hồ sơ", async () => {
    expect(errCode(await markDeclarationDraft(deps, declarant, D))).toBe("NO_DECLARATION");
    expect(dossiers.events).toEqual([]);
  });

  it("markDeclarationDraft: SUBMITTED → DRAFT, xóa người duyệt; hồ sơ về NEEDS_REVIEW/review; đã DRAFT → giữ nguyên tờ khai", async () => {
    await runFull();
    Object.assign(uow.data.declarations[0]!, { status: "SUBMITTED", approvedBy: "usr_tuan", approvedAt: new Date() });
    unwrap(await markDeclarationDraft(deps, declarant, D));
    expect(uow.data.declarations[0]).toMatchObject({ status: "DRAFT", approvedBy: null, approvedAt: null });
    expect(dossiers.rows[0]).toMatchObject({ status: "NEEDS_REVIEW", step: "review" });
    expect(dossiers.events.at(-1)).toEqual({ type: "dossier.updated" });
    const updatedAt = uow.data.declarations[0]!.updatedAt;
    unwrap(await markDeclarationDraft(deps, declarant, D));
    expect(uow.data.declarations[0]!.updatedAt).toEqual(updatedAt);
  });

  it("listDeclarationsForCustoms: chỉ bản mới nhất ở APPROVED/SUBMITTED của org", async () => {
    await runFull();
    expect(await listDeclarationsForCustoms(deps, ORG_ID)).toEqual([]);
    const at = new Date("2026-10-14T05:00:00.000Z");
    Object.assign(uow.data.declarations[0]!, { status: "APPROVED", approvedAt: at });
    expect(await listDeclarationsForCustoms(deps, ORG_ID)).toEqual([{ dossierId: D, status: "APPROVED", approvedAt: at }]);
    expect(await listDeclarationsForCustoms(deps, "org_b")).toEqual([]);
  });
});

describe("agent run – nhánh biên", () => {
  it.each(["SUBMITTED", "CLEARED", "CANCELLED", "APPROVED"] as const)("hồ sơ %s → DOSSIER_LOCKED, không xếp job", async (status) => {
    dossiers.rows[0]!.status = status;
    expect(errCode(await startAgentRun(deps, declarant, D, "BOTH"))).toBe("DOSSIER_LOCKED");
    expect(queue.jobs).toHaveLength(0);
  });

  it("lô hàng có nhưng không có dòng hàng → NO_ITEMS", async () => {
    shipments.byDossier[D] = hansol((s) => void (s.items = []));
    expect(errCode(await startAgentRun(deps, declarant, D, "BOTH"))).toBe("NO_ITEMS");
  });

  it("chạy mới khi lần trước còn RUNNING → hủy lần trước", async () => {
    unwrap(await startAgentRun(deps, declarant, D, "DECLARATION"));
    unwrap(await startAgentRun(deps, declarant, D, "DIGITIZE"));
    expect(uow.data.agentRuns.map((r) => r.status)).toEqual(["CANCELLED", "RUNNING"]);
  });

  it("getAgentRun: chưa chạy lần nào → null; hồ sơ org khác → NOT_FOUND", async () => {
    expect(unwrap(await getAgentRun(deps, declarant, D))).toBeNull();
    expect(errCode(await getAgentRun(deps, other, D))).toBe("NOT_FOUND");
  });

  it("runAgent: không có run → NOT_FOUND; run đã hủy → trả view, không chạy", async () => {
    expect(errCode(await run("run_khong_co"))).toBe("NOT_FOUND");
    unwrap(await startAgentRun(deps, declarant, D, "DECLARATION"));
    const first = lastJob().agentRunId;
    unwrap(await startAgentRun(deps, declarant, D, "DECLARATION"));
    const v = unwrap(await run(first));
    expect(v.finished).toBe(true);
    expect(v.run.tasks[0]?.status).toBe("PENDING");
    expect(hs.calls).toBe(0);
  });

  it("runAgent: hồ sơ không còn → NOT_FOUND; lô hàng không còn → NOT_READY", async () => {
    unwrap(await startAgentRun(deps, declarant, D, "DECLARATION"));
    const id = lastJob().agentRunId;
    shipments.byDossier = {};
    expect(errCode(await run(id))).toBe("NOT_READY");
    dossiers.rows = [];
    expect(errCode(await run(id))).toBe("NOT_FOUND");
  });

  it("dòng đã xác nhận HS → giữ, không gọi classifier; gợi ý tin cậy < 70% → cảnh báo cần xác nhận kỹ", async () => {
    unwrap(await startAgentRun(deps, declarant, D, "DECLARATION"));
    for (const li of uow.data.lineItems) if (li.lineNo !== 5) li.hsConfirmed = "8482.10.00";
    const v = unwrap(await run(lastJob().agentRunId));
    expect(hs.calls).toBe(1);
    expect(v.logs.filter((l) => l.text.includes("giữ mã đã xác nhận"))).toHaveLength(6);
    expect(v.logs.find((l) => l.text.startsWith("Dòng 5:"))).toMatchObject({ tone: "warning", text: expect.stringMatching(/tin cậy 61%.*cần người xác nhận kỹ/) });
  });

  it("tờ khai đã duyệt → không dựng lại, ghi cảnh báo; thiếu tỷ giá → cảnh báo", async () => {
    await runFull();
    uow.data.declarations[0]!.status = "APPROVED";
    uow.data.exchangeRates.length = 0;
    dossiers.rows[0]!.status = "NEEDS_REVIEW";
    const v = await runFull();
    expect(uow.data.declarations).toHaveLength(1);
    expect(v.logs.some((l) => l.text === "Tờ khai đã được duyệt/truyền – không dựng lại")).toBe(true);
    expect(v.logs.some((l) => l.tone === "warning" && /Chưa có tỷ giá tính thuế cho USD/.test(l.text))).toBe(true);
  });

  it("xuất khẩu: ánh xạ EDA, không ghi chú người nhập khẩu theo MST", async () => {
    dossiers.rows[0]!.direction = "XK";
    const v = await runFull();
    expect(v.logs.some((l) => l.text.includes("xuất khẩu (EDA)"))).toBe(true);
    expect(v.logs.some((l) => l.text.includes("Người nhập khẩu lấy theo MST"))).toBe(false);
    expect(uow.data.declarations[0]?.kind).toBe("EDA");
  });

  it("chế độ DIGITIZE: không có chứng từ → số hóa 0; thông báo “dữ liệu số hóa”; hồ sơ không ở bước agent → giữ trạng thái", async () => {
    dossiers.docs = {};
    unwrap(await startAgentRun(deps, declarant, D, "DIGITIZE"));
    dossiers.rows[0]!.step = "review";
    const v = unwrap(await run(lastJob().agentRunId));
    expect(v.run.tasks.find((t) => t.id === "DIGITIZE")).toMatchObject({ status: "DONE", message: "Đã số hóa 0 chứng từ" });
    expect(dossiers.rows[0]!.status).toBe("PROCESSING");
    expect(notifier.sent[0]?.draft.body).toBe("Dữ liệu số hóa đã sẵn sàng.");
  });

  it("failAgentRun (hết lượt thử): run ERROR + nhật ký lỗi, task dở → ERROR, hồ sơ về NEEDS_REVIEW, báo chủ hồ sơ; gọi lại → không đổi", async () => {
    unwrap(await startAgentRun(deps, declarant, D, "DECLARATION"));
    const { agentRunId } = lastJob();
    unwrap(await failAgentRun(deps, { orgId: ORG_ID, userId: "usr_chau", dossierId: D, agentRunId, error: "HSCodePro 503 Service Unavailable" }));
    const run = uow.data.agentRuns.find((r) => r.id === agentRunId)!;
    expect(run.status).toBe("ERROR");
    expect(run.finishedAt).not.toBeNull();
    expect(run.tasks.every((t) => t.status === "ERROR")).toBe(true);
    expect(run.log.at(-1)).toMatchObject({ tone: "warning", text: expect.stringContaining("HSCodePro 503") });
    expect(dossiers.rows[0]!.status).toBe("NEEDS_REVIEW");
    expect(notifier.sent.at(-1)?.draft.title).toContain("AI Agent dừng");
    const sentBefore = notifier.sent.length;
    unwrap(await failAgentRun(deps, { orgId: ORG_ID, userId: "usr_chau", dossierId: D, agentRunId, error: "lại lỗi" }));
    expect(notifier.sent).toHaveLength(sentBefore);
    expect(errCode(await failAgentRun(deps, { orgId: ORG_ID, userId: "usr_chau", dossierId: D, agentRunId: "run_khong_co", error: "x" }))).toBe("NOT_FOUND");
  });

  it("failStaleAgentRuns: RUNNING quá 2 giờ không còn lượt HS mở → ERROR; đang chờ HSCodePro/người khai trả lời hoặc còn mới → giữ", async () => {
    unwrap(await startAgentRun(deps, declarant, D, "DECLARATION"));
    const stale = uow.data.agentRuns.at(-1)!;
    stale.startedAt = new Date(deps.clock.now().getTime() - 3 * 60 * 60_000);
    // Còn lượt need_info (chờ người khai) → không phải kẹt.
    uow.data.hsJobs.push({ id: "hsj_wait", orgId: ORG_ID, dossierId: D, externalId: "x", status: "need_info", polls: 1, createdAt: stale.startedAt, updatedAt: stale.startedAt });
    expect((await failStaleAgentRuns(deps, { orgId: ORG_ID })).failed).toEqual([]);
    uow.data.hsJobs.length = 0;
    expect((await failStaleAgentRuns(deps, { orgId: ORG_ID })).failed).toEqual([stale.id]);
    expect(uow.data.agentRuns.find((r) => r.id === stale.id)).toMatchObject({ status: "ERROR" });
    expect(uow.data.agentRuns.find((r) => r.id === stale.id)!.log.at(-1)!.text).toContain("job có thể đã mất");
    // Lần chạy mới (chưa tới hạn) không bị đụng.
    unwrap(await startAgentRun(deps, declarant, D, "DECLARATION"));
    expect((await failStaleAgentRuns(deps, { orgId: ORG_ID })).failed).toEqual([]);
  });

  it("không có notifier → vẫn hoàn tất; lỗi không phải Error → ghi nhật ký rồi ném lại", async () => {
    delete deps.notify;
    expect((await runFull()).finished).toBe(true);
    unwrap(await startAgentRun(deps, declarant, D, "DECLARATION"));
    const boom = async (): Promise<never> => { throw "hết hạn mức"; };
    deps.hs = { name: "boom", create: boom, get: boom, answer: boom, cancel: boom };
    await expect(run(lastJob().agentRunId)).rejects.toBe("hết hạn mức");
    expect(uow.data.agentRuns.at(-1)?.log.at(-1)?.text).toBe("Lỗi tạm thời: hết hạn mức – sẽ thử lại");
  });
});
