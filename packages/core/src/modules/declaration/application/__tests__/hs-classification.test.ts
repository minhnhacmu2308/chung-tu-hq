// HSCodePro trong luồng agent: tạo lượt, poll, need_info không chặn, trả lời, phân loại lại, xác nhận mã có thuế.
import type { HsJob } from "@kb/contracts";
import { beforeEach, describe, expect, it } from "vitest";
import { fixedClock } from "../../../../shared/clock.js";
import type { Ctx } from "../../../../shared/ctx.js";
import { asOrgId, asUserId, sequentialIdGen } from "../../../../shared/ids.js";
import { InMemoryJobQueue } from "../../../../shared/queue.js";
import { errCode, unwrap } from "../../../../shared/result.js";
import { RecordingUsageMeter } from "../../../../shared/usage.js";
import { DOSSIER, hansol, ORG } from "../../domain/test/shipment.js";
import { runAgent, startAgentRun } from "../agent-run.js";
import { answerHsQuestion, failHsWork, pollHsJob, reclassifyHs, runHsReclassify, sendHsAnswer, startHsClassification } from "../hs-classification.js";
import { confirmHs, listLineItems } from "../line-items.js";
import { HsApiError, type DeclarationDeps } from "../ports.js";
import { FakeDossiers, FakeShipments, fakeOrg, fakeUsers, fakeValidation, RecordingAudit, ScriptedHs } from "../test/fakes.js";
import { InMemoryDeclarationUow } from "../test/in-memory-uow.js";

const ORG_ID = "org_a";
const D = "dos_1";
const declarant: Ctx = { orgId: asOrgId(ORG_ID), userId: asUserId("usr_chau"), role: "DECLARANT" };
const viewer: Ctx = { orgId: asOrgId(ORG_ID), userId: asUserId("usr_v"), role: "VIEWER" };
const other: Ctx = { orgId: asOrgId("org_b"), userId: asUserId("usr_x"), role: "ADMIN" };
const sys = { orgId: ORG_ID, userId: "usr_chau", dossierId: D };

let uow: InMemoryDeclarationUow;
let queue: InMemoryJobQueue;
let hs: ScriptedHs;
let shipments: FakeShipments;
let deps: DeclarationDeps;

beforeEach(() => {
  uow = new InMemoryDeclarationUow();
  uow.data.exchangeRates.push({ currency: "USD", date: "2026-10-13", rate: "25400" });
  queue = new InMemoryJobQueue();
  hs = new ScriptedHs([
    { match: /ball bearing/i, code: "8482.10.00", description: "Ổ bi cầu", confidence: 0.83, importRate: 3, alternatives: [{ code: "8482.80.00", importRate: 0, whyNot: "Không phải ổ kết hợp" }] },
    { match: /tapered|cylindrical|pillow/i, code: "8482.20.00", description: "Ổ bi đũa", confidence: 0.9 },
    { match: /linear guide/i, code: "8466.93.90", description: "Bộ phận máy công cụ", confidence: 0.55 },
  ]);
  shipments = new FakeShipments({ [D]: hansol() });
  deps = {
    uow, queue, hs, shipments, dossiers: new FakeDossiers([{ ...DOSSIER, orgId: ORG_ID, status: "NEEDS_REVIEW", step: "ocr" }], { [D]: [] }), validation: fakeValidation({}),
    org: fakeOrg(ORG), audit: new RecordingAudit(), users: fakeUsers, clock: fixedClock("2026-10-14T03:00:00.000Z"), idGen: sequentialIdGen(),
  };
});

const items = async () => unwrap(await listLineItems(deps, declarant, D));
const jobsNamed = (name: string) => queue.jobs.filter((j) => j.name === name);
/** Lượt HSCodePro trả processing ở lần tạo, các lần get sau theo `steps`. */
function scriptJobs(steps: ((j: HsJob) => HsJob)[]) {
  const create = hs.create.bind(hs);
  hs.create = async (req) => {
    const full = await create(req); // kết quả đầy đủ; mỗi bước kịch bản dựng từ bản này
    const pending: HsJob = { ...full, status: "processing", items: full.items.map((i) => ({ ...i, status: "queued", result: null, error: null })) };
    let n = 0;
    hs.onGet = () => (steps[n] ? steps[n++]!(structuredClone(full)) : structuredClone(full));
    return pending;
  };
}

