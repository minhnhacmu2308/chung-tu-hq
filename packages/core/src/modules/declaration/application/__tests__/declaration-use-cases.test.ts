import { beforeEach, describe, expect, it } from "vitest";
import { fixedClock } from "../../../../shared/clock.js";
import type { Ctx } from "../../../../shared/ctx.js";
import { asOrgId, asUserId, sequentialIdGen } from "../../../../shared/ids.js";
import { InMemoryJobQueue } from "../../../../shared/queue.js";
import { RecordingNotifier } from "../../../../shared/notifier.js";
import { errCode, unwrap } from "../../../../shared/result.js";
import { DOSSIER, hansol, ORG } from "../../domain/test/shipment.js";
import { getAgentRun, runAgent, startAgentRun } from "../agent-run.js";
import { approveDeclaration, getDeclarationView, moveToReview, updateDeclarationField } from "../declaration.js";
import { confirmHs, listHsCatalog, listLineItems, unconfirmHs } from "../line-items.js";
import type { DeclarationDeps } from "../ports.js";
import { FakeDossiers, FakeShipments, fakeOrg, fakeUsers, fakeValidation, RecordingAudit, ScriptedHs } from "../test/fakes.js";
import { InMemoryDeclarationUow } from "../test/in-memory-uow.js";

const ORG_ID = "org_a";
const declarant: Ctx = { orgId: asOrgId(ORG_ID), userId: asUserId("usr_chau"), role: "DECLARANT" };
const approver: Ctx = { orgId: asOrgId(ORG_ID), userId: asUserId("usr_tuan"), role: "APPROVER" };
const viewer: Ctx = { orgId: asOrgId(ORG_ID), userId: asUserId("usr_v"), role: "VIEWER" };
const other: Ctx = { orgId: asOrgId("org_b"), userId: asUserId("usr_x"), role: "ADMIN" };
const D = "dos_1";

let uow: InMemoryDeclarationUow;
let queue: InMemoryJobQueue;
let hs: ScriptedHs;
let dossiers: FakeDossiers;
let audit: RecordingAudit;
let deps: DeclarationDeps;
let fails: Record<string, number>;
let notifier: RecordingNotifier;

beforeEach(() => {
  uow = new InMemoryDeclarationUow();
  uow.data.catalogHs.push(
    { code: "8482.10.00", description: "Ổ bi cầu", mfn: "3", pref: { AK: "0" }, vat: "8", policy: null, keywords: ["ball bearing"] },
    { code: "8482.20.00", description: "Ổ bi đũa côn", mfn: "3", pref: { AK: "0" }, vat: "8", policy: null, keywords: ["tapered"] },
    { code: "8466.93.90", description: "Bộ phận máy công cụ", mfn: "0", pref: {}, vat: "8", policy: null, keywords: ["linear guide"] },
  );
  uow.data.exchangeRates.push({ currency: "USD", date: "2026-10-13", rate: "25400" });
  queue = new InMemoryJobQueue();
  hs = new ScriptedHs([
    { match: /ball bearing/i, code: "8482.10.00", description: "Ổ bi cầu", confidence: 0.8 },
    { match: /tapered/i, code: "8482.20.00", description: "Ổ bi đũa côn", confidence: 0.88 },
    { match: /linear guide/i, code: "8466.93.90", description: "Bộ phận máy công cụ", confidence: 0.61 },
    { match: /linear guide/i, code: "8482.80.00", description: "Ổ bi khác", confidence: 0.55 },
  ]);
  dossiers = new FakeDossiers([{ ...DOSSIER, orgId: ORG_ID, status: "NEEDS_REVIEW", step: "ocr" }], { [D]: [{ id: "doc_invoice", kind: "INVOICE", fileName: "inv.pdf" }, { id: "doc_pl", kind: "PACKING_LIST", fileName: "pl.pdf" }] });
  audit = new RecordingAudit();
  fails = {};
  notifier = new RecordingNotifier();
  deps = {
    notify: notifier,
    uow, queue, hs, shipments: new FakeShipments({ [D]: hansol() }, { [D]: [{ documentId: "doc_invoice", kind: "INVOICE", raw: { invoiceNo: "HSP-2610-0457" } }] }), dossiers, validation: fakeValidation(fails),
    org: fakeOrg(ORG), audit, users: fakeUsers, clock: fixedClock("2026-10-14T03:00:00.000Z"), idGen: sequentialIdGen(),
  };
});

