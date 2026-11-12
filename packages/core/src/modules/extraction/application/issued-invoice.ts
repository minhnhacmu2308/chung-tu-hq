// Hóa đơn thương mại do hệ thống phát hành SAU THÔNG QUAN (ADR 0013 mục 3, quyết định 2026-11-12). Code thuần, không AI (bất biến 5).
// Cách A: RESERVE = cấp số theo mẫu doanh nghiệp (transaction, duy nhất theo org, không tái dùng) → số điền vào chỉ tiêu Số hóa đơn của tờ khai.
// RELEASE = khi hồ sơ đã thông quan: đóng băng nội dung (shipment + số tờ khai + thông tin bổ sung + mẫu in) để in; phát hành lại cùng số được (đổi mẫu/thông tin).
// VOID = hủy số (không dùng lại) khi hồ sơ chưa khóa; tờ khai đã có số thì giao diện nhắc sửa EDD/EDE/AMA.
import {
  DEFAULT_INVOICE_LAYOUT, DEFAULT_INVOICE_NUMBERING, formatDocNo, patternIssue, periodKey, ReleaseExtraSchema, vnDateOf,
  type InvoiceLayout, type InvoiceNumbering, type IssueAction, type IssueBlocker, type IssuedInvoice, type IssuedInvoicesView, type ReleaseExtra,
} from "@kb/contracts";
import { requireRole, type Ctx } from "../../../shared/ctx.js";
import { reasonError, domainError, type DomainError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { isReadLocked } from "../domain/edit-normalize.js";
import { buildSnapshot } from "../domain/issued.js";
import { remergeDossier } from "./_remerge.js";
import type { ExtractionDeps, ExtractionRepos, IssuedRow, OrgInfo, TemplateRow } from "./ports.js";

const toDto = (r: IssuedRow): IssuedInvoice => ({
  id: r.id, no: r.no, status: r.status, reservedAt: r.issuedAt.toISOString(), releasedAt: r.releasedAt?.toISOString() ?? null,
  voidedAt: r.voidedAt?.toISOString() ?? null, voidReason: r.voidReason, templateId: r.templateId, snapshot: r.snapshot,
});

/** Câu tiếng Việt cho lý do thiếu dữ liệu (giao diện dịch theo mã `blockers` của view). */
const BLOCKER_VI: Record<IssueBlocker, string> = {
  NOT_CLEARED: "tờ khai chưa thông quan", NO_ITEMS: "chưa có dòng hàng", NO_CURRENCY: "chưa có loại tiền", NO_BUYER: "chưa có tên người mua",
  ITEM_INCOMPLETE: "dòng hàng thiếu tên, số lượng, đơn vị hoặc đơn giá",
};

const numberingOf = (org: OrgInfo): InvoiceNumbering => org.invoiceNumbering ?? DEFAULT_INVOICE_NUMBERING;
const pickTemplate = (list: TemplateRow[], id: string | null): TemplateRow | null => (id ? (list.find((t) => t.id === id) ?? null) : (list.find((t) => t.isDefault) ?? null));

async function loadDossier(deps: ExtractionDeps, ctx: Ctx, dossierId: string) {
  const info = await deps.documents.dossierInfo(ctx.orgId, dossierId);
  if (!info) return err(domainError("NOT_FOUND", "Không tìm thấy hồ sơ"));
  return ok({ ...info, enabled: info.direction === "XK" && info.documentSources.INVOICE === "ISSUED", cleared: info.status === "CLEARED" });
}

/** Dựng nội dung hóa đơn từ dữ liệu hiện tại (chưa lưu). */
async function build(r: ExtractionRepos, ctx: Ctx, dossierId: string, org: OrgInfo, declarationNo: string | null, layout: InvoiceLayout, extra: ReleaseExtra | undefined, fallbackDate: string) {
  const shipment = await r.shipments.latest(ctx.orgId, dossierId);
  if (!shipment) return { ok: false, blockers: ["NO_ITEMS"] } as const;
  const manual = await r.manual.get(ctx.orgId, dossierId);
  return buildSnapshot(shipment.data, { name: org.sellerName || org.name, taxCode: org.taxCode }, fallbackDate, {
    layout, extra, declarationNo, marks: manual?.data.marks ?? null,
    seller: { address: org.address || null, phone: org.phone || null },
    signatory: { name: org.signatoryName ?? null, title: org.signatoryTitle ?? null },
  });
}

export async function getIssuedInvoices(deps: ExtractionDeps, ctx: Ctx, dossierId: string): Promise<Result<IssuedInvoicesView>> {
  const d = await loadDossier(deps, ctx, dossierId);
  if (!d.ok) return d;
  const org = await deps.documents.orgInfo(ctx.orgId);
  const numbering = numberingOf(org);
  const today = vnDateOf(deps.clock.now());
  const { rows, templates, seq, built } = await deps.uow.asOrg(ctx, async (r) => {
    const rows = await r.issued.list(ctx.orgId, dossierId);
    const templates = await r.templates.list(ctx.orgId);
    const current = rows.find((x) => x.status !== "VOID") ?? null;
    const tpl = pickTemplate(templates, current?.templateId ?? null);
    return {
      rows, templates,
      seq: await r.issued.peekSeq(ctx.orgId, "INVOICE", numbering.pattern, periodKey(numbering.reset, today)),
      built: await build(r, ctx, dossierId, org, d.value.declarationNo, tpl?.layout ?? DEFAULT_INVOICE_LAYOUT, current?.snapshot?.extra, current ? vnDateOf(current.issuedAt) : today),
    };
  });
  const current = rows.find((x) => x.status !== "VOID") ?? null;
  const blockers: IssueBlocker[] = [...(d.value.cleared ? [] : (["NOT_CLEARED"] as const)), ...(built.ok ? [] : built.blockers)];
  const canAct = d.value.enabled && ctx.role !== "VIEWER";
  return ok({
    enabled: d.value.enabled,
    current: current ? toDto(current) : null,
    history: rows.map(toDto),
    nextNo: formatDocNo(numbering.pattern, today, seq),
    cleared: d.value.cleared,
    declared: !!d.value.declarationNo,
    blockers,
    preview: built.ok ? built.snapshot : null,
    templates: templates.map((t) => ({ id: t.id, name: t.name, isDefault: t.isDefault })),
    editable: canAct && !isReadLocked(d.value.status),
    canRelease: canAct,
    canVoid: !!current && ctx.role !== "VIEWER" && !isReadLocked(d.value.status),
  });
}

/** `action` đã parse Zod ở biên (IssueActionSchema). */
export async function issueInvoiceAction(deps: ExtractionDeps, ctx: Ctx, dossierId: string, action: IssueAction): Promise<Result<IssuedInvoicesView>> {
  const allowed = requireRole(ctx, "DECLARANT", "APPROVER", "ADMIN");
  if (!allowed.ok) return allowed;
  const d = await loadDossier(deps, ctx, dossierId);
  if (!d.ok) return d;
  // Hủy số vẫn được khi người khai đã đổi nguồn Invoice sang tải lên – để dọn số đã cấp (không dùng lại).
  if (!d.value.enabled && action.action !== "VOID") return err(reasonError("VALIDATION", "INVOICE_NOT_ISSUED_SOURCE"));
  // Cấp/hủy số đổi chỉ tiêu Số hóa đơn → cần hồ sơ chưa khóa. Phát hành không đổi tờ khai → làm được khi đã thông quan (đã khóa).
  if (action.action !== "RELEASE" && isReadLocked(d.value.status)) return err(domainError("DOSSIER_LOCKED", "Hồ sơ đã duyệt/truyền – mở lại tờ khai trước khi cấp hoặc hủy số hóa đơn"));
  if (action.action === "RELEASE" && !d.value.cleared) return err(reasonError("INVALID_STATE", "INVOICE_NOT_CLEARED"));
  const org = await deps.documents.orgInfo(ctx.orgId);
  const numbering = numberingOf(org);
  if (action.action === "RESERVE" && patternIssue(numbering.pattern, numbering.reset)) return err(reasonError("VALIDATION", "INVOICE_NUMBERING_INVALID"));
  const now = deps.clock.now();
  const today = vnDateOf(now);

  const res = await deps.uow.asOrg(ctx, async (r): Promise<Result<boolean, DomainError>> => {
    await r.lockDossier(ctx.orgId, dossierId);
    const current = (await r.issued.list(ctx.orgId, dossierId)).find((x) => x.status !== "VOID") ?? null;
    const audit = (key: string, oldValue: string, newValue: string) =>
      r.audit.insert({ id: deps.idGen.next("job"), orgId: ctx.orgId, dossierId, fieldId: null, documentId: null, key, oldValue, newValue, userId: ctx.userId, source: "INVOICE_ISSUE", at: now });

    if (action.action === "RESERVE") {
      if (current) return err(reasonError("CONFLICT", "INVOICE_ALREADY_RESERVED", { no: current.no }));
      const period = periodKey(numbering.reset, today);
      // Bộ đếm khóa dòng tới hết transaction → hai hồ sơ cấp song song không cùng số. Số đã có (mẫu số từng đổi) thì bỏ qua, lấy số kế tiếp.
      let no = formatDocNo(numbering.pattern, today, await r.issued.nextSeq(ctx.orgId, "INVOICE", numbering.pattern, period, now));
      while (await r.issued.exists(ctx.orgId, "INVOICE", no)) no = formatDocNo(numbering.pattern, today, await r.issued.nextSeq(ctx.orgId, "INVOICE", numbering.pattern, period, now));
      await r.issued.insert({
        id: deps.idGen.next("isd"), orgId: ctx.orgId, dossierId, kind: "INVOICE", no, status: "RESERVED", snapshot: null,
        issuedBy: ctx.userId, issuedAt: now, releasedBy: null, releasedAt: null, templateId: null, voidedBy: null, voidedAt: null, voidReason: null,
      });
      await audit("/invoice/no", "", no);
      return ok(true);
    }

    if (!current) return err(reasonError("INVALID_STATE", "INVOICE_NOT_RESERVED"));

    if (action.action === "VOID") {
      await r.issued.update(ctx.orgId, current.id, { status: "VOID", voidedBy: ctx.userId, voidedAt: now, voidReason: action.reason ?? null });
      await audit("/invoice/no", current.no, "");
      return ok(true);
    }

    // RELEASE (lần đầu hoặc phát hành lại cùng số): mẫu chọn (null = mặc định doanh nghiệp, không có thì mẫu dựng sẵn).
    const templates = await r.templates.list(ctx.orgId);
    const tpl = pickTemplate(templates, action.templateId ?? null);
    if (action.templateId && !tpl) return err(reasonError("NOT_FOUND", "INVOICE_TEMPLATE_NOT_FOUND"));
    const built = await build(r, ctx, dossierId, org, d.value.declarationNo, tpl?.layout ?? DEFAULT_INVOICE_LAYOUT, ReleaseExtraSchema.parse(action.extra ?? {}), vnDateOf(current.issuedAt));
    if (!built.ok) return err(reasonError("VALIDATION", "INVOICE_DATA_INCOMPLETE", { missing: built.blockers.map((b) => BLOCKER_VI[b]).join("; ") }, { blockers: built.blockers }));
    await r.issued.update(ctx.orgId, current.id, { status: "ISSUED", snapshot: built.snapshot, templateId: tpl?.id ?? null, releasedBy: ctx.userId, releasedAt: now });
    await audit("/invoice/release", current.releasedAt?.toISOString() ?? "", now.toISOString());
    return ok(false);
  });
  if (!res.ok) return res;
  // Cấp/hủy số đổi chỉ tiêu Số hóa đơn → gộp lại shipment, chạy luật (R-INVOICE-ISSUED), dựng lại tờ khai nháp. Phát hành thì không.
  if (res.value) {
    await remergeDossier(deps, ctx.orgId, dossierId);
    await deps.onShipmentEdited?.(ctx.orgId, dossierId);
  }
  return getIssuedInvoices(deps, ctx, dossierId);
}