describe("startHsClassification", () => {
  it("dòng thiếu xuất xứ (không có dự phòng) → skipped NO_ORIGIN, không gửi; các dòng khác gửi đi, kèm co_form, import_date, external_ref", async () => {
    shipments.byDossier[D] = hansol((s) => {
      s.items[2]!.origin = { ...s.items[2]!.origin, value: null };
      s.origin = { ...s.origin, country: { ...s.origin.country, value: null } };
      s.parties.seller = { ...s.parties.seller, country: { ...s.parties.seller.country, value: null } };
    });
    await items(); // đồng bộ dòng hàng
    unwrap(await startHsClassification(deps, sys, D));
    expect(hs.created).toHaveLength(1);
    expect(hs.created[0]).toMatchObject({ external_ref: DOSSIER.code, import_date: "2026-10-14" });
    expect(hs.created[0]!.items.map((i) => i.line_no)).toEqual([1, 2, 4, 5, 6, 7]);
    expect(hs.created[0]!.items[0]).toMatchObject({ origin_country: "KR", co_form: "AK", value_usd: 3700, invoice_hs: "8482.10.1000" });
    const l3 = (await items()).find((i) => i.lineNo === 3)!;
    expect(l3.hs).toMatchObject({ status: "skipped", error: { code: "NO_ORIGIN" } });
  });

  it("hơn 50 dòng → chia lượt 50/50/20", async () => {
    shipments.byDossier[D] = hansol((s) => {
      const base = s.items[0]!;
      s.items = Array.from({ length: 120 }, (_, i) => ({ ...base, lineNo: i + 1 }));
    });
    await items();
    unwrap(await startHsClassification(deps, sys, D));
    expect(hs.created.map((c) => c.items.length)).toEqual([50, 50, 20]);
  });

  it("kết quả có ngay khi tạo → ghi gợi ý (mã xxxx.xx.xx, tin cậy 0–1, thuế, mã thay thế) và không cần poll", async () => {
    await items();
    const r = unwrap(await startHsClassification(deps, sys, D));
    expect(r.pending).toBe(false);
    expect(jobsNamed("hs-poll")).toHaveLength(0);
    const l1 = (await items())[0]!;
    expect(l1).toMatchObject({ hsSuggested: "8482.10.00", hsConfidence: 0.83 });
    expect(l1.hs!.candidates).toEqual([
      { code: "8482.10.00", description: "Ổ bi cầu", confidence: 0.83, whyNot: null, importRate: "3", basis: "MFN", agreement: null, vatRate: "10" },
      { code: "8482.80.00", description: "", confidence: 0.1, whyNot: "Không phải ổ kết hợp", importRate: "0", basis: "MFN", agreement: null, vatRate: "10" },
    ]);
    expect((await items())[3]!.hs!.status).toBe("completed");
  });
});