async function runFull(mode: "DECLARATION" | "DIGITIZE" | "BOTH" = "BOTH") {
  unwrap(await startAgentRun(deps, declarant, D, mode));
  const job = queue.jobs.filter((j) => j.name === "run-agent").at(-1)!.payload as { agentRunId: string };
  return unwrap(await runAgent(deps, { orgId: ORG_ID, userId: "usr_chau", dossierId: D, agentRunId: job.agentRunId }));
}

describe("agent run", () => {
  it("start: đồng bộ 7 dòng hàng từ shipment, tạo run RUNNING, đẩy job; VIEWER → FORBIDDEN; không có shipment → NO_ITEMS", async () => {
    // Trước khi chạy agent, màn Agent đã thấy dòng hàng (đồng bộ lười từ shipment, không nhân đôi).
    expect(unwrap(await listLineItems(deps, declarant, D))).toHaveLength(7);
    expect(unwrap(await listLineItems(deps, declarant, D))).toHaveLength(7);
    const v = unwrap(await startAgentRun(deps, declarant, D, "DECLARATION"));
    expect(v.finished).toBe(false);
    expect(v.run.tasks.map((t) => `${t.id}:${t.status}`)).toEqual(["HS_LOOKUP:PENDING", "MAPPING:PENDING", "BUILD_DECLARATION:PENDING", "DIGITIZE:SKIPPED"]);
    expect(unwrap(await listLineItems(deps, declarant, D))).toHaveLength(7);
    expect(queue.jobs.map((j) => j.name)).toEqual(["run-agent"]);
    expect(dossiers.rows[0]).toMatchObject({ status: "PROCESSING", step: "agent" });
    expect(errCode(await startAgentRun(deps, viewer, D, "BOTH"))).toBe("FORBIDDEN");
    dossiers.rows.push({ ...DOSSIER, id: "dos_2", orgId: ORG_ID });
    expect(errCode(await startAgentRun(deps, declarant, "dos_2", "BOTH"))).toBe("NO_ITEMS");
    expect(errCode(await startAgentRun(deps, other, D, "BOTH"))).toBe("NOT_FOUND");
  });

  it("runAgent BOTH: tra HS (ưu tiên khớp HS invoice), ánh xạ, dựng tờ khai nháp v1, số hóa; hồ sơ NEEDS_REVIEW; chạy lại không trùng", async () => {
    const v = await runFull();
    expect(v.finished).toBe(true);
    expect(v.run.tasks.every((t) => t.status === "DONE")).toBe(true);
    const items = unwrap(await listLineItems(deps, declarant, D));
    expect(items[0]).toMatchObject({ hsSuggested: "8482.10.00" });
    expect(items[0]!.hsConfidence).toBeCloseTo(0.95, 2); // 0.8 + khớp 6 số invoice
    expect(items[4]).toMatchObject({ hsSuggested: "8466.93.90", hsConfidence: 0.61 });
    expect(items[3]!.hsSuggested).toBeUndefined(); // "Cylindrical" không có luật → không gợi ý
    expect(v.logs.some((l) => l.text.includes("không có gợi ý"))).toBe(true);
    expect(v.logs.some((l) => l.text.includes("Người nhập khẩu lấy theo MST"))).toBe(true);
    const view = unwrap(await getDeclarationView(deps, declarant, D));
    expect(view.declaration).toMatchObject({ kind: "IDA", status: "DRAFT", exchangeRate: "25400", customsValueVnd: "558800000" });
    expect(view.declaration!.fields[0]!.code).toBe("SOTK");
    expect(view.declaration!.fields.find((f) => f.code === "NNK_MST")).toMatchObject({ no: "1.12", value: "0316789012", source: "ACCOUNT" });
    expect(view.items[0]!.customsValueVnd).toBe("99163549");
    expect(view.items[0]!.importDutyVnd).toBe("0"); // chưa xác nhận HS → chưa có thuế suất
    expect(view.unconfirmedHs).toBe(7);
    expect([...dossiers.files.keys()]).toEqual([`orgs/${ORG_ID}/dossiers/${D}/digitized/doc_invoice.json`, `orgs/${ORG_ID}/dossiers/${D}/digitized/doc_pl.json`]);
    expect(dossiers.rows[0]!.status).toBe("NEEDS_REVIEW");
    expect(unwrap(await getAgentRun(deps, declarant, D))?.finished).toBe(true);
    // Chạy lại: tờ khai v2, dòng hàng vẫn 7, suggestions không nhân đôi.
    const before = hs.calls;
    await runFull("DECLARATION");
    expect(uow.data.declarations.map((d) => d.version)).toEqual([1, 2]);
    expect(uow.data.lineItems).toHaveLength(7);
    expect(uow.data.suggestions.filter((s) => s.lineItemId === items[4]!.id)).toHaveLength(2);
    expect(hs.calls).toBe(before + 7);
  });

  it("lỗi tạm của classifier → ném để retry, task giữ RUNNING, chạy lại tiếp tục (task HS_LOOKUP chưa DONE chạy lại, không nhân đôi run)", async () => {
    unwrap(await startAgentRun(deps, declarant, D, "DECLARATION"));
    const job = queue.jobs[0]!.payload as { agentRunId: string };
    hs.failOn = "Tapered";
    await expect(runAgent(deps, { orgId: ORG_ID, userId: "usr_chau", dossierId: D, agentRunId: job.agentRunId })).rejects.toThrow(/503/);
    const mid = unwrap(await getAgentRun(deps, declarant, D))!;
    expect(mid.finished).toBe(false);
    expect(mid.run.tasks[0]!.status).toBe("RUNNING");
    expect(mid.logs.at(-1)?.text).toMatch(/thử lại/);
    hs.failOn = null;
    const done = unwrap(await runAgent(deps, { orgId: ORG_ID, userId: "usr_chau", dossierId: D, agentRunId: job.agentRunId }));
    expect(done.finished).toBe(true);
    expect(uow.data.agentRuns).toHaveLength(1);
    expect(uow.data.declarations).toHaveLength(1);
  });
});

