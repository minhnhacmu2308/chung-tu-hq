// Hóa đơn thương mại sau thông quan (ADR 0013 mục 3), mock. Backend: packages/core extraction/application/issued-invoice.ts
// (cách A: cấp số → điền vào tờ khai; phát hành khi đã thông quan; hủy số không dùng lại). Mock lấy nội dung từ dữ liệu nhập tay.
import {
  canEditDeclaration, DEFAULT_INVOICE_LAYOUT, formatDocNo, IssueActionSchema, patternIssue, periodKey, reasonVi,
  type InvoiceLayout, type IssueBlocker, type IssuedInvoice, type IssuedInvoiceSnapshot, type IssuedInvoicesView, type IssueAction, type ReasonCode, type ReasonParams, type ReleaseExtra,
} from "@kb/contracts";
import { ApiError, mutate, nowIso, query } from "@/lib/mock-request";
import type { MockDb } from "@/mocks/db";
import { mulDecimal, sumDecimal } from "@/lib/decimal";

export const issuedInvoiceKeys = { detail: (dossierId: string) => ["issued-invoice", dossierId] as const };

const LOCKED = new Set(["APPROVED", "SUBMITTED", "CLEARED", "CANCELLED"]);
const BLOCKER_VI: Record<IssueBlocker, string> = {
  NOT_CLEARED: "tờ khai chưa thông quan", NO_ITEMS: "chưa có dòng hàng", NO_CURRENCY: "chưa có loại tiền", NO_BUYER: "chưa có tên người mua",
  ITEM_INCOMPLETE: "dòng hàng thiếu tên, số lượng, đơn vị hoặc đơn giá",
};
const EMPTY_EXTRA: ReleaseExtra = { contractNo: null, lcNo: null, lcDate: null, lcIssuingBank: null, blNo: null, blDate: null };
const fail = (code: string, reason: ReasonCode, params?: ReasonParams, status = 409) => new ApiError(code, reasonVi(reason, params), status, { reason, params });
const today = () => nowIso().slice(0, 10);

function build(db: MockDb, dossierId: string, fallbackDate: string, layout: InvoiceLayout, extra: ReleaseExtra): { ok: true; snapshot: IssuedInvoiceSnapshot } | { ok: false; blockers: IssueBlocker[] } {
  const m = db.manualShipments[dossierId]?.data;
  const d = db.dossiers.find((x) => x.id === dossierId);
  const blockers: IssueBlocker[] = [];
  if (!m?.items.length) blockers.push("NO_ITEMS");
  if (!m?.invoice.currency) blockers.push("NO_CURRENCY");
  if (!m?.buyer.name) blockers.push("NO_BUYER");
  if (!m || blockers.length) return { ok: false, blockers };
  const items = m.items.map((it, i) => ({
    lineNo: i + 1, description: it.description, partNo: it.partNo ?? null, hsCode: it.hsOnInvoice ?? null, quantity: it.quantity, unit: it.unit.toUpperCase(),
    unitPrice: it.unitPrice, amount: mulDecimal(it.quantity, it.unitPrice, 2), origin: it.origin?.toUpperCase() ?? null,
  }));
  const t = m.transport;
  const s = db.org.invoiceSettings;
  return {
    ok: true,
    snapshot: {
      seller: { name: s.sellerName || db.org.name, taxCode: db.org.taxCode, address: db.org.address || null, phone: db.org.phone || null },
      buyer: { name: m.buyer.name ?? null, address: m.buyer.address ?? null, country: m.buyer.country?.toUpperCase() ?? null, taxCode: m.buyer.taxCode ?? null },
      invoice: {
        date: m.invoice.date ?? fallbackDate, incoterm: m.invoice.incoterm?.toUpperCase() ?? null, incotermPlace: m.invoice.incotermPlace ?? null, currency: m.invoice.currency!.toUpperCase(),
        paymentTerms: m.invoice.paymentTerms ?? null, poNo: m.invoice.poNo ?? null, totalAmount: sumDecimal(items.map((x) => x.amount)),
      },
      transport: {
        portOfLoading: t.portOfLoading ?? null, portOfDischarge: t.portOfDischarge ?? null, finalDestination: t.finalDestination ?? null, departureDate: t.departureDate ?? null,
        vessel: t.vessel ?? null, packages: t.packages ?? null, packageUnit: t.packageUnit ?? null, grossWeightKg: t.grossWeightKg ?? null, netWeightKg: t.netWeightKg ?? null,
        containers: t.containers.map((c) => ({ no: c.no.toUpperCase(), sealNo: c.sealNo ?? null, size: c.size ?? null })),
      },
      originCountry: m.origin.country?.toUpperCase() ?? null,
      declarationNo: d?.declarationNo ?? null,
      marks: m.marks ?? null,
      extra,
      signatory: { name: s.signatoryName, title: s.signatoryTitle },
      layout,
      items,
    },
  };
}

const pickLayout = (db: MockDb, templateId: string | null) =>
  (templateId ? db.invoiceTemplates.find((t) => t.id === templateId) : db.invoiceTemplates.find((t) => t.isDefault))?.layout ?? DEFAULT_INVOICE_LAYOUT;