describe("pollHsJob + agent", () => {
  it("lượt còn processing → hẹn lại 3s; xong → ghi kết quả; need_info không chặn agent; agent đi tiếp sau khi hết processing", async () => {
    scriptJobs([
      (j) => ({ ...j, status: "processing", items: j.items.map((i) => ({ ...i, status: "processing", result: null })) }),
      (j) => ({ ...j, status: "need_info", items: j.items.map((i) => (i.line_no === 5 ? { ...i, status: "need_info", result: null, question: { id: "q1", questions: [{ id: "use", question: "Dùng cho máy nào?" }] } } : i)) }),
    ]);
    unwrap(await startAgentRun(deps, declarant, D, "DECLARATION"));
    const runJob = jobsNamed("run-agent").at(-1)!.payload as { agentRunId: string };
    const v1 = unwrap(await runAgent(deps, { ...sys, agentRunId: runJob.agentRunId }));
    expect(v1.finished).toBe(false);
    expect(v1.run.tasks[0]).toMatchObject({ id: "HS_LOOKUP", status: "RUNNING" });
    const poll = jobsNamed("hs-poll").at(-1)!;
    expect(poll.delayMs).toBe(3000);
    const p = poll.payload as { hsJobId: string };

    expect(unwrap(await pollHsJob(deps, { ...sys, hsJobId: p.hsJobId })).again).toBe(true);
    expect(jobsNamed("hs-poll")).toHaveLength(2);
    expect((await items())[0]!.hs!.status).toBe("processing");

    expect(unwrap(await pollHsJob(deps, { ...sys, hsJobId: p.hsJobId })).again).toBe(false);
    const after = await items();
    expect(after[4]!.hs).toMatchObject({ status: "need_info", question: { id: "q1" } });
    expect(after[0]).toMatchObject({ hsSuggested: "8482.10.00" });
    // Agent được đẩy lại và chạy tiếp tới hết.
    expect(uow.data.agentRuns.at(-1)!.tasks[0]).toMatchObject({ status: "DONE" });
    const resume = jobsNamed("run-agent").at(-1)!.payload as { agentRunId: string };
    expect(resume.agentRunId).toBe(runJob.agentRunId);
    const v2 = unwrap(await runAgent(deps, { ...sys, agentRunId: resume.agentRunId }));
    expect(v2.finished).toBe(true);
    expect(v2.logs.some((l) => l.text.includes("Dòng 5") && l.text.includes("cần bổ sung"))).toBe(true);
  });

  it("chạy lại khi lượt cũ còn dở → hủy lượt cũ; kết quả lượt cũ về muộn không ghi đè dòng đã sang lượt mới", async () => {
    scriptJobs([(j) => j]);
    await items();
    unwrap(await startHsClassification(deps, sys, D));
    const oldJob = uow.data.hsJobs[0]!;
    hs.onGet = null;
    hs.create = ScriptedHs.prototype.create.bind(hs);
    unwrap(await startHsClassification(deps, sys, D));
    expect(hs.cancelled).toEqual([oldJob.externalId]);
    const now = await items();
    // Lượt cũ trả về (đã bị hủy phía mình) → bỏ qua, không đụng dòng.
    hs.jobs.set(oldJob.externalId, { ...hs.jobs.get(oldJob.externalId)!, status: "completed", items: hs.jobs.get(oldJob.externalId)!.items.map((i) => ({ ...i, status: "failed", result: null, error: { code: "X", message: "cũ" } })) });
    unwrap(await pollHsJob(deps, { ...sys, hsJobId: oldJob.id }));
    expect((await items()).map((i) => i.hs!.status)).toEqual(now.map((i) => i.hs!.status));
  });

  it("quá 300 lần poll vẫn processing → dòng chưa xong thành failed TIMEOUT, dừng poll", async () => {
    scriptJobs([]);
    await items();
    unwrap(await startHsClassification(deps, sys, D));
    hs.onGet = (j) => ({ ...j, status: "processing", items: j.items.map((i) => ({ ...i, status: "processing", result: null })) });
    const job = uow.data.hsJobs[0]!;
    job.polls = 299;
    expect(unwrap(await pollHsJob(deps, { ...sys, hsJobId: job.id })).again).toBe(false);
    expect((await items())[0]!.hs).toMatchObject({ status: "failed", error: { code: "TIMEOUT" } });
  });
});

