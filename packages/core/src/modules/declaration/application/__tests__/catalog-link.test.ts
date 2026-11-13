// Nối danh mục hàng hóa dùng chung vào tờ khai (Task 5, spec §5): gắn mặt hàng theo Part No người bán, HAG_MAHANG = mã bộ Hải quan,
// mã lạ không chặn truyền (Review Focus 5), gợi ý lượng quy đổi theo lô, duyệt tờ khai → times_declared / hàng chờ, bài học tra theo bí danh.
import { beforeEach, describe, expect, it } from "vitest";
import { fptKey, type DraftLessons } from "@kb/contracts";
import { fixedClock } from "../../../../shared/clock.js";
import type { Ctx } from "../../../../shared/ctx.js";
import { asOrgId, asUserId, sequentialIdGen } from "../../../../shared/ids.js";
import { InMemoryJobQueue } from "../../../../shared/queue.js";
import { errCode, unwrap } from "../../../../shared/result.js";
import { DOSSIER, hansol, ORG } from "../../domain/test/shipment.js";
import { buildFptRequest, sentSheetsError, sheetSnapshot } from "../../../integration/index.js";
import { runAgent, startAgentRun } from "../agent-run.js";
import { getDeclarationSnapshot, markDeclarationDraft, refreshFromShipment } from "../customs-bridge.js";
import { approveDeclaration, getDeclarationView, moveToReview, updateDeclarationField } from "../declaration.js";
import { linkLineItem, setLineUnitFactor } from "../line-catalog.js";
import { confirmHs, listLineItems } from "../line-items.js";
import type { DeclarationDeps } from "../ports.js";
import { FakeCatalog, FakeDossiers, FakeShipments, fakeOrg, fakeUsers, fakeValidation, RecordingAudit, ScriptedHs } from "../test/fakes.js";
import { InMemoryDeclarationUow } from "../test/in-memory-uow.js";

const ORG_ID = "org_a";
const declarant: Ctx = { orgId: asOrgId(ORG_ID), userId: asUserId("usr_chau"), role: "DECLARANT" };
const approver: Ctx = { orgId: asOrgId(ORG_ID), userId: asUserId("usr_tuan"), role: "APPROVER" };
const viewer: Ctx = { orgId: asOrgId(ORG_ID), userId: asUserId("usr_v"), role: "VIEWER" };
const other: Ctx = { orgId: asOrgId("org_b"), userId: asUserId("usr_x"), role: "ADMIN" };
const D = "dos_1";

let uow: InMemoryDeclarationUow;
let queue: InMemoryJobQueue;
let audit: RecordingAudit;
let catalog: FakeCatalog;
let shipments: FakeShipments;
let deps: DeclarationDeps;

beforeEach(() => {
  uow = new InMemoryDeclarationUow();
  uow.data.catalogHs.push({ code: "8482.10.00", description: "Ổ bi cầu", mfn: "3", pref: { AK: "0" }, vat: "8", policy: null, keywords: ["ball bearing"] });
  uow.data.exchangeRates.push({ currency: "USD", date: "2026-10-13", rate: "25400" });
  queue = new InMemoryJobQueue();
  audit = new RecordingAudit();
  catalog = new FakeCatalog();
  // Dòng 1: Part No đã có bí danh trong bộ nhà cung cấp HANSOL, mặt hàng có mã XNK. Dòng 2: mã lạ. Dòng 3+: không có Part No.
  catalog.addItem({ id: "cat_1", itemNo: "MH-000001", name: "Ổ bi 6205", hsCode: "84821000", baseUnit: "PCE", customs: { codeSetId: "cst_xnk", aliasId: "ali_hq", code: "XNK-6205", unit: "PCS" }, codes: ["6205-2RS", "OLD-6205", "XNK-6205"] }, ["6205-2RS"]);
  shipments = new FakeShipments({ [D]: hansol((s) => {
    s.items[0]!.partNo.value = "6205 2RS";
    s.items[1]!.partNo.value = "6308ZZ-NEW";
  }) });
  deps = {
    uow, queue, hs: new ScriptedHs([{ match: /./, code: "8482.10.00", description: "Ổ bi cầu", confidence: 0.8 }]), shipments,
    dossiers: new FakeDossiers([{ ...DOSSIER, orgId: ORG_ID, status: "NEEDS_REVIEW", step: "ocr" }]), validation: fakeValidation(),
    org: fakeOrg(ORG), audit, users: fakeUsers, clock: fixedClock("2026-10-14T03:00:00.000Z"), idGen: sequentialIdGen(), catalog,
  };
});