function nextSeq(db: MockDb, peek: boolean) {
  const n = db.org.invoiceSettings.numbering;
  const key = `${n.pattern}|${periodKey(n.reset, today())}`;
  const seq = (db.invoiceCounters[key] ?? 0) + 1;
  if (!peek) db.invoiceCounters[key] = seq;
  return formatDocNo(n.pattern, today(), seq);
}

function view(db: MockDb, dossierId: string): IssuedInvoicesView {
  const d = db.dossiers.find((x) => x.id === dossierId)!;
  const mine = db.issuedInvoices.filter((x) => x.dossierId === dossierId);
  const current = mine.find((x) => x.invoice.status !== "VOID")?.invoice ?? null;
  const cleared = d.status === "CLEARED";
  const built = build(db, dossierId, current?.reservedAt.slice(0, 10) ?? today(), pickLayout(db, current?.templateId ?? null), current?.snapshot?.extra ?? EMPTY_EXTRA);
  const enabled = d.direction === "XK" && d.documentSources.INVOICE === "ISSUED";
  const role = db.members.find((m) => m.id === db.currentUserId)?.role;
  const canAct = enabled && !!role && canEditDeclaration(role);
  return {
    enabled, current, history: mine.map((x) => x.invoice).reverse(),
    nextNo: nextSeq(db, true), cleared, declared: !!d.declarationNo,
    blockers: [...(cleared ? [] : (["NOT_CLEARED"] as const)), ...(built.ok ? [] : built.blockers)],
    preview: built.ok ? built.snapshot : null,
    templates: db.invoiceTemplates.map((t) => ({ id: t.id, name: t.name, isDefault: t.isDefault })),
    editable: canAct && !LOCKED.has(d.status),
    canRelease: canAct,
    canVoid: !!current && !!role && canEditDeclaration(role) && !LOCKED.has(d.status),
  };
}

const findDossier = (db: MockDb, id: string) => {
  const d = db.dossiers.find((x) => x.id === id);
  if (!d) throw new ApiError("NOT_FOUND", "Không tìm thấy hồ sơ", 404);
  return d;
};

export const getIssuedInvoices = (dossierId: string) => query((db) => view(db, findDossier(db, dossierId).id));

export const issueInvoiceAction = (dossierId: string, input: IssueAction) =>
  mutate((db) => {
    const d = findDossier(db, dossierId);
    const action = IssueActionSchema.parse(input);
    const role = db.members.find((m) => m.id === db.currentUserId)?.role;
    if (!role || !canEditDeclaration(role)) throw new ApiError("FORBIDDEN", "Vai trò của bạn không được cấp số / phát hành hóa đơn", 403);
    // Như backend: hủy số vẫn được khi đã đổi nguồn Invoice sang tải lên.
    if (action.action !== "VOID" && !(d.direction === "XK" && d.documentSources.INVOICE === "ISSUED")) throw fail("VALIDATION", "INVOICE_NOT_ISSUED_SOURCE", undefined, 400);
    if (action.action !== "RELEASE" && LOCKED.has(d.status)) throw new ApiError("DOSSIER_LOCKED", "Hồ sơ đã duyệt/truyền – mở lại tờ khai trước khi cấp hoặc hủy số hóa đơn", 409);
    if (action.action === "RELEASE" && d.status !== "CLEARED") throw fail("INVALID_STATE", "INVOICE_NOT_CLEARED");
    const current = db.issuedInvoices.find((x) => x.dossierId === d.id && x.invoice.status !== "VOID")?.invoice ?? null;
    const now = nowIso();

    if (action.action === "RESERVE") {
      if (current) throw fail("CONFLICT", "INVOICE_ALREADY_RESERVED", { no: current.no });
      const n = db.org.invoiceSettings.numbering;
      if (patternIssue(n.pattern, n.reset)) throw fail("VALIDATION", "INVOICE_NUMBERING_INVALID", undefined, 400);
      let no = nextSeq(db, false);
      while (db.issuedInvoices.some((x) => x.invoice.no === no)) no = nextSeq(db, false);
      const inv: IssuedInvoice = { id: `isd_${Date.now().toString(36)}`, no, status: "RESERVED", reservedAt: now, releasedAt: null, voidedAt: null, voidReason: null, templateId: null, snapshot: null };
      db.issuedInvoices.push({ dossierId: d.id, invoice: inv });
    } else if (!current) {
      throw fail("INVALID_STATE", "INVOICE_NOT_RESERVED");
    } else if (action.action === "VOID") {
      Object.assign(current, { status: "VOID", voidedAt: now, voidReason: action.reason });
    } else {
      if (action.templateId && !db.invoiceTemplates.some((t) => t.id === action.templateId)) throw fail("NOT_FOUND", "INVOICE_TEMPLATE_NOT_FOUND", undefined, 404);
      const built = build(db, d.id, current.reservedAt.slice(0, 10), pickLayout(db, action.templateId), action.extra);
      if (!built.ok) throw fail("VALIDATION", "INVOICE_DATA_INCOMPLETE", { missing: built.blockers.map((b) => BLOCKER_VI[b]).join("; ") }, 400);
      const tplId = action.templateId ?? db.invoiceTemplates.find((t) => t.isDefault)?.id ?? null;
      Object.assign(current, { status: "ISSUED", snapshot: built.snapshot, templateId: tplId, releasedAt: now });
    }
    d.updatedAt = now;
    return view(db, d.id);
  });
