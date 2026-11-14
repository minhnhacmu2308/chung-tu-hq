// Nhập danh mục từ Excel (spec §4): kiểm từng dòng (dòng lỗi bỏ qua, dòng khác vẫn nhập) → lưu tạm dòng hợp lệ vào catalog_imports.rows
// → ≤ 500 dòng ghép ngay trong request, > 500 dòng xếp job nền `catalog-import` (worker gọi runMatch). Code thuần, không AI (bất biến 5).
import { CATALOG_IMPORT_MAX_ROWS_PER_REQUEST, CATALOG_IMPORT_SYNC_MAX_ROWS, loadCodeList, validateItemRows, type CatalogImport, type ImportRowsInput } from "@kb/contracts";
import type { Ctx } from "../../../shared/ctx.js";
import { domainError, reasonError } from "../../../shared/errors.js";
import { createLogger } from "../../../shared/log.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { setNotFound } from "./common.js";
import { failImport, importNotFound, runMatch, toImportDto } from "./match-run.js";
import { requireSetManager } from "./permissions.js";
import type { CatalogDeps, CatalogImportRow, CatalogRepos, CatalogStagedRow } from "./ports.js";

export { importNotFound, toImportDto };

const log = createLogger({ name: "core" });

/** Mã ĐVT Hải quan (danh mục UNIT, nạp một lần mỗi tiến trình). */
let unitCodes: Promise<ReadonlySet<string>> | null = null;
export const customsUnitCodes = (): Promise<ReadonlySet<string>> =>
  (unitCodes ??= loadCodeList("UNIT").then((all) => new Set(all.map((u) => u.code.trim().toUpperCase()))));

export type StageImportInput = { codeSetId: string; fileName: string; columnMap: Record<string, number>; rows: CatalogStagedRow[]; errors: CatalogImportRow["errors"] };

/** Ghi lần nhập PARSING + dòng chờ ghép (trong transaction đang mở; quyền đã kiểm). */
export async function stageImport(deps: CatalogDeps, r: CatalogRepos, ctx: Ctx, input: StageImportInput): Promise<CatalogImportRow> {
  const now = deps.clock.now();
  const row: CatalogImportRow = {
    id: deps.idGen.next("cim"), orgId: ctx.orgId, codeSetId: input.codeSetId, fileName: input.fileName, columnMap: input.columnMap, status: "PARSING",
    counts: { created: 0, matched: 0, queued: 0, skipped: 0, errors: input.errors.length }, errors: input.errors, rows: input.rows, rowsTotal: input.rows.length, rowsDone: 0,
    createdBy: ctx.userId, createdAt: now, updatedAt: now,
  };
  await r.imports.insert(row);
  return row;
}

/**
 * Sau commit: ≤ 500 dòng ghép ngay; > 500 dòng xếp job `catalog-import` (jobId theo lần nhập – không xếp trùng).
 * Không để lần nhập kẹt: ghép đồng bộ lỗi giữa chừng (DB tạm lỗi…) → xếp job tiếp phần còn lại (runMatch chạy tiếp từ rows_done);
 * xếp job lỗi (Redis không tới được) → đánh dấu FAILED kèm lý do (người dùng thấy và nhập lại – nhập lại không tạo trùng) + trả lỗi.
 */
export async function startMatch(deps: CatalogDeps, ctx: Ctx, imp: CatalogImportRow): Promise<Result<CatalogImport>> {
  if (imp.rowsTotal <= CATALOG_IMPORT_SYNC_MAX_ROWS) {
    try {
      return await runMatch(deps, ctx, imp.id);
    } catch (e) {
      log.warn("catalog: ghép đồng bộ lỗi – chuyển sang job catalog-import", { orgId: ctx.orgId, importId: imp.id, err: e });
    }
  }
  try {
    await deps.jobs.enqueue("catalog-import", { orgId: ctx.orgId, userId: ctx.userId, importId: imp.id }, { jobId: `catalog-import:${imp.id}` });
  } catch {
    await failImport(deps, { orgId: ctx.orgId, userId: ctx.userId, importId: imp.id, reason: "ENQUEUE_FAILED" });
    return err(domainError("NOT_READY", "Chưa xếp được việc ghép nền – thử nhập lại sau ít phút"));
  }
  const cur = await deps.uow.asOrg(ctx, (r) => r.imports.get(ctx.orgId, imp.id));
  return ok(toImportDto(cur ?? imp));
}

/**
 * Nhập file vào một bộ mã: người phụ trách bộ (vai trò ≠ VIEWER) hoặc ADMIN/OWNER. ĐVT kiểm theo danh mục ĐVT Hải quan.
 * Lỗi theo dòng ghi vào `errors` (số dòng tính từ 1 theo thứ tự `rows`).
 */
export async function importRows(deps: CatalogDeps, ctx: Ctx, input: ImportRowsInput): Promise<Result<CatalogImport>> {
  // Chốt chặn cả khi gọi không qua route (route đã chặn trước khi parse): file lớn → giao diện chia nhiều lần nhập.
  if (input.rows.length > CATALOG_IMPORT_MAX_ROWS_PER_REQUEST) return err(reasonError("VALIDATION", "CATALOG_IMPORT_TOO_LARGE", { max: CATALOG_IMPORT_MAX_ROWS_PER_REQUEST }));
  const { ok: valid, errors } = validateItemRows(input.rows, { knownUnits: await customsUnitCodes() });
  const bad = new Set(errors.map((e) => e.row));
  const staged: CatalogStagedRow[] = [];
  let k = 0;
  input.rows.forEach((_, i) => {
    if (bad.has(i + 1)) return;
    staged.push({ row: i + 1, ...valid[k++]! });
  });
  const done = await deps.uow.asOrg(ctx, async (r): Promise<Result<CatalogImportRow>> => {
    const set = await r.codeSets.get(ctx.orgId, input.codeSetId);
    if (!set) return err(setNotFound());
    const can = await requireSetManager(r, ctx, set.id);
    if (!can.ok) return can;
    const columnMap = Object.fromEntries(Object.entries(input.columnMap).filter((e): e is [string, number] => typeof e[1] === "number"));
    // Thông tin mặt hàng (loại, xuất xứ, thuế…) chỉ áp khi bộ nhận là bộ nguồn gốc – bộ khác bỏ qua (spec 2026-11-14 §4).
    const rows = set.isSource ? staged : staged.map(({ fields: _drop, ...rest }) => rest);
    return ok(await stageImport(deps, r, ctx, { codeSetId: set.id, fileName: input.fileName, columnMap, rows, errors }));
  });
  if (!done.ok) return done;
  return startMatch(deps, ctx, done.value);
}

/** Một lần nhập (tiến độ khi chạy nền). Mọi vai trò được xem. */
export async function getImport(deps: CatalogDeps, ctx: Ctx, id: string): Promise<Result<CatalogImport>> {
  const row = await deps.uow.asOrg(ctx, (r) => r.imports.get(ctx.orgId, id));
  return row ? ok(toImportDto(row)) : err(importNotFound());
}

/** Các lần nhập gần nhất (mới trước). */
export async function listImports(deps: CatalogDeps, ctx: Ctx, limit = 50): Promise<Result<CatalogImport[]>> {
  const rows = await deps.uow.asOrg(ctx, (r) => r.imports.list(ctx.orgId));
  return ok(rows.slice(0, limit).map(toImportDto));
}