async function readyToApprove() {
  unwrap(await startAgentRun(deps, declarant, D, "DECLARATION"));
  const job = queue.jobs.filter((j) => j.name === "run-agent").at(-1)!.payload as { agentRunId: string };
  unwrap(await runAgent(deps, { orgId: ORG_ID, userId: "usr_chau", dossierId: D, agentRunId: job.agentRunId }));
  for (const it of unwrap(await listLineItems(deps, declarant, D))) unwrap(await confirmHs(deps, declarant, it.id, "8482.10.00"));
  unwrap(await moveToReview(deps, declarant, D));
  unwrap(await updateDeclarationField(deps, declarant, D, "VBPQ", "MO"));
  unwrap(await updateDeclarationField(deps, declarant, D, "KHO", "03CCS01 – Kho CFS Tân Vũ"));
}

describe("dòng hàng gắn mặt hàng danh mục", () => {
  it("Part No đã có bí danh → dòng gắn đúng mặt hàng, HAG_MAHANG = mã XNK; mã lạ → unknownCode; dòng không Part No → không đánh dấu", async () => {
    const items = unwrap(await listLineItems(deps, declarant, D));
    expect(items[0]).toMatchObject({ catalogItem: { id: "cat_1", itemNo: "MH-000001", name: "Ổ bi 6205" }, itemCode: "XNK-6205" });
    expect(items[0]!.unknownCode).toBeUndefined();
    expect(items[1]).toMatchObject({ unknownCode: true });
    expect(items[1]!.catalogItem).toBeUndefined();
    expect(items[1]!.itemCode).toBeUndefined();
    expect(items[2]!.unknownCode).toBeUndefined();
    expect(uow.data.lineItems[0]).toMatchObject({ catalogItemId: "cat_1", catalogAliasId: "ali_cat_1", itemCode: "XNK-6205" });
  });

  it("danh mục lỗi → dòng hàng vẫn dựng được (không gắn), không chặn", async () => {
    catalog.failResolve = true;
    const items = unwrap(await listLineItems(deps, declarant, D));
    expect(items).toHaveLength(7);
    expect(items[0]!.catalogItem).toBeUndefined();
  });

  it("mã lạ: duyệt + truyền vẫn được; HAG_MAHANG trống + cảnh báo (không chặn) – Review Focus 5", async () => {
    await readyToApprove();
    expect(unwrap(await approveDeclaration(deps, approver, D))).toMatchObject({ status: "APPROVED" });
    const snap = (await getDeclarationSnapshot(deps, ORG_ID, D))!;
    expect(snap.items[0]).toMatchObject({ itemCode: "XNK-6205" });
    expect(snap.items[1]).not.toHaveProperty("itemCode");
    const built = buildFptRequest({ kind: snap.kind, direction: snap.direction, currency: snap.currency, fields: snap.fields, items: snap.items, adjustments: snap.adjustments, containers: snap.containers, itemNotes: snap.itemNotes });
    const hang = (built.request as unknown as { objVN_IDA_HANG: Record<string, unknown>[] }).objVN_IDA_HANG;
    expect(hang[0]![fptKey("HAG_MAHANG")]).toBe("XNK-6205");
    expect(hang[1]![fptKey("HAG_MAHANG")]).toBeUndefined();
    expect(built.warnings.some((w) => /Dòng 2.*6308ZZ-NEW.*HAG_MAHANG/.test(w))).toBe(true);
    expect(built.blockers.some((b) => /HAG_MAHANG|mã hàng/i.test(b))).toBe(false);
  });

  it("duyệt tờ khai → recordDeclared một lần cho dòng đã gắn; dòng chưa gắn → hàng chờ (bộ nhà cung cấp); không ghi product_catalog cũ", async () => {
    await readyToApprove();
    unwrap(await approveDeclaration(deps, approver, D));
    expect(catalog.declared).toHaveLength(1);
    expect(catalog.declared[0]!.rows).toEqual([{ itemId: "cat_1", declarationNo: null, date: "2026-10-14", typeCode: "A11" }]);
    expect(catalog.queued).toHaveLength(1);
    const q = catalog.queued[0]!.rows;
    expect(q).toHaveLength(6);
    expect(q[0]).toMatchObject({ codeSetId: "cst_ncc_1", code: "6308ZZ-NEW", name: "Deep groove ball bearing 6308ZZ", sourceRef: expect.stringMatching(/^declaration:.+:2$/) });
    // Dòng không Part No: không gắn bộ nhà cung cấp (mã trống, bộ mặc định).
    expect(q[1]).toMatchObject({ codeSetId: null, code: "" });
  });

  it("danh mục lỗi khi duyệt → tờ khai vẫn APPROVED", async () => {
    await readyToApprove();
    catalog.recordDeclared = async () => { throw new Error("down"); };
    expect(unwrap(await approveDeclaration(deps, approver, D))).toMatchObject({ status: "APPROVED" });
  });
});

