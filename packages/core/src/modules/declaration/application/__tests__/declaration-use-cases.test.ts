import { beforeEach, describe, expect, it } from "vitest";
import { Decimal } from "../../../../shared/decimal.js";
import { fixedClock } from "../../../../shared/clock.js";
import type { Ctx } from "../../../../shared/ctx.js";
import { asOrgId, asUserId, sequentialIdGen } from "../../../../shared/ids.js";
import { InMemoryJobQueue } from "../../../../shared/queue.js";
import { RecordingNotifier } from "../../../../shared/notifier.js";
import { errCode, unwrap } from "../../../../shared/result.js";
import { reasonError } from "../../../../shared/errors.js";
import { DOSSIER, hansol, ORG } from "../../domain/test/shipment.js";
import { getAgentRun, runAgent, startAgentRun } from "../agent-run.js";
import { getDeclarationSnapshot, markDeclarationDraft, refreshFromShipment } from "../customs-bridge.js";
import { sentSheetsError, sheetSnapshot } from "../../../integration/index.js";
import { approveDeclaration, getDeclarationView, moveToReview, updateDeclarationField } from "../declaration.js";
import { confirmHs, listHsCatalog, listLineItems, unconfirmHs } from "../line-items.js";
import { answerHsQuestion, reclassifyHs } from "../hs-classification.js";
import { saveValueCharges } from "../value-charges.js";
import { EMPTY_VALUE_CHARGES, type CustomsStage } from "@kb/contracts";
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
    { match: /ball bearing/i, code: "8482.10.00", description: "Ổ bi cầu", confidence: 0.8, importRate: 0, basis: "FTA", agreement: "AKFTA", vat: 8 },
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
    expect(items[0]!.hsConfidence).toBeCloseTo(0.8, 2); // tin cậy do HSCodePro trả (API tự xét HS trên invoice)
    expect(items[4]).toMatchObject({ hsSuggested: "8466.93.90", hsConfidence: 0.61 });
    expect(items[3]!.hsSuggested).toBeUndefined(); // "Cylindrical" không có luật → không gợi ý
    expect(v.logs.some((l) => l.text.includes("không có gợi ý"))).toBe(true);
    expect(v.logs.some((l) => l.text.includes("Người nhập khẩu lấy theo MST"))).toBe(true);
    const view = unwrap(await getDeclarationView(deps, declarant, D));
    expect(view.declaration).toMatchObject({ kind: "IDA", status: "DRAFT", exchangeRate: "25400", customsValueVnd: "558800000" });
    // Nguồn tỷ giá hiện ở màn Review: tiền tệ, tuần hiệu lực, nguồn (SEED/VCB/MANUAL).
    expect(view.exchangeRateInfo).toEqual({ currency: "USD", rate: "25400", effectiveFrom: "2026-10-13", source: "SEED", snapshotAt: null });
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
    expect(uow.data.suggestions.filter((s) => s.lineItemId === items[4]!.id)).toHaveLength(1); // một gợi ý chính, không nhân đôi khi chạy lại
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
  it("confirmHs: INVALID_HS khi mã không đủ 8 số; xác nhận → thuế suất AK 0%, audit HS_CONFIRM, tờ khai dựng lại có thuế; unconfirm bỏ", async () => {
    await runFull("DECLARATION");
    const items = unwrap(await listLineItems(deps, declarant, D));
    expect(errCode(await confirmHs(deps, declarant, items[0]!.id, "8482.10"))).toBe("INVALID_HS");
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

  it("1.14 mã bưu chính: tờ khai lấy từ Tài khoản; người khai sửa → USER thắng, giữ qua lần dựng lại; sai đặc tả → VALIDATION; org khác không sửa được", async () => {
    deps = { ...deps, org: fakeOrg({ ...ORG, postalCode: "180000" }) };
    await runFull("DECLARATION");
    const view = async () => unwrap(await getDeclarationView(deps, declarant, D)).declaration!.fields.find((f) => f.code === "TK_IMY");
    expect(await view()).toMatchObject({ value: "180000", source: "ACCOUNT", no: "1.14" });
    unwrap(await updateDeclarationField(deps, declarant, D, "TK_IMY", "100000"));
    expect(audit.rows.at(-1)).toMatchObject({ key: "decl:TK_IMY", oldValue: "180000", newValue: "100000" });
    const items = unwrap(await listLineItems(deps, declarant, D));
    unwrap(await confirmHs(deps, declarant, items[0]!.id, "8482.10.00")); // dựng lại
    expect(await view()).toMatchObject({ value: "100000", source: "USER" });
    expect(errCode(await updateDeclarationField(deps, declarant, D, "TK_IMY", "12345678"))).toBe("VALIDATION"); // TK_IMY tối đa 7 ký tự
    expect(errCode(await updateDeclarationField(deps, other, D, "TK_IMY", "200000"))).toBe("NOT_FOUND");
    expect(await view()).toMatchObject({ value: "100000" });
  });

  it("updateDeclarationField: chỉ tiêu tính từ hóa đơn/tỷ giá không sửa tay; chỉ tiêu bắt buộc không để trống; VIEWER bị chặn", async () => {
    await runFull("DECLARATION");
    const before = unwrap(await getDeclarationView(deps, declarant, D)).declaration!;
    for (const code of ["TONG_TG", "MA_TT", "DK_GIA", "TY_GIA", "PHI_VC"]) expect(errCode(await updateDeclarationField(deps, declarant, D, code, "1"))).toBe("VALIDATION");
    expect(errCode(await updateDeclarationField(deps, declarant, D, "SO_HD", ""))).toBe("VALIDATION");
    expect(errCode(await updateDeclarationField(deps, viewer, D, "KHO", "x"))).toBe("FORBIDDEN");
    expect(unwrap(await getDeclarationView(deps, declarant, D)).declaration!.fields).toEqual(before.fields);
    expect(audit.rows.filter((r) => r.source === "DECL_EDIT")).toHaveLength(0);
  });

  it("updateDeclarationField theo giai đoạn: chưa khai → lưu ô bổ sung (mã = tên trường VNACCS), kiểm tra đặc tả; đã phân luồng + IDD → khóa theo Phụ lục II; đã thông quan → khóa hết", async () => {
    await runFull("DECLARATION");
    const d = unwrap(await updateDeclarationField(deps, declarant, D, "TK_CCC", "B"));
    expect(d.fields.find((f) => f.code === "TK_CCC")).toMatchObject({ value: "B", source: "USER", no: "1.5" });
    expect(audit.rows.at(-1)).toMatchObject({ key: "decl:TK_CCC", oldValue: "", newValue: "B" });
    expect(errCode(await updateDeclarationField(deps, declarant, D, "TK_CCC", "AB"))).toBe("VALIDATION");
    expect(errCode(await updateDeclarationField(deps, declarant, D, "TK_BYA", "năm"))).toBe("VALIDATION");
    const items = unwrap(await listLineItems(deps, declarant, D));
    unwrap(await confirmHs(deps, declarant, items[0]!.id, "8482.10.00")); // dựng lại – giữ ô bổ sung
    expect(unwrap(await getDeclarationView(deps, declarant, D)).declaration!.fields.find((f) => f.code === "TK_CCC")?.value).toBe("B");

    deps.customsSheets = async () => [{ no: 1, stage: "AMEND_RECALLED", declarationNo: "104000000001" }];
    expect(errCode(await updateDeclarationField(deps, declarant, D, "PTVC", "1"))).toBe("INVALID_STATE");
    expect(errCode(await updateDeclarationField(deps, declarant, D, "TK_CCC", "A"))).toBe("INVALID_STATE");
    unwrap(await updateDeclarationField(deps, declarant, D, "SO_HD", "INV-AMEND"));
    deps.customsSheets = async () => [{ no: 1, stage: "POST_EDITING", declarationNo: "104000000001" }];
    expect(errCode(await updateDeclarationField(deps, declarant, D, "SO_HD", "INV-POST"))).toBe("INVALID_STATE");
    delete deps.customsSheets;
  });

  it("updateDeclarationField ô dòng hàng (HANG.<id>.<ô>): ô chỉ có trên tờ khai lưu theo id dòng, nhãn ghi số dòng; số liệu chứng từ / dòng lạ → NOT_FOUND", async () => {
    await runFull("DECLARATION");
    const [line] = unwrap(await listLineItems(deps, declarant, D));
    const d = unwrap(await updateDeclarationField(deps, declarant, D, `HANG.${line!.id}.HAG_RE`, "XN210"));
    expect(d.fields.find((f) => f.code === `HANG.${line!.id}.HAG_RE`)).toMatchObject({ value: "XN210", source: "USER", no: "1.92", label: `Dòng ${line!.lineNo} – Mã miễn/giảm/không chịu thuế nhập khẩu` });
    expect(errCode(await updateDeclarationField(deps, declarant, D, `HANG.${line!.id}.HAG_QN2`, "1,5"))).toBe("VALIDATION");
    expect(errCode(await updateDeclarationField(deps, declarant, D, `HANG.${line!.id}.HAG_CMN`, "x"))).toBe("NOT_FOUND");
    expect(errCode(await updateDeclarationField(deps, declarant, D, "HANG.li_khac.HAG_RE", "x"))).toBe("NOT_FOUND");
  });

  it("refreshFromShipment: sửa dòng hàng ở OCR → dòng hàng cập nhật (giữ id, HS đã xác nhận), ô người khai nhập theo id dòng còn nguyên, tờ khai nháp dựng lại", async () => {
    await runFull("DECLARATION");
    const [line] = unwrap(await listLineItems(deps, declarant, D));
    unwrap(await confirmHs(deps, declarant, line!.id, "8482.10.00"));
    unwrap(await updateDeclarationField(deps, declarant, D, `HANG.${line!.id}.HAG_RE`, "XN210"));
    const shipment = (deps.shipments as FakeShipments).byDossier[D]!;
    shipment.items[0]!.unit.value = "SET";
    shipment.items[0]!.unitPrice.value = "5.10";
    unwrap(await refreshFromShipment(deps, declarant, D));
    const [after] = unwrap(await listLineItems(deps, declarant, D));
    expect(after).toMatchObject({ id: line!.id, unit: "SET", unitPrice: "5.10", hsConfirmed: "8482.10.00" });
    expect(unwrap(await getDeclarationView(deps, declarant, D)).declaration!.fields.find((f) => f.code === `HANG.${line!.id}.HAG_RE`)?.value).toBe("XN210");
  });

  it("refreshFromShipment: tờ khai đã duyệt → không đổi dòng hàng", async () => {
    await runFull("DECLARATION");
    for (const it of unwrap(await listLineItems(deps, declarant, D))) unwrap(await confirmHs(deps, declarant, it.id, "8482.10.00"));
    unwrap(await moveToReview(deps, declarant, D));
    unwrap(await updateDeclarationField(deps, declarant, D, "VBPQ", "MO"));
    unwrap(await updateDeclarationField(deps, declarant, D, "KHO", "03CCS01 – Kho CFS Tân Vũ"));
    unwrap(await approveDeclaration(deps, approver, D));
    // Duyệt xong → mặt hàng đã xác nhận HS vào danh mục hàng hóa của doanh nghiệp (nguồn "Từ tờ khai").
    const items = unwrap(await listLineItems(deps, declarant, D));
    const catalog = uow.data.products;
    expect(catalog.length).toBe(new Set(items.map((i) => i.description.trim().toLowerCase())).size);
    expect(catalog[0]).toMatchObject({ source: "DECLARATION", hsCode: "84821000", timesDeclared: 1, lastDeclarationDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
    (deps.shipments as FakeShipments).byDossier[D]!.items[0]!.unit.value = "SET";
    unwrap(await refreshFromShipment(deps, declarant, D));
    expect(unwrap(await listLineItems(deps, declarant, D))[0]?.unit).not.toBe("SET");
  });

  it("moveToReview cần HS đủ + tờ khai; approve: VIEWER/DECLARANT FORBIDDEN, BLOCKER → BLOCKER_FAILED, HS thiếu → HS_UNCONFIRMED, đủ → APPROVED + hồ sơ sang submit", async () => {
    // Doanh nghiệp chưa có địa chỉ: 1.15 là chỉ tiêu HT (VNACCS tự hiện theo MST) – không chặn duyệt.
    deps = { ...deps, org: fakeOrg({ ...ORG, address: "" }) };
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
    // Hàng chương 84/85 (CV 2061): chưa chọn MO/CU → chặn duyệt; chọn sai mã → không cho lưu; chọn MO.
    const noMoCu = await approveDeclaration(deps, approver, D);
    expect(noMoCu).toMatchObject({ ok: false, error: { code: "BLOCKER_FAILED", message: expect.stringMatching(/Mã văn bản pháp quy khác \(1\.37\)/) } });
    expect(errCode(await updateDeclarationField(deps, declarant, D, "VBPQ", "XX"))).toBe("VALIDATION");
    expect(errCode(await updateDeclarationField(deps, declarant, D, "VBPQ", ""))).toBe("VALIDATION");
    unwrap(await updateDeclarationField(deps, declarant, D, "VBPQ", "MO"));
    // Mã kho luôn nhập tay (D3): còn trống → không duyệt được, nêu tên chỉ tiêu.
    const missing = await approveDeclaration(deps, approver, D);
    expect(missing).toMatchObject({ ok: false, error: { code: "VALIDATION", message: expect.stringContaining("Mã địa điểm lưu kho") } });
    unwrap(await updateDeclarationField(deps, declarant, D, "KHO", "03CCS01 – Kho CFS Tân Vũ"));
    // Ô bắt buộc trên tờ khai đầy đủ (@kb/contracts declarationRequiredGaps): đường biển phải có hô hiệu (1.31 ô 1, điền sẵn 9999) – xóa đi thì chặn duyệt.
    unwrap(await updateDeclarationField(deps, declarant, D, "HO_HIEU", ""));
    const noCallSign = await approveDeclaration(deps, approver, D);
    expect(noCallSign).toMatchObject({ ok: false, error: { code: "VALIDATION", message: expect.stringContaining("1.31 Phương tiện vận chuyển – Hô hiệu") } });
    unwrap(await updateDeclarationField(deps, declarant, D, "HO_HIEU", "9999"));
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

  it("approve: port sentSheetsGuard (tờ chưa gọi về bị đổi – SENT_SHEETS_CHANGED) chặn duyệt sau mọi kiểm khác; null → duyệt; vai trò vẫn kiểm trước", async () => {
    await runFull("DECLARATION");
    for (const it of unwrap(await listLineItems(deps, declarant, D))) unwrap(await confirmHs(deps, declarant, it.id, "8482.10.00"));
    unwrap(await moveToReview(deps, declarant, D));
    unwrap(await updateDeclarationField(deps, declarant, D, "VBPQ", "MO"));
    unwrap(await updateDeclarationField(deps, declarant, D, "KHO", "03CCS01 – Kho CFS Tân Vũ"));
    const calls: string[] = [];
    const changed = reasonError("BLOCKER_FAILED", "SENT_SHEETS_CHANGED", { sheets: "1, 3", fields: "1.51", linesOnly: "0" });
    deps = { ...deps, sentSheetsGuard: async (orgId, dossierId) => (calls.push(`${orgId}/${dossierId}`), changed) };
    expect(errCode(await approveDeclaration(deps, declarant, D))).toBe("FORBIDDEN");
    expect(await approveDeclaration(deps, approver, D)).toMatchObject({ ok: false, error: { code: "BLOCKER_FAILED", reason: "SENT_SHEETS_CHANGED", params: { sheets: "1, 3" } } });
    expect(calls).toContain(`${approver.orgId}/${D}`);
    expect(dossiers.rows[0]!.status).not.toBe("APPROVED");
    deps = { ...deps, sentSheetsGuard: async () => null };
    expect(unwrap(await approveDeclaration(deps, approver, D))).toMatchObject({ status: "APPROVED" });
  });
});

describe("tổng theo tờ khai nhánh (>50 dòng)", () => {
  const manyItems = (n: number) => (s: ReturnType<typeof hansol>) => {
    const base = s.items[0]!;
    s.items = Array.from({ length: n }, (_, i) => ({ ...base, lineNo: i + 1, amount: { ...base.amount, value: String(100 + i) }, hsOnInvoice: { ...base.hsOnInvoice, value: null } }));
  };
  const withItems = async (n: number) => {
    deps = { ...deps, shipments: new FakeShipments({ [D]: hansol(manyItems(n)) }, { [D]: [{ documentId: "doc_invoice", kind: "INVOICE", raw: { invoiceNo: "HSP-2610-0457" } }] }) };
    await runFull("DECLARATION");
    return unwrap(await getDeclarationView(deps, declarant, D));
  };
  const sum = (xs: string[]) => xs.reduce((a, x) => a.plus(x), new Decimal(0)).toFixed();

  it("guard nội dung đã gửi qua dựng lại thật: khai ngày D, gọi về tờ 2, hôm sau xác nhận lại HS dòng tờ 2 (rebuildDraft – NGAY_DK đổi) → duyệt được; sửa chỉ tiêu chung thật → chặn", async () => {
    await withItems(120);
    for (const it of unwrap(await listLineItems(deps, declarant, D))) unwrap(await confirmHs(deps, declarant, it.id, "8482.10.00"));
    unwrap(await moveToReview(deps, declarant, D));
    unwrap(await updateDeclarationField(deps, declarant, D, "VBPQ", "MO"));
    unwrap(await updateDeclarationField(deps, declarant, D, "KHO", "03CCS01 – Kho CFS Tân Vũ"));
    unwrap(await approveDeclaration(deps, approver, D));
    // Ngày D: Hải quan nhận đủ 3 tờ – ảnh chụp đã gửi = nội dung lúc đó (như raw.sent sau IDA). Rồi gọi về tờ 2 (tờ 1, 3 còn hiệu lực).
    // Payload như cổng DeclarationReader của container (integration/infrastructure/customs-adapters).
    const payloadNow = async () => {
      const x = (await getDeclarationSnapshot(deps, ORG_ID, D))!;
      return { kind: x.kind, direction: x.direction, currency: x.currency, fields: x.fields, items: x.items, adjustments: x.adjustments, containers: x.containers };
    };
    const sentPayload = await payloadNow();
    const sent = [1, 2, 3].map((no) => sheetSnapshot(sentPayload, no));
    const stages = ["PRE_DECLARED", "RECALLED", "PRE_DECLARED"] as const;
    deps = { ...deps, sentSheetsGuard: async () => sentSheetsError(await payloadNow(), stages.map((stage, i) => ({ no: i + 1, stage, declarationNo: `10400000000${i + 1}`, sent: sent[i]! }))) };
    // Hôm sau (cùng tuần tỷ giá): mở lại, bỏ xác nhận rồi xác nhận lại HS dòng 60 (tờ 2) → dựng lại nháp với đồng hồ mới.
    deps = { ...deps, clock: fixedClock("2026-10-15T03:00:00.000Z") };
    unwrap(await markDeclarationDraft(deps, declarant, D));
    const line60 = unwrap(await listLineItems(deps, declarant, D)).find((i) => i.lineNo === 60)!;
    unwrap(await unconfirmHs(deps, declarant, line60.id));
    unwrap(await confirmHs(deps, declarant, line60.id, "8482.10.00"));
    const now = await payloadNow();
    expect(now.fields.NGAY_DK?.value).toBe("2026-10-15");
    expect(sentPayload.fields.NGAY_DK?.value).toBe("2026-10-14");
    expect(unwrap(await approveDeclaration(deps, approver, D))).toMatchObject({ status: "APPROVED" });
    // Sửa chỉ tiêu chung thật (mã kho) → tờ 1, 3 lệch nội dung Hải quan giữ → chặn duyệt.
    unwrap(await markDeclarationDraft(deps, declarant, D));
    unwrap(await updateDeclarationField(deps, declarant, D, "KHO", "03CCS02 – Kho khác"));
    expect(await approveDeclaration(deps, approver, D)).toMatchObject({ ok: false, error: { reason: "SENT_SHEETS_CHANGED", params: { sheets: "1, 3" } } });
  });

  it("phạm vi sửa theo tờ đã gọi về (chỉ tờ 2 gọi về): chỉ tiêu chung / chi phí / dựng lại → COMMON_LOCKED_SHEETS; dòng tờ 1 → LINE_SHEET_LOCKED; dòng tờ 2 sửa được; gọi về hết → như cũ", async () => {
    await withItems(120);
    for (const it of unwrap(await listLineItems(deps, declarant, D))) unwrap(await confirmHs(deps, declarant, it.id, "8482.10.00"));
    unwrap(await moveToReview(deps, declarant, D));
    let stages: CustomsStage[] = ["PRE_DECLARED", "RECALLED", "PRE_DECLARED"];
    deps = { ...deps, customsSheets: async () => stages.map((stage, i) => ({ no: i + 1, stage, declarationNo: `10400000000${i + 1}` })) };
    const lines = unwrap(await listLineItems(deps, declarant, D));
    const line10 = lines.find((i) => i.lineNo === 10)!;
    const line60 = lines.find((i) => i.lineNo === 60)!;
    const common = { ok: false, error: { code: "INVALID_STATE", reason: "COMMON_LOCKED_SHEETS", params: { sheets: "1, 3" } } };
    const sheet1 = { ok: false, error: { code: "INVALID_STATE", reason: "LINE_SHEET_LOCKED", params: { sheet: 1 } } };
    expect(await updateDeclarationField(deps, declarant, D, "CQHQ", "02CI")).toMatchObject(common);
    expect(await updateDeclarationField(deps, declarant, D, "TK_CCC", "B")).toMatchObject(common);
    unwrap(await updateDeclarationField(deps, declarant, D, `HANG.${line60.id}.HAG_RE`, "XN210"));
    expect(await updateDeclarationField(deps, declarant, D, `HANG.${line10.id}.HAG_RE`, "XN210")).toMatchObject(sheet1);
    expect(await saveValueCharges(deps, declarant, D, EMPTY_VALUE_CHARGES)).toMatchObject(common);
    expect(await startAgentRun(deps, declarant, D, "DECLARATION")).toMatchObject(common);
    expect(await startAgentRun(deps, declarant, D, "DIGITIZE")).toMatchObject(common);
    expect(await unconfirmHs(deps, declarant, line10.id)).toMatchObject(sheet1);
    expect(await confirmHs(deps, declarant, line10.id, "8482.20.00")).toMatchObject(sheet1);
    expect(await reclassifyHs(deps, declarant, line10.id, {})).toMatchObject(sheet1);
    expect(await answerHsQuestion(deps, declarant, line10.id, { questionId: "q1", answers: [] })).toMatchObject(sheet1);
    unwrap(await unconfirmHs(deps, declarant, line60.id));
    unwrap(await reclassifyHs(deps, declarant, line60.id, {}));
    const row60 = uow.data.lineItems.find((i) => i.id === line60.id)!;
    Object.assign(row60, { hsStatus: "need_info", hsQuestion: { id: "q1", questions: [{ id: "use", question: "Dùng cho máy nào?" }] } });
    unwrap(await answerHsQuestion(deps, declarant, line60.id, { questionId: "q1", answers: [{ id: "use", selected: [], custom: "Máy tiện" }] }));
    Object.assign(row60, { hsStatus: "completed", hsQuestion: null });
    unwrap(await confirmHs(deps, declarant, line60.id, "8482.10.00"));
    // Gọi về hết → sửa như trước.
    stages = ["RECALLED", "RECALLED", "RECALLED"];
    unwrap(await updateDeclarationField(deps, declarant, D, "CQHQ", "02CI"));
    unwrap(await updateDeclarationField(deps, declarant, D, `HANG.${line10.id}.HAG_RE`, "XN210"));
    unwrap(await saveValueCharges(deps, declarant, D, EMPTY_VALUE_CHARGES));
    unwrap(await startAgentRun(deps, declarant, D, "DECLARATION"));
  });

  it("120 dòng → 3 nhánh, tờ 3 = dòng 101..120, tổng các nhánh = tổng tờ khai", async () => {
    const v = await withItems(120);
    expect(v.branches!).toHaveLength(3);
    expect(v.branches![2]).toMatchObject({ no: 3, of: 3, lineFrom: 101, lineTo: 120 });
    expect(sum(v.branches!.map((b) => b.customsValueVnd))).toBe(v.declaration!.customsValueVnd);
    expect(sum(v.branches!.map((b) => b.estImportDutyVnd))).toBe(v.declaration!.estimatedImportDutyVnd);
    expect(sum(v.branches!.map((b) => b.estVatVnd))).toBe(v.declaration!.estimatedVatVnd);
    expect(v.branches![0]!.invoiceValue).toBe(sum(v.items.slice(0, 50).map((i) => i.amount)));
  });

  it("10 dòng → 1 nhánh khớp tổng", async () => {
    const v = await withItems(10);
    expect(v.branches!).toHaveLength(1);
    expect(v.branches![0]).toMatchObject({ no: 1, of: 1, lineFrom: 1, lineTo: 10, customsValueVnd: v.declaration!.customsValueVnd });
  });
});