describe("HS và tờ khai", () => {
  it("confirmHs: INVALID_HS khi không có trong biểu thuế; xác nhận → thuế suất AK 0%, audit HS_CONFIRM, tờ khai dựng lại có thuế; unconfirm bỏ", async () => {
    await runFull("DECLARATION");
    const items = unwrap(await listLineItems(deps, declarant, D));
    expect(errCode(await confirmHs(deps, declarant, items[0]!.id, "9999.99.99"))).toBe("INVALID_HS");
    const c = unwrap(await confirmHs(deps, declarant, items[0]!.id, "8482.10.00"));
    expect(c).toMatchObject({ hsConfirmed: "8482.10.00", importDutyRate: "0", vatRate: "8", policyNote: expect.stringMatching(/AKFTA/) });
    expect(audit.rows).toEqual([{ orgId: ORG_ID, dossierId: D, key: "hs:1", oldValue: "8482.10.00", newValue: "8482.10.00", source: "HS_CONFIRM" }]);
    const view = unwrap(await getDeclarationView(deps, declarant, D));
    expect(view.items[0]).toMatchObject({ importDutyVnd: "0", vatVnd: "7933084" });
    expect(view.unconfirmedHs).toBe(6);
    expect(unwrap(await unconfirmHs(deps, declarant, items[0]!.id)).hsConfirmed).toBeUndefined();
    expect(unwrap(await getDeclarationView(deps, declarant, D)).unconfirmedHs).toBe(7);
    expect(errCode(await confirmHs(deps, other, items[0]!.id, "8482.10.00"))).toBe("NOT_FOUND");
    expect(unwrap(await listHsCatalog(deps, declarant, "đũa"))).toHaveLength(1);
  });

  it("updateDeclarationField: nguồn USER, hết nghi ngờ, audit DECL_EDIT, giữ qua lần dựng lại; chỉ tiêu lạ → NOT_FOUND", async () => {
    await runFull("DECLARATION");
    const d = unwrap(await updateDeclarationField(deps, declarant, D, "KHO", "03CCS01 – Kho CFS Tân Vũ"));
    expect(d.fields.find((f) => f.code === "KHO")).toMatchObject({ value: "03CCS01 – Kho CFS Tân Vũ", source: "USER", no: "1.29" });
    expect(d.fields.find((f) => f.code === "KHO")?.suspect).toBeUndefined();
    expect(audit.rows.at(-1)).toMatchObject({ key: "decl:KHO", source: "DECL_EDIT", oldValue: "" });
    const items = unwrap(await listLineItems(deps, declarant, D));
    unwrap(await confirmHs(deps, declarant, items[0]!.id, "8482.10.00")); // dựng lại
    expect(unwrap(await getDeclarationView(deps, declarant, D)).declaration!.fields.find((f) => f.code === "KHO")).toMatchObject({ value: "03CCS01 – Kho CFS Tân Vũ", source: "USER" });
    expect(errCode(await updateDeclarationField(deps, declarant, D, "NOPE", "x"))).toBe("NOT_FOUND");
  });

  it("moveToReview cần HS đủ + tờ khai; approve: VIEWER/DECLARANT FORBIDDEN, BLOCKER → BLOCKER_FAILED, HS thiếu → HS_UNCONFIRMED, đủ → APPROVED + hồ sơ sang submit", async () => {
    await runFull("DECLARATION");
    expect(errCode(await moveToReview(deps, declarant, D))).toBe("HS_UNCONFIRMED");
    for (const it of unwrap(await listLineItems(deps, declarant, D))) unwrap(await confirmHs(deps, declarant, it.id, "8482.10.00"));
    unwrap(await moveToReview(deps, declarant, D));
    expect(dossiers.rows[0]).toMatchObject({ step: "review", status: "NEEDS_REVIEW" });
    expect(dossiers.rows[0]!.suspectFields).toBeGreaterThan(0);
    expect(errCode(await approveDeclaration(deps, declarant, D))).toBe("FORBIDDEN");
    fails[D] = 1;
    expect(errCode(await approveDeclaration(deps, approver, D))).toBe("BLOCKER_FAILED");
    fails[D] = 0;
    const a = unwrap(await approveDeclaration(deps, approver, D));
    expect(a).toMatchObject({ status: "APPROVED", approvedBy: "Tên usr_tuan", approvedAt: "2026-10-14T03:00:00.000Z" });
    expect(dossiers.rows[0]).toMatchObject({ status: "APPROVED", step: "submit", suspectFields: 0 });
    expect(notifier.sent.map((n) => n.draft.title)).toEqual(expect.arrayContaining([expect.stringMatching(/đã xử lý xong/), expect.stringMatching(/chờ phê duyệt/), expect.stringMatching(/đã được phê duyệt/)]));
    expect(notifier.sent.find((n) => /đã được phê duyệt/.test(n.draft.title))?.audience).toEqual({ dossierOwnerOf: D });
    expect(errCode(await approveDeclaration(deps, approver, D))).toBe("INVALID_STATE");
    expect(errCode(await updateDeclarationField(deps, declarant, D, "KHO", "x"))).toBe("INVALID_STATE");
    // Hồ sơ đã duyệt: không chạy lại agent, không đổi HS, không quay lại review (phải mở lại tờ khai trước).
    expect(errCode(await startAgentRun(deps, declarant, D, "BOTH"))).toBe("DOSSIER_LOCKED");
    expect(errCode(await confirmHs(deps, declarant, (unwrap(await listLineItems(deps, declarant, D)))[0]!.id, "8482.10.00"))).toBe("DOSSIER_LOCKED");
    expect(errCode(await moveToReview(deps, declarant, D))).toBe("DOSSIER_LOCKED");
    expect(errCode(await getDeclarationView(deps, other, D))).toBe("NOT_FOUND");
  });
});