describe("linkLineItem – \"Mã lạ – Chọn mặt hàng\"", () => {
  it("người khai chọn mặt hàng → bí danh PROPOSED trong bộ nhà cung cấp, dòng gắn mặt hàng, ghi field_audit", async () => {
    catalog.addItem({ id: "cat_2", itemNo: "MH-000002", name: "Ổ bi 6308", customs: { codeSetId: "cst_xnk", aliasId: "ali_hq2", code: "XNK-6308", unit: "PCS" } });
    const line = unwrap(await listLineItems(deps, declarant, D))[1]!;
    const got = unwrap(await linkLineItem(deps, declarant, line.id, { itemId: "cat_2" }));
    expect(got).toMatchObject({ catalogItem: { id: "cat_2", itemNo: "MH-000002" }, itemCode: "XNK-6308" });
    expect(got.unknownCode).toBeUndefined();
    expect(catalog.proposed).toEqual([{ userId: "usr_chau", itemId: "cat_2", codeSetId: "cst_ncc_1", code: "6308ZZ-NEW", status: "PROPOSED" }]);
    expect(audit.rows.at(-1)).toMatchObject({ dossierId: D, key: "catalog:2", oldValue: "", newValue: "MH-000002", source: "CATALOG_EDIT" });
    // Bí danh còn chờ duyệt: dựng lại dòng hàng không gỡ mặt hàng người khai đã chọn.
    expect(unwrap(await listLineItems(deps, declarant, D))[1]).toMatchObject({ catalogItem: { id: "cat_2" } });
  });

  it("tạo mặt hàng mới từ dòng; VIEWER → FORBIDDEN; org khác → NOT_FOUND; mặt hàng không có → lỗi trước khi ghi", async () => {
    const line = unwrap(await listLineItems(deps, declarant, D))[1]!;
    expect(errCode(await linkLineItem(deps, viewer, line.id, { itemId: "cat_1" }))).toBe("FORBIDDEN");
    expect(errCode(await linkLineItem(deps, other, line.id, { itemId: "cat_1" }))).toBe("NOT_FOUND");
    expect(errCode(await linkLineItem(deps, declarant, line.id, { itemId: "cat_none" }))).toBe("NOT_FOUND");
    expect(uow.data.lineItems[1]!.catalogItemId ?? null).toBeNull();
  });

  it("tạo mặt hàng mới: người sửa thông tin chung → tạo kèm mã Part No trong bộ nhà cung cấp (một use case, không đề xuất riêng); hệ số theo ĐVT dòng", async () => {
    const line = unwrap(await listLineItems(deps, declarant, D))[1]!;
    const got = unwrap(await linkLineItem(deps, approver, line.id, { createItem: { kind: "GOODS", name: "Ổ bi 6308ZZ", hsCode: "8482.10.00", baseUnit: "SET", factor: "2" } }));
    expect(got.catalogItem).toMatchObject({ name: "Ổ bi 6308ZZ" });
    expect(catalog.created).toEqual([{ userId: "usr_tuan", status: "CREATED", input: expect.objectContaining({ codeSetId: "cst_ncc_1", code: "6308ZZ-NEW", conversions: [{ unit: "PCS", factor: "2" }] }) }]);
    expect(catalog.proposed).toEqual([]);
  });

  it("tạo mặt hàng mới: người khai không đủ quyền → hàng chờ mang mã + bộ nhà cung cấp; dòng chưa gắn (vẫn \"mã lạ\"), không mặt hàng mồ côi", async () => {
    const line = unwrap(await listLineItems(deps, declarant, D))[1]!;
    const got = unwrap(await linkLineItem(deps, declarant, line.id, { createItem: { kind: "GOODS", name: "Ổ bi 6308ZZ" } }));
    expect(got).toMatchObject({ unknownCode: true });
    expect(got.catalogItem).toBeUndefined();
    expect(catalog.created).toEqual([{ userId: "usr_chau", status: "QUEUED", input: expect.objectContaining({ codeSetId: "cst_ncc_1", code: "6308ZZ-NEW" }) }]);
    expect([...catalog.items.keys()]).toEqual(["cat_1"]);
    expect(uow.data.lineItems[1]!.catalogItemId ?? null).toBeNull();
  });

  it("dòng đã gắn tay mặt hàng Y: tra chắc chắn ra X khác không đè – giữ Y qua đồng bộ lại và duyệt", async () => {
    catalog.addItem({ id: "cat_y", itemNo: "MH-0000Y", name: "Ổ bi Y", customs: { codeSetId: "cst_xnk", aliasId: "ali_y", code: "XNK-Y", unit: "PCS" } });
    const line = unwrap(await listLineItems(deps, declarant, D))[0]!;
    expect(line.catalogItem?.id).toBe("cat_1");
    unwrap(await linkLineItem(deps, declarant, line.id, { itemId: "cat_y" }));
    await readyToApprove();
    expect(unwrap(await listLineItems(deps, declarant, D))[0]).toMatchObject({ catalogItem: { id: "cat_y" }, itemCode: "XNK-Y" });
    unwrap(await approveDeclaration(deps, approver, D));
    expect(uow.data.lineItems.find((x) => x.lineNo === 1)).toMatchObject({ catalogItemId: "cat_y", itemCode: "XNK-Y" });
    expect(catalog.declared[0]!.rows).toEqual([{ itemId: "cat_y", declarationNo: null, date: "2026-10-14", typeCode: "A11" }]);
  });

  it("dòng chứng từ mang sẵn mặt hàng (lô nhập tay chọn từ danh mục) → gắn thẳng mặt hàng đó, thắng kết quả tra theo Part No; không còn → như dòng thường", async () => {
    catalog.addItem({ id: "cat_z", itemNo: "MH-0000Z", name: "Ổ bi Z", customs: { codeSetId: "cst_xnk", aliasId: "ali_z", code: "XNK-Z", unit: "PCS" } });
    shipments.byDossier[D]!.items[0]!.catalogItemId = "cat_z";
    shipments.byDossier[D]!.items[2]!.catalogItemId = "cat_khong_co";
    const items = unwrap(await listLineItems(deps, declarant, D));
    expect(items[0]).toMatchObject({ catalogItem: { id: "cat_z", itemNo: "MH-0000Z" }, itemCode: "XNK-Z" });
    expect(uow.data.lineItems.find((x) => x.lineNo === 1)).toMatchObject({ catalogItemId: "cat_z", catalogAliasId: null, itemCode: "XNK-Z" });
    // Mặt hàng không có / đã ngưng dùng → không gắn bừa, dòng không Part No giữ như cũ.
    expect(items[2]!.catalogItem).toBeUndefined();
    // Đổi lựa chọn ở lô nhập tay → dòng theo mặt hàng mới khi đồng bộ lại.
    shipments.byDossier[D]!.items[0]!.catalogItemId = "cat_1";
    unwrap(await refreshFromShipment(deps, declarant, D));
    expect(uow.data.lineItems.find((x) => x.lineNo === 1)).toMatchObject({ catalogItemId: "cat_1", catalogAliasId: "ali_cat_1", itemCode: "XNK-6205" });
  });
});