describe("trả lời câu hỏi / phân loại lại", () => {
  async function needInfoLine5() {
    scriptJobs([(j) => ({ ...j, status: "need_info", items: j.items.map((i) => (i.line_no === 5 ? { ...i, status: "need_info", result: null, question: { id: "q1", questions: [{ id: "use", question: "Dùng cho máy nào?" }] } } : i)) })]);
    await items();
    unwrap(await startHsClassification(deps, sys, D));
    unwrap(await pollHsJob(deps, { ...sys, hsJobId: uow.data.hsJobs[0]!.id }));
    return (await items())[4]!;
  }

  it("trả lời đúng → answering + job hs-answer; job gửi API rồi poll lại; dòng không chờ hỏi → INVALID_STATE; VIEWER/org khác bị chặn", async () => {
    const l5 = await needInfoLine5();
    const input = { questionId: "q1", answers: [{ id: "use", selected: ["Máy công cụ (CNC)"], custom: null }] };
    expect(errCode(await answerHsQuestion(deps, viewer, l5.id, input))).toBe("FORBIDDEN");
    expect(errCode(await answerHsQuestion(deps, other, l5.id, input))).toBe("NOT_FOUND");
    expect(errCode(await answerHsQuestion(deps, declarant, l5.id, { ...input, questionId: "q-khac" }))).toBe("INVALID_STATE");
    expect(unwrap(await answerHsQuestion(deps, declarant, l5.id, input)).hs!.status).toBe("answering");
    expect(errCode(await answerHsQuestion(deps, declarant, l5.id, input))).toBe("INVALID_STATE"); // bấm gửi 2 lần
    const job = jobsNamed("hs-answer").at(-1)!.payload as Parameters<typeof sendHsAnswer>[1];
    unwrap(await sendHsAnswer(deps, job));
    expect(hs.answers[0]).toMatchObject({ itemId: expect.any(String), body: { question_id: "q1", answers: [{ id: "use", selected: ["Máy công cụ (CNC)"], custom: null }] } });
    expect(jobsNamed("hs-poll").length).toBeGreaterThan(0);
    expect(uow.data.hsJobs[0]!.status).toBe("processing");
  });

  it("API báo 409 (đã gửi rồi) → không lỗi, vẫn poll lại", async () => {
    const l5 = await needInfoLine5();
    unwrap(await answerHsQuestion(deps, declarant, l5.id, { questionId: "q1", answers: [{ id: "use", selected: [], custom: "Máy đóng gói" }] }));
    hs.answerError = new HsApiError(409, "INVALID_STATE", "đã trả lời");
    const before = jobsNamed("hs-poll").length;
    unwrap(await sendHsAnswer(deps, jobsNamed("hs-answer").at(-1)!.payload as Parameters<typeof sendHsAnswer>[1]));
    expect(jobsNamed("hs-poll").length).toBe(before + 1);
  });

  it("phân loại lại 1 dòng: bổ sung xuất xứ + mô tả → lượt mới chỉ dòng đó, mô tả gửi đi có phần bổ sung; dòng đã xác nhận → lỗi", async () => {
    await items();
    unwrap(await startHsClassification(deps, sys, D));
    const l4 = (await items())[3]!;
    const r = unwrap(await reclassifyHs(deps, declarant, l4.id, { extraDescription: "vòng bi đũa trụ, thép", origin: "JP" }));
    expect(r.origin).toBe("JP");
    expect(r.hs!.status).toBe("queued");
    const before = hs.created.length;
    unwrap(await runHsReclassify(deps, jobsNamed("hs-reclassify").at(-1)!.payload as Parameters<typeof runHsReclassify>[1]));
    expect(hs.created).toHaveLength(before + 1);
    const last = hs.created.at(-1)!;
    expect(last.items).toHaveLength(1);
    expect(last.items[0]).toMatchObject({ line_no: 4, origin_country: "JP", description: expect.stringContaining("vòng bi đũa trụ, thép") });
    unwrap(await confirmHs(deps, declarant, l4.id, "8482.20.00"));
    expect(errCode(await reclassifyHs(deps, declarant, l4.id, {}))).toBe("INVALID_STATE");
    expect(errCode(await reclassifyHs(deps, viewer, l4.id, {}))).toBe("FORBIDDEN");
  });
});

