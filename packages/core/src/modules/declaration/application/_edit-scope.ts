// Phạm vi sửa tờ khai theo tờ đã gọi về (spec tách tờ khai IDC/gọi về §2.4): một lần gọi `editBlockFor` mỗi use case sửa.
// Lô một tờ (hoặc chưa nối port) → không kiểm ở đây: giữ nguyên các kiểm trạng thái sẵn có của từng use case (hành vi cũ).
import { declarationEditScope, editBlockFor, sheetOfLine, type DeclarationEditScope, type EditTarget } from "@kb/contracts";
import type { Ctx } from "../../../shared/ctx.js";
import { reasonError, type DomainError } from "../../../shared/errors.js";
import type { DeclarationDeps } from "./ports.js";

/** Đích sửa; `LINE_NO` = ô dòng hàng của dòng có `lineNo` (tờ tính theo danh sách dòng hiện tại). */
export type ScopeTarget = Exclude<EditTarget, { kind: "LINE" }> | { kind: "LINE_NO"; lineNo: number };

/** Phạm vi sửa hiện tại + danh sách lineNo; null = lô một tờ / chưa nối port (không áp dụng). */
export async function loadEditScope(deps: DeclarationDeps, ctx: Ctx, dossierId: string): Promise<{ scope: DeclarationEditScope; lineNos: number[] } | null> {
  const sheets = deps.customsSheets ? await deps.customsSheets(ctx.orgId, dossierId) : [];
  if (sheets.length <= 1) return null;
  return deps.uow.asOrg(ctx, async (r) => {
    const decl = await r.declarations.latest(ctx.orgId, dossierId);
    const lineNos = (await r.lineItems.list(ctx.orgId, dossierId)).map((i) => i.lineNo);
    return { scope: declarationEditScope(decl?.status ?? "DRAFT", sheets), lineNos };
  });
}

/** Đích → EditTarget của contracts. */
export const toEditTarget = (t: ScopeTarget, lineNos: number[]): EditTarget => (t.kind === "LINE_NO" ? { kind: "LINE", sheet: sheetOfLine(lineNos, t.lineNo) } : t);

/**
 * Lỗi khi đích sửa thuộc tờ chưa gọi về (COMMON_LOCKED_SHEETS / LINE_SHEET_LOCKED); null = được.
 * DECLARATION_LOCKED (khóa theo trạng thái tờ khai) để các kiểm sẵn có của use case báo như cũ.
 */
export function scopeError(loaded: { scope: DeclarationEditScope; lineNos: number[] } | null, target: ScopeTarget): DomainError | null {
  if (!loaded) return null;
  const b = editBlockFor(loaded.scope, toEditTarget(target, loaded.lineNos));
  return b && b.reasonCode !== "DECLARATION_LOCKED" ? reasonError("INVALID_STATE", b.reasonCode, b.params) : null;
}

export async function sheetScopeError(deps: DeclarationDeps, ctx: Ctx, dossierId: string, target: ScopeTarget): Promise<DomainError | null> {
  return scopeError(await loadEditScope(deps, ctx, dossierId), target);
}