describe("gợi ý lượng theo ĐVT khai (quy đổi)", () => {
  beforeEach(() => {
    catalog.addItem({ id: "cat_vai", name: "Vải cotton", baseUnit: "MTR", customs: { codeSetId: "cst_xnk", aliasId: "ali_vai", code: "XNK-VAI", unit: "MTR" }, conversion: { base: "MTR", factors: { ROL: "100" } } }, ["6205-2RS"]);
    const s = shipments.byDossier[D]!;
    s.items[0]!.unit.value = "ROL";
    s.items[0]!.quantity.value = "20";
  });

  it("cuộn → mét theo hệ số mặc định; hệ số lô thắng mặc định; lệch > 20% → cảnh báo; ghi field_audit; org khác không sửa được", async () => {
    const line = unwrap(await listLineItems(deps, declarant, D))[0]!;
    expect(line.qtySuggestion).toEqual({ qty: "2000", unit: "MTR", factor: "100", lotFactor: false, deviates: false });
    expect(unwrap(await setLineUnitFactor(deps, declarant, line.id, "95")).qtySuggestion).toEqual({ qty: "1900", unit: "MTR", factor: "95", lotFactor: true, deviates: false });
    expect(audit.rows.at(-1)).toMatchObject({ key: "unitFactor:1", oldValue: "", newValue: "95", source: "CATALOG_EDIT" });
    expect(unwrap(await setLineUnitFactor(deps, declarant, line.id, "50")).qtySuggestion).toMatchObject({ qty: "1000", lotFactor: true, deviates: true });
    expect(unwrap(await setLineUnitFactor(deps, declarant, line.id, null)).qtySuggestion).toMatchObject({ qty: "2000", lotFactor: false });
    expect(errCode(await setLineUnitFactor(deps, other, line.id, "95"))).toBe("NOT_FOUND");
    expect(errCode(await setLineUnitFactor(deps, viewer, line.id, "95"))).toBe("FORBIDDEN");
    expect(errCode(await setLineUnitFactor(deps, declarant, line.id, "-1"))).toBe("VALIDATION");
    expect(errCode(await setLineUnitFactor(deps, declarant, line.id, "0"))).toBe("VALIDATION");
    expect((deps.dossiers as FakeDossiers).events.filter((e) => e.type === "dossier.updated").length).toBeGreaterThan(0);
  });

  it("getDeclarationView (màn Review) mang cùng phần danh mục như listLineItems: gợi ý lượng, mặt hàng, mã lạ; không nối danh mục → không thêm gì", async () => {
    unwrap(await listLineItems(deps, declarant, D));
    const view = unwrap(await getDeclarationView(deps, declarant, D));
    expect(view.items[0]).toMatchObject({ catalogItem: { id: "cat_vai" }, qtySuggestion: { qty: "2000", unit: "MTR", factor: "100", lotFactor: false, deviates: false } });
    expect(view.items[1]).toMatchObject({ unknownCode: true });
    const { catalog: _off, ...withoutCatalog } = deps;
    const noCatalog = unwrap(await getDeclarationView(withoutCatalog, declarant, D));
    for (const it of noCatalog.items) {
      expect(it.catalogItem).toBeUndefined();
      expect(it.unknownCode).toBeUndefined();
      expect(it.qtySuggestion).toBeUndefined();
    }
    expect(errCode(await getDeclarationView(deps, other, D))).toBe("NOT_FOUND");
  });
});