describe("confirmHs với HSCodePro", () => {
  beforeEach(async () => {
    await items();
    unwrap(await startHsClassification(deps, sys, D));
  });
  it("chọn mã thay thế → thuế theo mã đó", async () => {
    const l1 = (await items())[0]!;
    const r = unwrap(await confirmHs(deps, declarant, l1.id, "8482.80.00"));
    expect(r).toMatchObject({ hsConfirmed: "8482.80.00", importDutyRate: "0", vatRate: "10" });
  });
  it("nhập tay mã 8 số ngoài biểu và ngoài gợi ý → chấp nhận, chưa có thuế suất + ghi chú; mã sai dạng → INVALID_HS", async () => {
    const l1 = (await items())[0]!;
    const r = unwrap(await confirmHs(deps, declarant, l1.id, "99999999"));
    expect(r.hsConfirmed).toBe("9999.99.99");
    expect(r.importDutyRate).toBeUndefined();
    expect(r.policyNote).toMatch(/Chưa có thuế suất/);
    expect(errCode(await confirmHs(deps, declarant, l1.id, "8482.10"))).toBe("INVALID_HS");
  });
  it("hàng xuất khẩu → thuế 0/0 dù gợi ý có thuế NK", async () => {
    (deps.dossiers as FakeDossiers).rows[0]!.direction = "XK";
    const l1 = (await items())[0]!;
    expect(unwrap(await confirmHs(deps, declarant, l1.id, "8482.10.00"))).toMatchObject({ importDutyRate: "0", vatRate: "0" });
  });
});

