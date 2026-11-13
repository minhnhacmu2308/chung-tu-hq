// Chạy một lần nhập danh mục từ phía giao diện: server nhận tối đa CATALOG_IMPORT_MAX_ROWS_PER_REQUEST dòng mỗi yêu cầu (vượt → CATALOG_IMPORT_TOO_LARGE),
// nên file lớn được chia thành nhiều lần nhập LIÊN TIẾP vào cùng bộ mã (mỗi phần một mã lần nhập), tra tiến độ phần đang chạy nền (> 500 dòng),
// cộng dồn tiến độ + tóm tắt; phần nào hỏng thì dừng ngay và báo phần đó (các phần trước đã nhập giữ nguyên – nhập lại cả file không tạo trùng).
// Mã trùng với dòng ở phần TRƯỚC: server chỉ kiểm trùng trong từng yêu cầu, gửi lại sẽ ghi đè tên/ĐVT im lặng → giữ lại ở đây, báo lỗi trùng.
// Dòng có trường dài quá giới hạn cũng giữ lại ở đây (server từ chối cả yêu cầu nếu gửi), báo TOO_LONG.
import { CATALOG_IMPORT_MAX_ROWS_PER_REQUEST, itemCodeKey, itemImportTooLong, type CatalogImport, type ImportRowsInput, type ItemImportRow } from "@kb/contracts";

export type ImportCounts = CatalogImport["counts"];
/**
 * Lỗi theo dòng: `index` là chỉ số (từ 0) của dòng trong cả file / trong lần nhập. Lấy từ chứng từ có thể ra nhiều lần nhập (mỗi bộ đối tác
 * một lần) – số dòng trùng nhau giữa các lần → kèm `importId` để giao diện ghi rõ bộ mã.
 */
export type ImportRowError = { index: number; field: string; code: string; importId?: string };
export type ImportProgress = { part: number; parts: number; percent: number };
/** Phần hỏng: `fromIndex`–`toIndex` là khoảng dòng (chỉ số từ 0) của phần đó; `error` là lỗi gọi API hoặc "JOB_FAILED" (job nền báo FAILED). */
export type ImportFailure = { part: number; parts: number; fromIndex?: number; toIndex?: number; error: unknown };
export type ImportRunResult = { imports: CatalogImport[]; counts: ImportCounts; errors: ImportRowError[]; failed: ImportFailure | null };

export type PollDeps = {
  getImport: (id: string) => Promise<CatalogImport>;
  wait?: (ms: number) => Promise<void>;
  pollMs?: number;
};
export type RunDeps = PollDeps & {
  importRows: (input: ImportRowsInput) => Promise<CatalogImport>;
  /** Số dòng mỗi phần (mặc định = giới hạn của server). */
  partSize?: number;
};

export const JOB_FAILED = "JOB_FAILED";
const POLL_MS = 1000;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const running = (i: CatalogImport) => i.status === "PARSING" || i.status === "MATCHING";
const fraction = (i: CatalogImport) => (i.status === "DONE" || i.progress.total === 0 ? (running(i) ? 0 : 1) : i.progress.done / i.progress.total);

const emptyCounts = (): ImportCounts => ({ created: 0, matched: 0, queued: 0, skipped: 0, errors: 0 });
function addCounts(to: ImportCounts, from: ImportCounts) {
  for (const k of Object.keys(to) as (keyof ImportCounts)[]) to[k] += from[k];
}

/** Tra lại lần nhập tới khi xong (DONE/FAILED); báo từng lần đọc được. */
export async function pollImport(imp: CatalogImport, deps: PollDeps, onUpdate: (i: CatalogImport) => void): Promise<CatalogImport> {
  let cur = imp;
  while (running(cur)) {
    onUpdate(cur);
    await (deps.wait ?? sleep)(deps.pollMs ?? POLL_MS);
    cur = await deps.getImport(cur.id);
  }
  onUpdate(cur);
  return cur;
}

