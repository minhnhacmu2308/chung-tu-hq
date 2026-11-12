// ADR 0013 mục 3 – hóa đơn thương mại sau thông quan: cấp số (cách A), phát hành sau thông quan, hủy số, mẫu số, mẫu in, quyền, org khác.
import { DEFAULT_INVOICE_LAYOUT, ManualShipmentSchema } from "@kb/contracts";
import { beforeEach, describe, expect, it } from "vitest";
import { fixedClock } from "../../../../shared/clock.js";
import type { Ctx } from "../../../../shared/ctx.js";
import { asOrgId, asUserId, sequentialIdGen } from "../../../../shared/ids.js";
import { unwrap } from "../../../../shared/result.js";
import { deleteInvoiceTemplate, listInvoiceTemplates, saveInvoiceTemplate } from "../invoice-templates.js";
import { getIssuedInvoices, issueInvoiceAction } from "../issued-invoice.js";
import { saveManualShipment } from "../manual-shipment.js";
import { refreshAfterSourcesChanged } from "../_remerge.js";
import type { ExtractionDeps } from "../ports.js";
import { FakeDocuments, InMemoryExtractionUow, NoSkills, NoValidation, RecordingUsage, ScriptedAi } from "../test/fakes.js";

const ctx = (role: Ctx["role"] = "DECLARANT", orgId = "org_a"): Ctx => ({ orgId: asOrgId(orgId), userId: asUserId(`usr_${orgId}`), role });
const DATA = ManualShipmentSchema.parse({
  buyer: { name: "NORDIC TOOLING GROUP AB", country: "SE" },
  invoice: { incoterm: "FOB", currency: "USD" },
  marks: "NTG / GOTHENBURG",
  items: [{ description: "Drill bit 10mm", quantity: "1000", unit: "PCE", unitPrice: "1.25" }],
});

let uow: InMemoryExtractionUow;
let docs: FakeDocuments;
let edited: string[];
let deps: ExtractionDeps;

beforeEach(async () => {
  uow = new InMemoryExtractionUow();
  docs = new FakeDocuments();
  docs.dossierStatusValue = "DRAFT";
  docs.dossierOrg.set("dos_1", "org_a");
  docs.dossierSources = { INVOICE: "ISSUED", PACKING_LIST: "ISSUED" };
  edited = [];
  deps = {
    uow, documents: docs, validation: new NoValidation(), ai: new ScriptedAi({}), usage: new RecordingUsage(), skills: new NoSkills(), clock: fixedClock("2026-11-10T03:00:00.000Z"), idGen: sequentialIdGen(),
    onShipmentEdited: async (_o, d) => void edited.push(d),
  };
  unwrap(await saveManualShipment(deps, ctx(), "dos_1", DATA));
  edited = [];
});

const latest = () => uow.data.shipments.at(-1)!.data;
const clear = (declarationNo = "306123456780") => {
  docs.dossierStatusValue = "CLEARED";
  docs.dossierDeclarationNo = declarationNo;
};

