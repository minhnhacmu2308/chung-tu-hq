// "Lấy từ chứng từ đã đọc" (spec §4): dòng tờ khai đã duyệt (mã hàng + HS) → bộ XNK mặc định; dòng invoice/packing list đã OCR có Part No
// → bộ đối tác theo `partner_key` (hồ sơ nhập: người bán → bộ nhà cung cấp; hồ sơ xuất: người mua → bộ khách hàng; chưa có → tạo bộ). Dòng đi qua cùng luồng ghép như nhập Excel (runMatch).
// Đọc chứng từ qua port `documents` (public API của declaration/extraction) TRƯỚC transaction; dòng đọc về parse lại bằng Zod (bất biến 9).
import { itemCodeKey, itemHsDigits, itemNameKey, type CatalogImport, type ImportFromDocumentsInput } from "@kb/contracts";
import { z } from "zod";
import type { Ctx } from "../../../shared/ctx.js";
import { domainError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { findSetByRef } from "./common.js";
import { ensurePartnerSet } from "./partner-set.js";
import { createLogger } from "../../../shared/log.js";
import { customsUnitCodes, stageImport, startMatch } from "./import.js";
import { failImport, toImportDto } from "./match-run.js";
import { requireCatalogAdmin, requireContributor, requireSetManager } from "./permissions.js";
import type { CatalogDeps, CatalogImportRow, CatalogStagedRow } from "./ports.js";

const opt = (max: number) => z.string().max(max).nullish().transform((s) => s?.trim() || null);
const DocumentLineSchema = z.object({ code: z.string().max(200).transform((s) => s.trim()), name: z.string().max(1000).transform((s) => s.trim()), unit: opt(100), hsCode: opt(50), partnerName: opt(300), partnerKind: z.enum(["SUPPLIER", "CUSTOMER"]).nullish().transform((k) => k ?? "SUPPLIER"), sourceRef: z.string().min(1).max(300) });
type DocLine = z.infer<typeof DocumentLineSchema>;

/** Dòng → dòng chờ ghép: bỏ dòng thiếu mã; ĐVT không thuộc danh mục ĐVT Hải quan / HS sai định dạng → bỏ trường đó (không phải lỗi người dùng). */
function toStaged(lines: DocLine[], units: ReadonlySet<string>): CatalogStagedRow[] {
  const seen = new Set<string>();
  const out: CatalogStagedRow[] = [];
  for (const l of lines) {
    const key = itemCodeKey(l.code);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const unit = l.unit && units.has(l.unit.toUpperCase()) ? l.unit.toUpperCase() : null;
    const hs = itemHsDigits(l.hsCode);
    out.push({ row: out.length + 1, code: l.code, name: (l.name || l.code).slice(0, 500), ...(unit ? { unit } : {}), ...(hs.length >= 4 && hs.length <= 10 ? { hs } : {}), sourceRef: l.sourceRef });
  }
  return out;
}

const log = createLogger({ name: "core" });

const FILE_NAME = { DECLARATIONS: "Tờ khai đã duyệt", INVOICES: "Hóa đơn / phiếu đóng gói đã đọc" } as const;

/**
 * Lấy dòng hàng từ chứng từ đã đọc vào danh mục. Trả MỌI lần nhập đã tạo kèm trạng thái (DONE / PARSING-MATCHING chạy nền / FAILED). DECLARATIONS: người phụ trách bộ XNK mặc định / ADMIN / OWNER.
 * INVOICES: ADMIN/OWNER (có thể tạo bộ nhà cung cấp). Mỗi bộ mã đích một lần nhập; trả các lần nhập đã tạo (không có dòng → []).
 */
export async function importFromDocuments(deps: CatalogDeps, ctx: Ctx, input: ImportFromDocumentsInput): Promise<Result<CatalogImport[]>> {
  const allowed = input.source === "INVOICES" ? requireCatalogAdmin(ctx) : requireContributor(ctx);
  if (!allowed.ok) return allowed;
  const raw = input.source === "DECLARATIONS" ? await deps.documents.approvedDeclarationLines(ctx.orgId) : await deps.documents.invoiceLines(ctx.orgId);
  const lines = raw.flatMap((l) => {
    const p = DocumentLineSchema.safeParse(l);
    return p.success && p.data.code ? [p.data] : [];
  });
  const units = await customsUnitCodes();
  // INVOICES: gom theo (loại bộ đối tác, partner_key) – NK: người bán → SUPPLIER, XK: người mua → CUSTOMER; dòng không rõ đối tác bỏ qua.
  // Bộ đối tác tạo TRƯỚC transaction chính (ensurePartnerSet: transaction ngắn riêng, đua tạo → đọc lại).
  const groups = new Map<string, { kind: "SUPPLIER" | "CUSTOMER"; partnerKey: string; name: string; lines: DocLine[]; setId: string | null }>();
  if (input.source === "INVOICES") {
    for (const l of lines) {
      const partnerKey = l.partnerName ? itemNameKey(l.partnerName) : "";
      if (!partnerKey) continue;
      const key = `${l.partnerKind}:${partnerKey}`;
      const g = groups.get(key) ?? { kind: l.partnerKind, partnerKey, name: l.partnerName!, lines: [], setId: null };
      g.lines.push(l);
      groups.set(key, g);
    }
    for (const g of groups.values()) if (toStaged(g.lines, units).length) g.setId = await ensurePartnerSet(deps, ctx.orgId, g.kind, g.name);
  }

  const staged = await deps.uow.asOrg(ctx, async (r): Promise<Result<CatalogImportRow[]>> => {
    if (input.source === "DECLARATIONS") {
      const set = await findSetByRef(r, ctx.orgId, "CUSTOMS");
      if (!set) return err(domainError("VALIDATION", "Chưa có bộ mã XNK mặc định"));
      const can = await requireSetManager(r, ctx, set.id);
      if (!can.ok) return can;
      const rows = toStaged(lines, units);
      if (!rows.length) return ok([]);
      return ok([await stageImport(deps, r, ctx, { codeSetId: set.id, fileName: FILE_NAME.DECLARATIONS, columnMap: {}, rows, errors: [] })]);
    }
    const out: CatalogImportRow[] = [];
    for (const [, g] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
      const rows = toStaged(g.lines, units);
      if (!rows.length || !g.setId) continue;
      const set = await r.codeSets.get(ctx.orgId, g.setId);
      if (!set) continue;
      out.push(await stageImport(deps, r, ctx, { codeSetId: set.id, fileName: `${FILE_NAME.INVOICES} – ${set.name}`.slice(0, 260), columnMap: {}, rows, errors: [] }));
    }
    return ok(out);
  });
  if (!staged.ok) return staged;

  // Mọi lần nhập đã ghi đều phải được xử lý (ghép / xếp job / FAILED) – một bộ lỗi không để các bộ sau kẹt PARSING.
  const result: CatalogImport[] = [];
  for (const imp of staged.value) {
    let m: Result<CatalogImport>;
    try {
      m = await startMatch(deps, ctx, imp);
    } catch (e) {
      log.error("catalog: lấy từ chứng từ – không ghép được lần nhập", { orgId: ctx.orgId, importId: imp.id, err: e });
      await failImport(deps, { orgId: ctx.orgId, userId: ctx.userId, importId: imp.id, reason: "MATCH_FAILED" }).catch(() => {});
      m = err(domainError("NOT_READY", "Chưa ghép được"));
    }
    if (m.ok) {
      result.push(m.value);
      continue;
    }
    // startMatch đã đánh dấu FAILED (vd không xếp được job) → trả trạng thái thật của lần nhập.
    const cur = await deps.uow.asOrg(ctx, (r) => r.imports.get(ctx.orgId, imp.id));
    result.push(toImportDto(cur ?? { ...imp, status: "FAILED" }));
  }
  if (input.source === "INVOICES" && result.length) await deps.orgAudit?.record(ctx, { action: "CATALOG_IMPORT_FROM_DOCUMENTS", targetType: "catalog", targetId: ctx.orgId, targetLabel: input.source, detail: { imports: result.length } });
  return ok(result);
}