describe("sửa sau review", () => {
  it("#1 lượt có dòng need_info nhưng dòng khác còn processing → vẫn poll; agent chỉ đi tiếp khi không còn dòng đang chạy", async () => {
    scriptJobs([
      (j) => ({ ...j, status: "need_info", items: j.items.map((i) => (i.line_no === 5 ? { ...i, status: "need_info", result: null, question: { id: "q1", questions: [{ id: "use", question: "?" }] } } : i.line_no === 1 ? i : { ...i, status: "processing", result: null })) }),
      (j) => ({ ...j, status: "need_info", items: j.items.map((i) => (i.line_no === 5 ? { ...i, status: "need_info", result: null, question: { id: "q1", questions: [{ id: "use", question: "?" }] } } : i)) }),
    ]);
    unwrap(await startAgentRun(deps, declarant, D, "DECLARATION"));
    const runJob = jobsNamed("run-agent").at(-1)!.payload as { agentRunId: string };
    unwrap(await runAgent(deps, { ...sys, agentRunId: runJob.agentRunId }));
    const hsJobId = (jobsNamed("hs-poll").at(-1)!.payload as { hsJobId: string }).hsJobId;
    expect(unwrap(await pollHsJob(deps, { ...sys, hsJobId })).again).toBe(true);
    expect(uow.data.agentRuns.at(-1)!.tasks[0]!.status).toBe("RUNNING");
    expect(unwrap(await pollHsJob(deps, { ...sys, hsJobId })).again).toBe(false);
    expect(uow.data.agentRuns.at(-1)!.tasks[0]!.status).toBe("DONE");
    expect((await items())[1]!.hs!.status).toBe("completed");
  });

  it("#2 poll/gửi trả lời hỏng hẳn (hết lượt thử) → lượt + dòng đang chạy thành failed POLL_FAILED, agent đi tiếp", async () => {
    scriptJobs([(j) => j]);
    unwrap(await startAgentRun(deps, declarant, D, "DECLARATION"));
    unwrap(await runAgent(deps, { ...sys, agentRunId: (jobsNamed("run-agent").at(-1)!.payload as { agentRunId: string }).agentRunId }));
    const hsJobId = (jobsNamed("hs-poll").at(-1)!.payload as { hsJobId: string }).hsJobId;
    unwrap(await failHsWork(deps, { ...sys, hsJobId, error: "HSCodePro 503" }));
    expect((await items())[0]!.hs).toMatchObject({ status: "failed", error: { code: "POLL_FAILED" } });
    expect(uow.data.hsJobs[0]!.status).toBe("completed");
    expect(uow.data.agentRuns.at(-1)!.tasks[0]!.status).toBe("DONE");
  });

  it("#3 trả lời lại sau khi HSCodePro báo 400 → job hs-answer mới (jobId khác), không bị bỏ qua", async () => {
    scriptJobs([(j) => ({ ...j, status: "need_info", items: j.items.map((i) => (i.line_no === 5 ? { ...i, status: "need_info", result: null, question: { id: "q1", questions: [{ id: "use", question: "?" }] } } : i)) })]);
    await items();
    unwrap(await startHsClassification(deps, sys, D));
    unwrap(await pollHsJob(deps, { ...sys, hsJobId: uow.data.hsJobs[0]!.id }));
    const l5 = (await items())[4]!;
    const input = { questionId: "q1", answers: [{ id: "use", selected: [], custom: "CNC" }] };
    unwrap(await answerHsQuestion(deps, declarant, l5.id, input));
    hs.answerError = new HsApiError(400, "INVALID_INPUT", "Thiếu câu trả lời");
    unwrap(await sendHsAnswer(deps, jobsNamed("hs-answer").at(-1)!.payload as Parameters<typeof sendHsAnswer>[1]));
    expect((await items())[4]!.hs).toMatchObject({ status: "need_info", error: { message: "Thiếu câu trả lời" } });
    unwrap(await answerHsQuestion(deps, declarant, l5.id, input));
    const ids = jobsNamed("hs-answer").map((j) => j.jobId);
    expect(new Set(ids).size).toBe(2);
  });

  it("#4 tạo lượt lỗi giữa chừng (lô 2/2) → BullMQ chạy lại agent gửi nốt dòng chưa gửi", async () => {
    shipments.byDossier[D] = hansol((s) => {
      const base = s.items[0]!;
      s.items = Array.from({ length: 60 }, (_, i) => ({ ...base, lineNo: i + 1 }));
    });
    scriptJobs([(j) => j]);
    const create = hs.create.bind(hs);
    let n = 0;
    hs.create = async (req) => {
      if (++n === 2) throw new HsApiError(500, "INTERNAL_ERROR", "lỗi hệ thống");
      return create(req);
    };
    unwrap(await startAgentRun(deps, declarant, D, "DECLARATION"));
    const runId = (jobsNamed("run-agent").at(-1)!.payload as { agentRunId: string }).agentRunId;
    await expect(runAgent(deps, { ...sys, agentRunId: runId })).rejects.toThrow(/lỗi hệ thống/);
    unwrap(await runAgent(deps, { ...sys, agentRunId: runId }));
    expect(n).toBe(3);
    expect(uow.data.lineItems.every((l) => l.hsJobId !== null)).toBe(true);
  });

  it("#5 HSCodePro trả 400 có details cho một dòng → dòng đó bỏ qua kèm lý do, các dòng còn lại vẫn gửi", async () => {
    const create = hs.create.bind(hs);
    hs.create = async (req) => {
      const bad = req.items.findIndex((i) => i.line_no === 2);
      if (bad >= 0) throw new HsApiError(400, "INVALID_INPUT", "Sai dữ liệu", [{ field: `items[${bad}].origin_country`, message: "Mã nước không hợp lệ" }]);
      return create(req);
    };
    await items();
    unwrap(await startHsClassification(deps, sys, D));
    const all = await items();
    expect(all[1]!.hs).toMatchObject({ status: "skipped", error: { code: "INVALID_INPUT", message: expect.stringContaining("Mã nước không hợp lệ") } });
    expect(all[0]!.hs!.status).toBe("completed");
  });

  it("#5b 400 không chỉ ra dòng → các dòng của lượt thành failed, không ném (không thử lại vô ích)", async () => {
    hs.create = async () => { throw new HsApiError(400, "INVALID_INPUT", "Trùng line_no"); };
    await items();
    unwrap(await startHsClassification(deps, sys, D));
    expect((await items()).every((i) => i.hs!.status === "failed")).toBe(true);
  });

  it("#6 phân loại lại có đổi xuất xứ → ghi field_audit và dựng lại tờ khai nháp", async () => {
    await items();
    unwrap(await startHsClassification(deps, sys, D));
    const l4 = (await items())[3]!;
    unwrap(await reclassifyHs(deps, declarant, l4.id, { origin: "JP" }));
    expect((deps.audit as RecordingAudit).rows).toContainEqual(expect.objectContaining({ key: "origin:4", oldValue: "KR", newValue: "JP", source: "DECL_EDIT" }));
  });
});