describe("cấp số hóa đơn (cách A – trước khi khai)", () => {
  it("cấp số theo mẫu mặc định → điền invoice.no của shipment, audit, dựng lại tờ khai; chưa phát hành được khi chưa thông quan", async () => {
    const before = unwrap(await getIssuedInvoices(deps, ctx(), "dos_1"));
    expect(before).toMatchObject({ enabled: true, current: null, nextNo: "INV2611-001", cleared: false, blockers: ["NOT_CLEARED"], editable: true });

    const v = unwrap(await issueInvoiceAction(deps, ctx(), "dos_1", { action: "RESERVE" }));
    expect(v.current).toMatchObject({ no: "INV2611-001", status: "RESERVED", snapshot: null, releasedAt: null });
    expect(v.nextNo).toBe("INV2611-002");
    expect(latest().invoice.no.value).toBe("INV2611-001");
    expect(latest().issuedInvoice).toEqual({ no: "INV2611-001", date: "2026-11-10" });
    expect(uow.data.audit.at(-1)).toMatchObject({ key: "/invoice/no", oldValue: "", newValue: "INV2611-001", source: "INVOICE_ISSUE" });
    expect(edited).toEqual(["dos_1"]);

    const rel = await issueInvoiceAction(deps, ctx(), "dos_1", { action: "RELEASE" });
    expect(!rel.ok && rel.error.reason).toBe("INVOICE_NOT_CLEARED");
  });

  it("đã có số → cấp lần nữa bị từ chối; hồ sơ khác cùng tháng nhận số kế tiếp", async () => {
    unwrap(await issueInvoiceAction(deps, ctx(), "dos_1", { action: "RESERVE" }));
    const again = await issueInvoiceAction(deps, ctx(), "dos_1", { action: "RESERVE" });
    expect(!again.ok && again.error).toMatchObject({ code: "CONFLICT", reason: "INVOICE_ALREADY_RESERVED" });
    docs.dossierOrg.set("dos_2", "org_a");
    unwrap(await saveManualShipment(deps, ctx(), "dos_2", DATA));
    expect(unwrap(await issueInvoiceAction(deps, ctx(), "dos_2", { action: "RESERVE" })).current?.no).toBe("INV2611-002");
  });

  it("mẫu số doanh nghiệp cấu hình; số đã tồn tại (mẫu từng đổi) thì bỏ qua, không trùng", async () => {
    docs.orgExtra = { invoiceNumbering: { pattern: "HD/{YYYY}/{NNNN}", reset: "YEAR" } };
    // Số HD/2026/0001 đã có trong doanh nghiệp từ trước (vd do bộ đếm cũ) → lấy số kế tiếp.
    uow.data.issued.push({ id: "isd_old", orgId: "org_a", dossierId: "dos_x", kind: "INVOICE", no: "HD/2026/0001", status: "VOID", snapshot: null, issuedBy: "u", issuedAt: new Date(0), releasedBy: null, releasedAt: null, templateId: null, voidedBy: "u", voidedAt: new Date(0), voidReason: "x" });
    expect(unwrap(await issueInvoiceAction(deps, ctx(), "dos_1", { action: "RESERVE" })).current?.no).toBe("HD/2026/0002");
  });

  it("mẫu số không hợp lệ → không cấp số", async () => {
    docs.orgExtra = { invoiceNumbering: { pattern: "INV{NNN}", reset: "MONTH" } };
    const r = await issueInvoiceAction(deps, ctx(), "dos_1", { action: "RESERVE" });
    expect(!r.ok && r.error.reason).toBe("INVOICE_NUMBERING_INVALID");
  });

  it("hủy số → VOID, invoice.no trống, cấp tiếp số mới (không dùng lại)", async () => {
    unwrap(await issueInvoiceAction(deps, ctx(), "dos_1", { action: "RESERVE" }));
    const v = unwrap(await issueInvoiceAction(deps, ctx(), "dos_1", { action: "VOID", reason: "Sai người mua" }));
    expect(v.current).toBeNull();
    expect(v.history[0]).toMatchObject({ no: "INV2611-001", status: "VOID", voidReason: "Sai người mua" });
    expect(latest().issuedInvoice).toBeNull();
    expect(uow.data.audit.at(-1)).toMatchObject({ oldValue: "INV2611-001", newValue: "" });
    expect(unwrap(await issueInvoiceAction(deps, ctx(), "dos_1", { action: "RESERVE" })).current?.no).toBe("INV2611-002");
  });

  it("đã cấp số rồi đổi nguồn Invoice sang tải lên → gộp lại không còn đè số hệ thống; vẫn hủy được số đã cấp", async () => {
    unwrap(await issueInvoiceAction(deps, ctx(), "dos_1", { action: "RESERVE" }));
    expect(latest().invoice.no.value).toBe("INV2611-001");
    docs.dossierSources = { INVOICE: "UPLOADED" };
    await refreshAfterSourcesChanged(deps, "org_a", "dos_1");
    expect(latest().issuedInvoice).toBeNull();
    expect(latest().invoice.no.value).not.toBe("INV2611-001");
    expect(edited).toContain("dos_1");
    expect(unwrap(await getIssuedInvoices(deps, ctx(), "dos_1"))).toMatchObject({ enabled: false, canVoid: true, current: { no: "INV2611-001" } });
    // Không cấp số mới được nữa, nhưng hủy số cũ thì được.
    const again = await issueInvoiceAction(deps, ctx(), "dos_1", { action: "RESERVE" });
    expect(!again.ok && again.error.reason).toBe("INVOICE_NOT_ISSUED_SOURCE");
    const v = unwrap(await issueInvoiceAction(deps, ctx(), "dos_1", { action: "VOID", reason: "Khách gửi invoice thật" }));
    expect(v.current).toBeNull();
    expect(v.history[0]).toMatchObject({ no: "INV2611-001", status: "VOID" });
  });

  it("hồ sơ đã khóa → không cấp/hủy số", async () => {
    unwrap(await issueInvoiceAction(deps, ctx(), "dos_1", { action: "RESERVE" }));
    clear();
    const r = await issueInvoiceAction(deps, ctx(), "dos_1", { action: "VOID", reason: "x" });
    expect(!r.ok && r.error.code).toBe("DOSSIER_LOCKED");
    expect(unwrap(await getIssuedInvoices(deps, ctx(), "dos_1"))).toMatchObject({ editable: false, canRelease: true });
  });
});

