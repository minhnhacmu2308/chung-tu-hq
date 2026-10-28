import { beforeEach, describe, expect, it } from "vitest";
import { EMPTY_VALUE_CHARGES, type ValueCharges } from "@kb/contracts";
import { fixedClock } from "../../../../shared/clock.js";
import type { Ctx } from "../../../../shared/ctx.js";
import { asOrgId, asUserId, sequentialIdGen } from "../../../../shared/ids.js";
import { InMemoryJobQueue } from "../../../../shared/queue.js";
import { errCode, unwrap } from "../../../../shared/result.js";
import { DOSSIER, hansol, ORG } from "../../domain/test/shipment.js";
import { runAgent, startAgentRun } from "../agent-run.js";
import { getDeclarationView } from "../declaration.js";
import type { DeclarationDeps } from "../ports.js";
import { getValueCharges, saveValueCharges } from "../value-charges.js";
import { FakeDossiers, FakeShipments, fakeOrg, fakeUsers, fakeValidation, RecordingAudit, ScriptedHs } from "../test/fakes.js";
import { InMemoryDeclarationUow } from "../test/in-memory-uow.js";

const ORG_ID = "org_a";
const declarant: Ctx = { orgId: asOrgId(ORG_ID), userId: asUserId("usr_chau"), role: "DECLARANT" };
const viewer: Ctx = { orgId: asOrgId(ORG_ID), userId: asUserId("usr_v"), role: "VIEWER" };
const other: Ctx = { orgId: asOrgId("org_b"), userId: asUserId("usr_x"), role: "ADMIN" };
const D = "dos_1";

let uow: InMemoryDeclarationUow;
let queue: InMemoryJobQueue;
let dossiers: FakeDossiers;
let audit: RecordingAudit;
let deps: DeclarationDeps;

beforeEach(() => {
  uow = new InMemoryDeclarationUow();
  uow.data.exchangeRates.push({ currency: "USD", date: "2026-10-13", rate: "25400" });
  queue = new InMemoryJobQueue();
  dossiers = new FakeDossiers([{ ...DOSSIER, orgId: ORG_ID, status: "NEEDS_REVIEW", step: "ocr" }], { [D]: [{ id: "doc_invoice", kind: "INVOICE", fileName: "inv.pdf" }] });
  audit = new RecordingAudit();
  deps = {
    uow, queue, hs: new ScriptedHs([]), shipments: new FakeShipments({ [D]: hansol() }), dossiers, validation: fakeValidation({}),
    org: fakeOrg(ORG), audit, users: fakeUsers, clock: fixedClock("2026-10-14T03:00:00.000Z"), idGen: sequentialIdGen(),
  };
});

async function buildDraft() {
  unwrap(await startAgentRun(deps, declarant, D, "DECLARATION"));
  const job = queue.jobs.filter((j) => j.name === "run-agent").at(-1)!.payload as { agentRunId: string };
  unwrap(await runAgent(deps, { orgId: ORG_ID, userId: "usr_chau", dossierId: D, agentRunId: job.agentRunId }));
}
const manualFreight: ValueCharges = { ...EMPTY_VALUE_CHARGES, freight: { amount: "1300", currency: "USD", reason: "CONTRACT", note: "" } };

