// ADR 0013 – nhập tay dữ liệu lô hàng khi chưa có chứng từ.
import { ManualShipmentSchema } from "@kb/contracts";
import { beforeEach, describe, expect, it } from "vitest";
import { fixedClock } from "../../../../shared/clock.js";
import type { Ctx } from "../../../../shared/ctx.js";
import { asOrgId, asUserId, sequentialIdGen } from "../../../../shared/ids.js";
import { unwrap } from "../../../../shared/result.js";
import { getManualShipment, saveManualShipment } from "../manual-shipment.js";
import type { ExtractionDeps } from "../ports.js";
import { FakeDocuments, InMemoryExtractionUow, NoSkills, NoValidation, RecordingUsage, ScriptedAi } from "../test/fakes.js";

const ctx = (role: Ctx["role"] = "DECLARANT", orgId = "org_a"): Ctx => ({ orgId: asOrgId(orgId), userId: asUserId(`usr_${orgId}`), role });
const DATA = ManualShipmentSchema.parse({
  buyer: { name: "NORDIC TOOLING GROUP AB", country: "SE" },
  invoice: { incoterm: "FOB", currency: "USD" },
  items: [{ description: "Drill bit 10mm", quantity: "1000", unit: "PCE", unitPrice: "1.25", hsOnInvoice: "82075000" }],
});

let uow: InMemoryExtractionUow;
let docs: FakeDocuments;
let validation: NoValidation;
let edited: string[];
let deps: ExtractionDeps;

beforeEach(() => {
  uow = new InMemoryExtractionUow();
  docs = new FakeDocuments();
  docs.dossierStatusValue = "DRAFT";
  docs.dossierOrg.set("dos_1", "org_a");
  validation = new NoValidation();
  edited = [];
  deps = {
    uow, documents: docs, validation, ai: new ScriptedAi({}), usage: new RecordingUsage(), skills: new NoSkills(), clock: fixedClock("2026-11-10T03:00:00.000Z"), idGen: sequentialIdGen(),
    onShipmentEdited: async (_o, d) => void edited.push(d),
  };
});

describe("nhập tay dữ liệu lô hàng (ADR 0013)", () => {
  it("lưu khi hồ sơ chưa có chứng từ → shipment có dòng hàng + tổng, chạy luật, dựng lại tờ khai, ghi field_audit MANUAL_EDIT", async () => {
    const v = unwrap(await saveManualShipment(deps, ctx(), "dos_1", DATA));
    expect(v).toMatchObject({ data: DATA, updatedAt: "2026-11-10T03:00:00.000Z", editable: true });
    const s = uow.data.shipments.at(-1)!;
    expect(s.version).toBe(1);
    expect(s.data.items).toHaveLength(1);
    expect(s.data.invoice.totalAmount.value).toBe("1250.00");
    expect(s.data.parties.buyer.name).toMatchObject({ value: "NORDIC TOOLING GROUP AB", status: "USER_CONFIRMED" });
    expect(validation.runs).toHaveLength(1);
    expect(edited).toEqual(["dos_1"]);
    expect(uow.data.audit).toContainEqual(expect.objectContaining({ key: "/items/1/unitPrice", oldValue: "", newValue: "1.25", source: "MANUAL_EDIT", userId: "usr_org_a", fieldId: null, documentId: null }));
    // không có chứng từ → không báo "đã đọc xong bộ chứng từ"
    expect(docs.events.some((e) => e.type === "fields.updated")).toBe(true);
  });

  it("lưu lại không đổi gì → không ghi audit, không gộp lại; đổi một ô → một dòng audit, shipment version mới", async () => {
    unwrap(await saveManualShipment(deps, ctx(), "dos_1", DATA));
    const audits = uow.data.audit.length;
    unwrap(await saveManualShipment(deps, ctx(), "dos_1", DATA));
    expect(uow.data.audit).toHaveLength(audits);
    expect(uow.data.shipments).toHaveLength(1);
    unwrap(await saveManualShipment(deps, ctx(), "dos_1", { ...DATA, buyer: { ...DATA.buyer, name: "NORDIC AB" } }));
    expect(uow.data.audit.slice(audits)).toEqual([expect.objectContaining({ key: "/parties/buyer/name", oldValue: "NORDIC TOOLING GROUP AB", newValue: "NORDIC AB" })]);
    expect(uow.data.shipments.at(-1)!.version).toBe(2);
    expect(uow.data.manual).toHaveLength(1);
  });

  it("hồ sơ đã duyệt/truyền → DOSSIER_LOCKED, đọc được nhưng editable=false; VIEWER không lưu được", async () => {
    unwrap(await saveManualShipment(deps, ctx(), "dos_1", DATA));
    docs.dossierStatusValue = "SUBMITTED";
    expect(await saveManualShipment(deps, ctx(), "dos_1", DATA)).toMatchObject({ ok: false, error: { code: "DOSSIER_LOCKED" } });
    expect(unwrap(await getManualShipment(deps, ctx(), "dos_1"))).toMatchObject({ data: DATA, editable: false });
    docs.dossierStatusValue = "DRAFT";
    expect(await saveManualShipment(deps, ctx("VIEWER"), "dos_1", DATA)).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(unwrap(await getManualShipment(deps, ctx("VIEWER"), "dos_1")).editable).toBe(false);
  });

  it("org khác: không đọc, không ghi được hồ sơ của org_a (NOT_FOUND), dữ liệu org_a giữ nguyên", async () => {
    unwrap(await saveManualShipment(deps, ctx(), "dos_1", DATA));
    expect(await getManualShipment(deps, ctx("OWNER", "org_b"), "dos_1")).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await saveManualShipment(deps, ctx("OWNER", "org_b"), "dos_1", { ...DATA, items: [] })).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(uow.data.manual).toEqual([expect.objectContaining({ orgId: "org_a", data: DATA })]);
  });
});

describe("nhập tay – ký mã hiệu", () => {
  it("lưu ký mã hiệu, ghi audit", async () => {
    const v = unwrap(await saveManualShipment(deps, ctx(), "dos_1", { ...DATA, marks: "NTG / STOCKHOLM" }));
    expect(v.data?.marks).toBe("NTG / STOCKHOLM");
    expect(uow.data.audit.map((a) => a.key)).toEqual(expect.arrayContaining(["/marks"]));
  });
});
