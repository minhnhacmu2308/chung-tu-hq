import { declarationEditMode, declarationRequiredGaps, extraFieldMeta, fieldEditBlock, itemFieldMeta, type Declaration, type DeclarationView } from "@kb/contracts";
import { requireRole, type Ctx } from "../../../shared/ctx.js";
import { domainError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { canApprove, canEditField, canMoveToReview, missingRequiredFields } from "../domain/guards.js";
import { computeTaxes } from "../domain/tax.js";
import { allocateCustomsValue } from "../domain/valuation.js";
import { mappingsFor } from "../domain/mapping/registry.js";
import { loadDossier, toBranches, toDeclaration, toLineItem, unconfirmedCount } from "./_dto.js";
import type { DeclarationDeps, DeclarationRow } from "./ports.js";
import { recordApprovedProducts } from "./product-catalog.js";

async function approvedName(deps: DeclarationDeps, orgId: string, d: DeclarationRow | null) {
  if (!d?.approvedBy) return null;
  return (await deps.users.names(orgId, [d.approvedBy])).get(d.approvedBy) ?? d.approvedBy;
}

/** Tờ khai + dòng hàng kèm trị giá/thuế từng dòng (tính lại từ dữ liệu đã lưu, Decimal). */
export async function getDeclarationView(deps: DeclarationDeps, ctx: Ctx, dossierId: string): Promise<Result<DeclarationView>> {
  const d = await loadDossier(deps, ctx.orgId, dossierId);
  if (!d.ok) return d;
  const currency = d.value.currency;
  const { decl, items, fx } = await deps.uow.asOrg(ctx, async (r) => {
    const decl = await r.declarations.latest(ctx.orgId, dossierId);
    // Nguồn tỷ giá: bản ghi hiệu lực tại ngày tra khi dựng tờ khai (tiền tệ hóa đơn).
    const fx = decl && currency !== "VND" ? await r.exchangeRates.latest(currency, decl.exchangeRateDate) : null;
    return { decl, items: await r.lineItems.list(ctx.orgId, dossierId), fx };
  });
  const valuation = decl ? allocateCustomsValue({ items: items.map((i) => ({ id: i.id, amount: i.amount })), adjustments: decl.valueAdjustments, currency, rates: { [currency]: decl.exchangeRate } }) : null;
  const taxes = valuation ? computeTaxes(valuation.perItem.map((p) => ({ id: p.id, customsValueVnd: p.customsValueVnd, importDutyRate: items.find((i) => i.id === p.id)?.importDutyRate ?? null, vatRate: items.find((i) => i.id === p.id)?.vatRate ?? null }))) : null;
  const viewItems = items.map((i) => ({
    ...toLineItem(i),
    customsValueVnd: valuation?.perItem.find((p) => p.id === i.id)?.customsValueVnd ?? "0",
    importDutyVnd: taxes?.perItem.find((p) => p.id === i.id)?.importDutyVnd ?? "0",
    vatVnd: taxes?.perItem.find((p) => p.id === i.id)?.vatVnd ?? "0",
  }));
  return ok({
    declaration: decl ? toDeclaration(decl, await approvedName(deps, ctx.orgId, decl)) : null,
    unconfirmedHs: unconfirmedCount(items),
    branches: toBranches(viewItems),
    exchangeRateInfo: decl && fx ? { currency, rate: decl.exchangeRate, effectiveFrom: fx.date, source: fx.source, snapshotAt: fx.snapshotAt?.toISOString() ?? null } : null,
    items: viewItems,
  });
}

/** Sửa tay một chỉ tiêu trên tờ khai nháp: nguồn USER, hết nghi ngờ, ghi field_audit. */
export async function updateDeclarationField(deps: DeclarationDeps, ctx: Ctx, dossierId: string, code: string, value: string): Promise<Result<Declaration>> {
  const allowed = requireRole(ctx, "DECLARANT", "APPROVER", "ADMIN");
  if (!allowed.ok) return allowed;
  const d = await loadDossier(deps, ctx.orgId, dossierId);
  if (!d.ok) return d;
  const now = deps.clock.now();
  const stage = deps.customsStage ? await deps.customsStage(ctx.orgId, dossierId) : "NOT_SENT";
  const r0 = await deps.uow.asOrg(ctx, async (r) => {
    const decl = await r.declarations.latest(ctx.orgId, dossierId);
    if (!decl) return err(domainError("NO_DECLARATION", "Chưa có tờ khai"));
    if (decl.status !== "DRAFT") return err(domainError("INVALID_STATE", "Tờ khai đã duyệt – không sửa"));
    // Theo giai đoạn: đã phân luồng + gọi IDD → khóa theo Phụ lục II; đã thông quan → khóa toàn bộ (cùng quy tắc với form ở FE).
    const block = fieldEditBlock(decl.kind, code, declarationEditMode(decl.status, stage), Object.entries(decl.fields).map(([c, x]) => ({ code: c, value: x.value })));
    if (block) return err(domainError("INVALID_STATE", block));
    // Chỉ tiêu chưa có trên tờ khai, người khai nhập lần đầu: chỉ tiêu app (theo mapping) hoặc ô bổ sung (mã = tên trường VNACCS) → thêm vào tờ khai.
    // Ô dòng hàng người khai nhập (HANG.<id dòng>.<ô>): dòng phải thuộc hồ sơ; nhãn ghi số dòng để nhật ký sửa đọc được.
    const mapping = decl.fields[code] ? undefined : mappingsFor(decl.kind).find((m) => m.code === code);
    const extra = decl.fields[code] || mapping ? null : extraFieldMeta(decl.kind, code);
    const itemMeta = decl.fields[code] || mapping || extra ? null : itemFieldMeta(decl.kind, code);
    const line = itemMeta ? (await r.lineItems.list(ctx.orgId, dossierId)).find((i) => i.id === itemMeta.itemId) : undefined;
    const meta = mapping ? { no: mapping.no ?? "", label: mapping.label, section: mapping.section }
      : extra ? { no: extra.no ?? "", label: extra.label, section: extra.section }
      : itemMeta && line ? { no: itemMeta.no ?? "", label: `Dòng ${line.lineNo} – ${itemMeta.label}`, section: "VALUE" as const }
      : null;
    const f = decl.fields[code] ?? (meta ? { ...meta, value: "", source: "USER" as const } : undefined);
    if (!f) return err(domainError("NOT_FOUND", "Không có chỉ tiêu này trên tờ khai"));
    const editable = canEditField(decl.kind, code, value, f);
    if (!editable.ok) return editable;
    const fields = { ...decl.fields, [code]: { no: f.no, label: f.label, section: f.section, value, source: "USER" as const, ...(f.blocking ? { blocking: true as const } : {}) } };
    await r.declarations.update(decl.orgId, decl.id, { fields, updatedAt: now });
    return ok({ old: f.value, decl: { ...decl, fields, updatedAt: now } });
  });
  if (!r0.ok) return r0;
  await deps.audit.append(ctx, { dossierId, key: `decl:${code}`, oldValue: r0.value.old, newValue: value, source: "DECL_EDIT" });
  return ok(toDeclaration(r0.value.decl, null));
}

/** Phê duyệt (APPROVER/OWNER): không BLOCKER FAIL, HS đủ, tờ khai DRAFT, 4 mắt nếu org bật → APPROVED; hồ sơ sang bước truyền. */
export async function approveDeclaration(deps: DeclarationDeps, ctx: Ctx, dossierId: string): Promise<Result<Declaration>> {
  const d = await loadDossier(deps, ctx.orgId, dossierId);
  if (!d.ok) return d;
  const org = await deps.org.get(ctx.orgId);
  const blockerFails = await deps.validation.blockerFails(ctx.orgId, dossierId);
  const now = deps.clock.now();
  const r0 = await deps.uow.asOrg(ctx, async (r) => {
    const decl = await r.declarations.latest(ctx.orgId, dossierId);
    const items = (await r.lineItems.list(ctx.orgId, dossierId)).sort((a, b) => a.lineNo - b.lineNo);
    const guard = canApprove({
      role: ctx.role, userId: ctx.userId, ownerId: d.value.ownerId, fourEyes: org.fourEyes, blockerFails, items, status: decl?.status ?? "NOT_CREATED",
      ...(decl ? {
        exchangeRate: decl.exchangeRate, missingFields: missingRequiredFields(decl.kind, decl.fields), fields: decl.fields,
        requiredGaps: declarationRequiredGaps(decl.kind, Object.entries(decl.fields).map(([code, f]) => ({ code, value: f.value })), items), lineNos: items.map((i) => i.lineNo),
      } : {}),
    });
    if (!guard.ok) return guard;
    const patch = { status: "APPROVED" as const, approvedBy: ctx.userId, approvedAt: now, updatedAt: now };
    await r.declarations.update(decl!.orgId, decl!.id, patch);
    // Mặt hàng đã xác nhận HS → danh mục hàng hóa của doanh nghiệp (lần sau tra lại, khỏi gọi phân loại).
    await recordApprovedProducts(r, deps.idGen, decl!, items, now, ctx.userId);
    return ok({ ...decl!, ...patch });
  });
  if (!r0.ok) return r0;
  await deps.dossiers.update(ctx.orgId, dossierId, { status: "APPROVED", step: "submit", suspectFields: 0 });
  await deps.dossiers.publish(ctx.orgId, dossierId, { type: "dossier.updated" });
  const name = await approvedName(deps, ctx.orgId, r0.value);
  await deps.orgAudit?.record(ctx, { action: "DECLARATION_APPROVED", targetType: "dossier", targetId: dossierId, targetLabel: d.value.code, detail: { kind: r0.value.kind, version: r0.value.version } });
  await deps.notify?.notify(ctx.orgId, { dossierOwnerOf: dossierId }, { title: `Tờ khai ${d.value.code} đã được phê duyệt`, body: `${name ?? "Người duyệt"} đã duyệt – có thể truyền Hải quan.`, href: `/dossiers/${dossierId}?step=submit` });
  return ok(toDeclaration(r0.value, name));
}

/** Xác nhận đủ HS → sang bước Review; số chỉ tiêu nghi ngờ ghi lên hồ sơ. */
export async function moveToReview(deps: DeclarationDeps, ctx: Ctx, dossierId: string): Promise<Result<void>> {
  const allowed = requireRole(ctx, "DECLARANT", "APPROVER", "ADMIN");
  if (!allowed.ok) return allowed;
  const d = await loadDossier(deps, ctx.orgId, dossierId);
  if (!d.ok) return d;
  if (d.value.status === "APPROVED" || d.value.status === "SUBMITTED" || d.value.status === "CLEARED" || d.value.status === "CANCELLED") return err(domainError("DOSSIER_LOCKED", "Hồ sơ đã duyệt/truyền/hủy – không quay lại Review"));
  const r0 = await deps.uow.asOrg(ctx, async (r) => {
    const decl = await r.declarations.latest(ctx.orgId, dossierId);
    const items = await r.lineItems.list(ctx.orgId, dossierId);
    const guard = canMoveToReview(items, !!decl);
    if (!guard.ok) return guard;
    return ok(Object.values(decl!.fields).filter((f) => f.suspect).length);
  });
  if (!r0.ok) return r0;
  await deps.dossiers.update(ctx.orgId, dossierId, { step: "review", status: "NEEDS_REVIEW", suspectFields: r0.value });
  await deps.dossiers.publish(ctx.orgId, dossierId, { type: "dossier.updated" });
  await deps.notify?.notify(ctx.orgId, { roles: ["APPROVER", "OWNER"] }, { title: `${d.value.code} chờ phê duyệt tờ khai`, body: r0.value ? `${r0.value} chỉ tiêu cần kiểm tra.` : "Tờ khai nháp đã sẵn sàng để duyệt.", href: `/dossiers/${dossierId}?step=review` });
  return ok(undefined);
}