describe("bài học dòng hàng tra theo bí danh trước khóa P:<partNo>", () => {
  it("bài học học theo mã cũ OLD-6205; dòng ghi mã mới 6205-2RS cùng mặt hàng → nhận bài học", async () => {
    const lessons: DraftLessons = {
      fields: {}, clauses: {},
      lines: [{ lessonId: "les_1", key: "P:OLD6205", value: "8482.10.00", hits: 3, autoFill: true, conflicts: [], declarationNo: "106794645160", line: { hsCode: "84821000", description: "Ổ bi cầu 6205 (học)", importRate: "0", importTaxSchedule: null, vatRate: "8", vatExemptCode: null } }],
    };
    deps.lessons = async () => lessons;
    const items = unwrap(await listLineItems(deps, declarant, D));
    expect(items[0]).toMatchObject({ description: "Ổ bi cầu 6205 (học)", hsSuggested: "8482.10.00" });
    expect(items[1]!.description).toBe("Deep groove ball bearing 6308ZZ");
  });
});

describe("lô nhiều tờ đã truyền: danh mục đổi mã không đổi nội dung tờ đã gửi (SENT_SHEETS_CHANGED)", () => {
  it("tờ 1, 3 còn hiệu lực, tờ 2 gọi về; mã XNK đổi → mở lại + đồng bộ + duyệt: tờ 1 giữ nguyên ảnh chụp, duyệt không bị chặn; dòng tờ 2 nhận mã mới", async () => {
    shipments.byDossier[D] = hansol((s) => {
      const base = s.items[0]!;
      s.items = Array.from({ length: 120 }, (_, i) => ({ ...base, lineNo: i + 1, amount: { ...base.amount, value: String(100 + i) }, hsOnInvoice: { ...base.hsOnInvoice, value: null }, partNo: { ...base.partNo, value: "6205-2RS" } }));
    });
    await readyToApprove();
    unwrap(await approveDeclaration(deps, approver, D));
    const payloadNow = async () => {
      const x = (await getDeclarationSnapshot(deps, ORG_ID, D))!;
      return { kind: x.kind, direction: x.direction, currency: x.currency, fields: x.fields, items: x.items, itemNotes: x.itemNotes, adjustments: x.adjustments, containers: x.containers };
    };
    const sentPayload = await payloadNow();
    expect(sentPayload.items.every((i) => i.itemCode === "XNK-6205")).toBe(true);
    const sent = [1, 2, 3].map((no) => sheetSnapshot(sentPayload, no));
    const stages = ["PRE_DECLARED", "RECALLED", "PRE_DECLARED"] as const;
    deps.customsSheets = async () => stages.map((stage, i) => ({ no: i + 1, stage, declarationNo: `10400000000${i + 1}` }));
    deps.sentSheetsGuard = async () => sentSheetsError(await payloadNow(), stages.map((stage, i) => ({ no: i + 1, stage, declarationNo: `10400000000${i + 1}`, sent: sent[i]! })));
    // Người phụ trách bộ XNK đổi mã mặt hàng sau khi truyền.
    catalog.items.get("cat_1")!.customs = { codeSetId: "cst_xnk", aliasId: "ali_hq_new", code: "XNK-NEW", unit: "PCS" };
    unwrap(await markDeclarationDraft(deps, declarant, D));
    unwrap(await refreshFromShipment(deps, declarant, D));
    expect(unwrap(await approveDeclaration(deps, approver, D))).toMatchObject({ status: "APPROVED" });
    const after = await payloadNow();
    expect(sheetSnapshot(after, 1)).toEqual(sent[0]);
    expect(sheetSnapshot(after, 3)).toEqual(sent[2]);
    expect(after.items.find((i) => i.lineNo === 10)?.itemCode).toBe("XNK-6205");
    expect(after.items.find((i) => i.lineNo === 60)?.itemCode).toBe("XNK-NEW");
    expect(after.items.find((i) => i.lineNo === 110)?.itemCode).toBe("XNK-6205");
  });
});
