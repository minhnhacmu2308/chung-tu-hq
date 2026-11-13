// Quyền danh mục (spec §7): VIEWER xem/xuất · DECLARANT đề xuất bí danh, tạo mặt hàng vào hàng chờ · APPROVER như DECLARANT + sửa thông tin chung
// · người phụ trách bộ mã (vai trò ≠ VIEWER) sửa/duyệt trong bộ mình · ADMIN/OWNER tất cả. Giao diện chỉ ẩn nút; kiểm thật ở đây.
import { requireRole, type Ctx } from "../../../shared/ctx.js";
import { reasonError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import type { CatalogRepos } from "./ports.js";

export const isCatalogAdmin = (ctx: Ctx) => ctx.role === "ADMIN" || ctx.role === "OWNER";

/** Bộ mã, người phụ trách, thiết lập, đổi chế độ, gộp/tách, ngưng dùng mặt hàng. */
export const requireCatalogAdmin = (ctx: Ctx) => requireRole(ctx, "ADMIN");
/** Mọi vai trò trừ VIEWER: đề xuất bí danh, tạo mặt hàng (vào hàng chờ nếu không đủ quyền tạo thẳng). */
export const requireContributor = (ctx: Ctx) => requireRole(ctx, "DECLARANT", "APPROVER", "ADMIN");
/** Sửa thông tin chung mặt hàng (tên, HS, ĐVT gốc, thuế): APPROVER, ADMIN, OWNER. */
export const requireItemEditor = (ctx: Ctx) => requireRole(ctx, "APPROVER", "ADMIN");
export const isItemEditor = (ctx: Ctx) => requireItemEditor(ctx).ok;

/** Quản trị, hoặc người phụ trách bộ mã có vai trò ≠ VIEWER. */
export async function managesSet(r: CatalogRepos, ctx: Ctx, codeSetId: string): Promise<boolean> {
  if (isCatalogAdmin(ctx)) return true;
  if (ctx.role === "VIEWER") return false;
  return r.owners.isOwner(ctx.orgId, codeSetId, ctx.userId);
}

/** Sửa/duyệt trong bộ mã: VIEWER → FORBIDDEN; không phụ trách → CATALOG_NOT_CODE_SET_OWNER. */
export async function requireSetManager(r: CatalogRepos, ctx: Ctx, codeSetId: string): Promise<Result<void>> {
  const base = requireContributor(ctx);
  if (!base.ok) return base;
  if (await managesSet(r, ctx, codeSetId)) return ok(undefined);
  return err(reasonError("FORBIDDEN", "CATALOG_NOT_CODE_SET_OWNER"));
}

/** Quy đổi đơn vị: người sửa thông tin chung, hoặc người phụ trách bất kỳ bộ mã nào (vai trò ≠ VIEWER). */
export async function requireConversionEditor(r: CatalogRepos, ctx: Ctx): Promise<Result<void>> {
  const base = requireContributor(ctx);
  if (!base.ok) return base;
  if (isItemEditor(ctx)) return ok(undefined);
  for (const s of await r.codeSets.list(ctx.orgId)) if (await r.owners.isOwner(ctx.orgId, s.id, ctx.userId)) return ok(undefined);
  return err(reasonError("FORBIDDEN", "CATALOG_NOT_CODE_SET_OWNER"));
}