export async function runImportInParts(
  rows: readonly ItemImportRow[],
  meta: Omit<ImportRowsInput, "rows">,
  deps: RunDeps,
  onProgress: (p: ImportProgress) => void,
): Promise<ImportRunResult> {
  const size = deps.partSize ?? CATALOG_IMPORT_MAX_ROWS_PER_REQUEST;
  const parts = Math.max(1, Math.ceil(rows.length / size));
  const pct = (n: number) => (rows.length ? Math.min(100, Math.round((n / rows.length) * 100)) : 100);
  const res: ImportRunResult = { imports: [], counts: emptyCounts(), errors: [], failed: null };
  /** code_key → phần (từ 0) có dòng đầu tiên mang mã đó. */
  const firstPart = new Map<string, number>();

  for (let p = 0; p < parts; p++) {
    const from = p * size;
    const to = Math.min(rows.length, from + size) - 1;
    const indices: number[] = [];
    const sent: ItemImportRow[] = [];
    for (let i = from; i <= to; i++) {
      // Trường dài quá giới hạn: ItemImportRowSchema sẽ từ chối CẢ yêu cầu → không gửi dòng này (không cắt bớt dữ liệu), báo TOO_LONG.
      const long = itemImportTooLong(rows[i]!);
      if (long.length) {
        for (const field of long) res.errors.push({ index: i, field, code: "TOO_LONG" });
        res.counts.errors += long.length;
        continue;
      }
      const key = itemCodeKey(rows[i]!.code ?? "");
      if (key) {
        const fp = firstPart.get(key);
        if (fp === undefined) firstPart.set(key, p);
        else if (fp < p) {
          res.errors.push({ index: i, field: "code", code: "DUPLICATE_IN_FILE" });
          res.counts.errors += 1;
          continue;
        }
      }
      indices.push(i);
      sent.push(rows[i]!);
    }
    const partRows = to - from + 1;
    onProgress({ part: p + 1, parts, percent: pct(from) });
    if (!sent.length) continue;
    try {
      const started = await deps.importRows({ ...meta, rows: sent });
      const done = await pollImport(started, deps, (cur) => onProgress({ part: p + 1, parts, percent: pct(from + Math.floor(partRows * fraction(cur))) }));
      if (done.status === "FAILED") throw JOB_FAILED;
      res.imports.push(done);
      addCounts(res.counts, done.counts);
      for (const e of done.errors) {
        const index = indices[e.row - 1];
        if (index !== undefined) res.errors.push({ index, field: e.field, code: e.code });
      }
    } catch (error) {
      res.failed = { part: p + 1, parts, fromIndex: from, toIndex: to, error };
      return res;
    }
    onProgress({ part: p + 1, parts, percent: pct(to + 1) });
  }
  return res;
}

/** "Lấy từ chứng từ đã đọc": server trả một hoặc nhiều lần nhập (có thể đang chạy nền) → chờ lần lượt, cộng dồn. */
export async function waitForImports(imports: readonly CatalogImport[], deps: PollDeps, onProgress: (p: ImportProgress) => void): Promise<ImportRunResult> {
  const res: ImportRunResult = { imports: [], counts: emptyCounts(), errors: [], failed: null };
  const parts = Math.max(1, imports.length);
  for (const [i, imp] of imports.entries()) {
    try {
      const done = await pollImport(imp, deps, (cur) => onProgress({ part: i + 1, parts, percent: Math.round(((i + fraction(cur)) / parts) * 100) }));
      if (done.status === "FAILED") throw JOB_FAILED;
      res.imports.push(done);
      addCounts(res.counts, done.counts);
      for (const e of done.errors) res.errors.push({ index: e.row - 1, field: e.field, code: e.code, importId: done.id });
    } catch (error) {
      res.failed = { part: i + 1, parts, error };
      return res;
    }
  }
  return res;
}