describe("chi phí và điều chỉnh trị giá", () => {
  it("xem: FCA phải có cước, giá trị đọc từ chứng từ, chưa nhập tay; người xem đọc được", async () => {
    const v = unwrap(await getValueCharges(deps, viewer, D));
    expect(v).toMatchObject({ direction: "NK", incoterm: "FCA", freightRequired: true, insuranceIncluded: false, locked: false, charges: EMPTY_VALUE_CHARGES, updatedAt: null });
    expect(v.freightVnd).toBe("29210000"); // cước 1150 USD × tỷ giá tính thuế 25.400 – trị giá đổi chừng này khi đổi điều kiện giao hàng
    expect(v.fromDocuments.freight).toMatchObject({ amount: "1150", currency: "USD" });
  });

  it("lưu: ghi field_audit phần đổi, dựng lại tờ khai nháp (1.47 theo số nhập tay, nguồn USER); lưu lại y nguyên không ghi audit", async () => {
    await buildDraft();
    const rerun: string[] = [];
    deps.onChargesSaved = async (orgId, dossierId) => void rerun.push(`${orgId}/${dossierId}`);
    const before = unwrap(await getDeclarationView(deps, declarant, D)).declaration!;
    const v = unwrap(await saveValueCharges(deps, declarant, D, manualFreight));
    expect(v.charges.freight).toMatchObject({ amount: "1300" });
    expect(v.updatedBy).toBe("usr_chau");
    expect(rerun).toEqual([`${ORG_ID}/${D}`]); // chạy lại luật đối chiếu (R-INCOTERM-FREIGHT đọc chi phí nhập tay)
    expect(audit.rows).toEqual([expect.objectContaining({ orgId: ORG_ID, dossierId: D, key: "CHARGES.freight", oldValue: "", source: "CHARGE_EDIT" })]);
    const after = unwrap(await getDeclarationView(deps, declarant, D)).declaration!;
    expect(after.fields.find((f) => f.code === "PHI_VC")).toMatchObject({ value: "1300 USD", source: "USER" });
    expect(after.customsValueVnd).not.toBe(before.customsValueVnd);
    unwrap(await saveValueCharges(deps, declarant, D, manualFreight));
    expect(audit.rows).toHaveLength(1);
  });

  it("người xem → FORBIDDEN; doanh nghiệp khác → NOT_FOUND, không ghi; hồ sơ đã duyệt → DOSSIER_LOCKED", async () => {
    expect(errCode(await saveValueCharges(deps, viewer, D, manualFreight))).toBe("FORBIDDEN");
    expect(errCode(await saveValueCharges(deps, other, D, manualFreight))).toBe("NOT_FOUND");
    expect(errCode(await getValueCharges(deps, other, D))).toBe("NOT_FOUND");
    expect(uow.data.valueCharges).toEqual([]);
    dossiers.rows[0]!.status = "APPROVED";
    expect(errCode(await saveValueCharges(deps, declarant, D, manualFreight))).toBe("DOSSIER_LOCKED");
    expect(unwrap(await getValueCharges(deps, declarant, D)).locked).toBe(true);
  });

  it("ràng buộc theo chứng từ: có cước mà nhập tay chỉ ghi lý do → VALIDATION; có phí khác mà khai không có phí phát sinh → VALIDATION; không ghi", async () => {
    const noAmount = await saveValueCharges(deps, declarant, D, { ...EMPTY_VALUE_CHARGES, freight: { amount: null, currency: null, reason: "CONTRACT", note: "" } });
    expect(noAmount).toMatchObject({ ok: false, error: { code: "VALIDATION", reason: "CHARGES_FREIGHT_AMOUNT_REQUIRED", params: { amount: "1150", currency: "USD" } } });
    const none = await saveValueCharges(deps, declarant, D, { ...EMPTY_VALUE_CHARGES, adjustments: [] });
    expect(none).toMatchObject({ ok: false, error: { code: "VALIDATION", reason: "CHARGES_ADJUSTMENTS_IN_DOCS", params: { n: 2 } } });
    expect(uow.data.valueCharges).toEqual([]);
    expect(audit.rows).toEqual([]);
  });

  it("cước quy đổi VND theo tỷ giá của ngày khai giờ Việt Nam (18:00 UTC = sáng hôm sau ở VN); chưa có tỷ giá → null", async () => {
    uow.data.exchangeRates.push({ currency: "USD", date: "2026-10-15", rate: "26000" });
    deps.clock = fixedClock("2026-10-14T18:00:00.000Z"); // 01:00 ngày 15/10 giờ VN
    expect(unwrap(await getValueCharges(deps, declarant, D)).freightVnd).toBe("29900000"); // 1150 × 26.000, không phải tỷ giá ngày 14
    uow.data.exchangeRates.length = 0;
    expect(unwrap(await getValueCharges(deps, declarant, D)).freightVnd).toBeNull();
  });

  it("xuất khẩu: bỏ danh sách khoản điều chỉnh (không có chỉ tiêu 1.49)", async () => {
    dossiers.rows[0]!.direction = "XK";
    const v = unwrap(await saveValueCharges(deps, declarant, D, { ...EMPTY_VALUE_CHARGES, adjustments: [{ code: "A", kind: "AD", amount: "10", currency: "USD", note: "", allocate: true }] }));
    expect(v.charges.adjustments).toBeNull();
  });
});