describe("phát hành sau thông quan", () => {
  beforeEach(async () => {
    unwrap(await issueInvoiceAction(deps, ctx(), "dos_1", { action: "RESERVE" }));
    edited = [];
  });

  it("thông quan → phát hành theo mẫu mặc định: snapshot có số tờ khai, ký mã hiệu, thông tin bổ sung, layout; không dựng lại tờ khai", async () => {
    clear();
    const view = unwrap(await getIssuedInvoices(deps, ctx(), "dos_1"));
    expect(view).toMatchObject({ cleared: true, blockers: [] });
    const v = unwrap(await issueInvoiceAction(deps, ctx(), "dos_1", { action: "RELEASE", extra: { lcNo: "LC-889", blNo: "HPH123" } }));
    expect(v.current).toMatchObject({ no: "INV2611-001", status: "ISSUED", templateId: null });
    expect(v.current?.snapshot).toMatchObject({
      declarationNo: "306123456780", marks: "NTG / GOTHENBURG", extra: { lcNo: "LC-889", blNo: "HPH123", lcDate: null },
      invoice: { date: "2026-11-10", totalAmount: "1250.00", currency: "USD" }, layout: DEFAULT_INVOICE_LAYOUT,
    });
    expect(edited).toEqual([]);
    expect(uow.data.audit.at(-1)).toMatchObject({ key: "/invoice/release" });
  });

  it("phát hành lại cùng số với mẫu khác; mẫu sửa về sau không đổi bản đã phát hành", async () => {
    clear();
    const tpl = unwrap(await saveInvoiceTemplate(deps, ctx("ADMIN"), null, { name: "Mẫu L/C", isDefault: false, layout: { ...DEFAULT_INVOICE_LAYOUT, title: "INVOICE" } }));
    expect(tpl.isDefault).toBe(true); // mẫu đầu tiên tự thành mặc định
    unwrap(await issueInvoiceAction(deps, ctx(), "dos_1", { action: "RELEASE" }));
    const v = unwrap(await issueInvoiceAction(deps, ctx(), "dos_1", { action: "RELEASE", templateId: tpl.id }));
    expect(v.current).toMatchObject({ no: "INV2611-001", templateId: tpl.id });
    expect(v.current?.snapshot?.layout.title).toBe("INVOICE");
    unwrap(await saveInvoiceTemplate(deps, ctx("ADMIN"), tpl.id, { name: "Mẫu L/C", isDefault: true, layout: { ...DEFAULT_INVOICE_LAYOUT, title: "COMMERCIAL INVOICE" } }));
    expect(unwrap(await getIssuedInvoices(deps, ctx(), "dos_1")).current?.snapshot?.layout.title).toBe("INVOICE");
    const bad = await issueInvoiceAction(deps, ctx(), "dos_1", { action: "RELEASE", templateId: "itp_none" });
    expect(!bad.ok && bad.error.reason).toBe("INVOICE_TEMPLATE_NOT_FOUND");
  });

  it("thiếu dữ liệu → không phát hành", async () => {
    clear();
    uow.data.shipments.at(-1)!.data.items = [];
    const r = await issueInvoiceAction(deps, ctx(), "dos_1", { action: "RELEASE" });
    expect(!r.ok && r.error.reason).toBe("INVOICE_DATA_INCOMPLETE");
  });
});

describe("quyền, nguồn chứng từ, org khác", () => {
  it("người xem không thao tác được; hồ sơ không đặt nguồn ISSUED → từ chối", async () => {
    const r = await issueInvoiceAction(deps, ctx("VIEWER"), "dos_1", { action: "RESERVE" });
    expect(!r.ok && r.error.code).toBe("FORBIDDEN");
    docs.dossierSources = { INVOICE: "UPLOADED" };
    const s = await issueInvoiceAction(deps, ctx(), "dos_1", { action: "RESERVE" });
    expect(!s.ok && s.error.reason).toBe("INVOICE_NOT_ISSUED_SOURCE");
  });

  it("org khác không đọc/cấp số được hồ sơ, không thấy mẫu", async () => {
    unwrap(await saveInvoiceTemplate(deps, ctx("ADMIN"), null, { name: "A", layout: DEFAULT_INVOICE_LAYOUT }));
    const r = await issueInvoiceAction(deps, ctx("DECLARANT", "org_b"), "dos_1", { action: "RESERVE" });
    expect(r.ok).toBe(false);
    expect(unwrap(await listInvoiceTemplates(deps, ctx("ADMIN", "org_b")))).toEqual([]);
  });
});

describe("mẫu in hóa đơn", () => {
  it("chỉ Quản trị ghi; đặt mặc định bỏ cờ mẫu cũ; xóa mẫu mặc định → mẫu còn lại thành mặc định", async () => {
    const no = await saveInvoiceTemplate(deps, ctx("DECLARANT"), null, { name: "X", layout: DEFAULT_INVOICE_LAYOUT });
    expect(!no.ok && no.error.code).toBe("FORBIDDEN");
    const a = unwrap(await saveInvoiceTemplate(deps, ctx("ADMIN"), null, { name: "A", layout: DEFAULT_INVOICE_LAYOUT }));
    const b = unwrap(await saveInvoiceTemplate(deps, ctx("ADMIN"), null, { name: "B", isDefault: true, layout: DEFAULT_INVOICE_LAYOUT }));
    expect((await listInvoiceTemplates(deps, ctx("VIEWER"))).ok && uow.data.templates.map((t) => [t.name, t.isDefault])).toEqual([["A", false], ["B", true]]);
    unwrap(await deleteInvoiceTemplate(deps, ctx("ADMIN"), b.id));
    expect(uow.data.templates.map((t) => [t.id, t.isDefault])).toEqual([[a.id, true]]);
    const gone = await deleteInvoiceTemplate(deps, ctx("ADMIN"), b.id);
    expect(!gone.ok && gone.error.reason).toBe("INVOICE_TEMPLATE_NOT_FOUND");
  });
});