describe("ghi chi phí HSCodePro (usage_events)", () => {
  let meter: RecordingUsageMeter;
  beforeEach(() => {
    meter = new RecordingUsageMeter();
    deps.usage = meter;
  });
  const kinds = () => meter.events.map((e) => `${e.kind}:${e.operation}:${e.quantity}`);

  it("tạo lượt → 1 sự kiện HS_CLASSIFY theo số dòng gửi; lượt hỏi chưa xong không ghi; lượt có kết quả mới → HS_RESULT một lần", async () => {
    scriptJobs([(j) => ({ ...j, status: "processing", items: j.items.map((i) => ({ ...i, status: "processing", result: null })) })]);
    await items();
    unwrap(await startHsClassification(deps, sys, D));
    const sent = hs.created[0]!.items.length;
    expect(meter.events).toEqual([expect.objectContaining({ orgId: ORG_ID, dossierId: D, provider: "HSCODEPRO", kind: "HS_CLASSIFY", operation: "CLASSIFY", quantity: sent })]);
    const job = uow.data.hsJobs[0]!;
    unwrap(await pollHsJob(deps, { ...sys, hsJobId: job.id })); // còn processing
    expect(meter.events).toHaveLength(1);
    unwrap(await pollHsJob(deps, { ...sys, hsJobId: job.id })); // xong
    expect(kinds()).toEqual([`HS_CLASSIFY:CLASSIFY:${sent}`, `HS_RESULT:POLL:${sent}`]);
    // Job hs-poll chạy lại sau khi lượt đã xong → không ghi thêm.
    unwrap(await pollHsJob(deps, { ...sys, hsJobId: job.id }));
    expect(meter.events).toHaveLength(2);
  });

  it("phân loại lại một dòng → HS_CLASSIFY RECLASSIFY số lượng 1", async () => {
    await items();
    unwrap(await startHsClassification(deps, sys, D));
    const l4 = (await items())[3]!;
    unwrap(await reclassifyHs(deps, declarant, l4.id, {}));
    unwrap(await runHsReclassify(deps, jobsNamed("hs-reclassify").at(-1)!.payload as Parameters<typeof runHsReclassify>[1]));
    expect(meter.events.at(-1)).toMatchObject({ kind: "HS_CLASSIFY", operation: "RECLASSIFY", quantity: 1 });
  });

  it("HSCodePro từ chối tạo lượt (400) → không ghi chi phí", async () => {
    await items();
    hs.create = async () => {
      throw new HsApiError(400, "INVALID_INPUT", "sai");
    };
    unwrap(await startHsClassification(deps, sys, D));
    expect(meter.events).toEqual([]);
  });

  it("trả lời câu hỏi → HS_ANSWER 1 dòng; job chạy lại (409 đã gửi) không ghi thêm", async () => {
    scriptJobs([(j) => ({ ...j, status: "need_info", items: j.items.map((i) => (i.line_no === 5 ? { ...i, status: "need_info", result: null, question: { id: "q1", questions: [{ id: "use", question: "Dùng cho máy nào?" }] } } : i)) })]);
    await items();
    unwrap(await startHsClassification(deps, sys, D));
    unwrap(await pollHsJob(deps, { ...sys, hsJobId: uow.data.hsJobs[0]!.id }));
    const l5 = (await items())[4]!;
    unwrap(await answerHsQuestion(deps, declarant, l5.id, { questionId: "q1", answers: [{ id: "use", selected: [], custom: "Máy đóng gói" }] }));
    const job = jobsNamed("hs-answer").at(-1)!.payload as Parameters<typeof sendHsAnswer>[1];
    unwrap(await sendHsAnswer(deps, job));
    hs.answerError = new HsApiError(409, "INVALID_STATE", "đã trả lời");
    unwrap(await sendHsAnswer(deps, job));
    expect(meter.events.filter((e) => e.kind === "HS_ANSWER")).toEqual([expect.objectContaining({ provider: "HSCODEPRO", operation: "ANSWER", quantity: 1, dossierId: D })]);
  });

  it("ghi chi phí lỗi → phân loại vẫn chạy bình thường", async () => {
    meter.fail = true;
    await items();
    const r = unwrap(await startHsClassification(deps, sys, D));
    expect(r.jobIds).toHaveLength(1);
    expect((await items())[0]).toMatchObject({ hsSuggested: "8482.10.00" });
  });
});
