// C6 – Hải quan cấp số cho tờ khai nhánh → ghi số tờ khai cuối (+ ngày) lên mặt hàng danh mục của các dòng ĐÃ GỬI trong tờ đó.
// Tự bù (đối soát): raw.catalogNo = { số, khóa tập dòng đã gửi } đã ghi xong vào danh mục. Mỗi lần xử lý outbox thành công / chạy lại outbox SENT /
// hỏi trạng thái, số hoặc tập dòng đã gửi hiện tại khác dấu → gọi danh mục (UPDATE idempotent) rồi đặt dấu trong transaction ngắn riêng.
// Crash giữa commit của integration và lời gọi danh mục → lần sau tự ghi bù; khai sửa (IDA01/EDA01) đổi dòng, cùng số → ghi lại; đã khớp → không gọi.
// Gọi NGOÀI transaction (không gọi port module khác trong transaction); lỗi chỉ ghi log – xử lý Hải quan không hỏng vì danh mục.
import { baseOp, sheetOfLine, vnDateOf } from "@kb/contracts";
import { z } from "zod";
import type { OrgId, UserId } from "../../../shared/ids.js";
import { createLogger } from "../../../shared/log.js";
import type { ResultRaw } from "../domain/state-machine.js";
import type { CustomsDeps, ResultRow } from "./customs-ports.js";
import { parseSent } from "./sent-sheets.js";

const log = createLogger({ name: "core" });

type CatalogLine = { id: string; lineNo: number; catalogItemId: string | null };

const LineIdsSchema = z.array(z.string().min(1)).min(1);
/** Danh sách id dòng (jsonb raw / payload outbox – dữ liệu từ ngoài, bất biến 9); sai dạng / rỗng → null. */
export function parseLineIds(v: unknown): string[] | null {
  const p = LineIdsSchema.safeParse(v);
  return p.success ? p.data : null;
}

/** `lines` của ảnh chụp đã gửi (JSON ổn định `[{ item: { id?, lineNo, … }, fields }]` – sentSnapshotOf). */
const SnapshotLinesSchema = z.array(z.object({ item: z.object({ id: z.string().min(1).optional(), lineNo: z.number() }) })).min(1);
function snapshotLineIds(raw: ResultRaw | null): string[] | null {
  const sent = parseSent(raw?.sent);
  if (!sent) return null;
  let json: unknown;
  try {
    json = JSON.parse(sent.lines);
  } catch {
    return null;
  }
  const p = SnapshotLinesSchema.safeParse(json);
  if (!p.success || p.data.some((l) => !l.item.id)) return null;
  return p.data.map((l) => l.item.id!);
}

/** Id dòng đã gửi của tờ: raw.sentLineIds (mọi lô) → id dòng trong ảnh chụp raw.sent (lô nhiều tờ, kết quả cũ) → null (không biết). */
const sentLineIdsOf = (raw: ResultRaw | null): string[] | null => parseLineIds(raw?.sentLineIds) ?? snapshotLineIds(raw);

/** FNV-1a 32 bit (thuần, ổn định) – khóa ngắn cho tập dòng, không cần chống va chạm cố ý. */
function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}
/** Khóa tập dòng đã gửi (`<số dòng>:<hash id đã sắp>`), null = không biết dòng đã gửi (dự phòng theo vị trí). */
export function sentLinesKey(raw: ResultRaw | null): string | null {
  const ids = sentLineIdsOf(raw);
  return ids ? `${ids.length}:${fnv1a([...ids].sort().join("\n"))}` : null;
}

const MarkerSchema = z.union([z.string(), z.object({ no: z.string(), lines: z.string().nullable() })]);
/**
 * Dấu raw.catalogNo khớp số + tập dòng đã gửi hiện tại? Dạng chuỗi cũ (chỉ số, chưa biết tập dòng) chỉ khớp khi hiện cũng không biết dòng đã gửi;
 * có id dòng đã gửi → ghi lại một lần (idempotent) rồi nâng dấu. Sai dạng → không khớp.
 */
function markerMatches(raw: ResultRaw | null, declarationNo: string, key: string | null): boolean {
  const p = MarkerSchema.safeParse(raw?.catalogNo);
  if (!p.success) return false;
  if (typeof p.data === "string") return p.data === declarationNo && key === null;
  return p.data.no === declarationNo && p.data.lines === key;
}

/**
 * Mặt hàng (không trùng, theo thứ tự dòng hiện tại) của các dòng đã gửi trong tờ `branch`:
 * 1. raw.sentLineIds (ghi lúc gửi nội dung, mọi lô) → đúng các dòng đó;
 * 2. không có (gửi trước khi có trường này) → id dòng trong ảnh chụp đã gửi raw.sent (lô nhiều tờ);
 * 3. vẫn không có (lô một tờ gửi trước đây / payload cũ thiếu id dòng) → DỰ PHÒNG: dòng hiện tại thuộc tờ theo sheetOfLine (50 dòng/tờ theo lineNo).
 * Dòng đã gửi nhưng nay đã xóa khỏi hồ sơ → không còn mặt hàng để ghi (bỏ qua).
 */
export function sheetCatalogItems(lines: CatalogLine[], raw: ResultRaw | null, branch: number): string[] {
  const ids = sentLineIdsOf(raw);
  const sent = ids ? new Set(ids) : null;
  const lineNos = lines.map((l) => l.lineNo);
  const inSheet = (l: CatalogLine) => (sent ? sent.has(l.id) : sheetOfLine(lineNos, l.lineNo) === branch);
  const sorted = [...lines].sort((a, b) => a.lineNo - b.lineNo);
  return [...new Set(sorted.filter((l) => l.catalogItemId && inSheet(l)).map((l) => l.catalogItemId!))];
}

const isoDate = (v: unknown): Date | null => {
  const t = typeof v === "string" ? Date.parse(v) : NaN;
  return Number.isNaN(t) ? null : new Date(t);
};

/**
 * Ngày ghi danh mục (YYYY-MM-DD): ngày đăng ký Hải quan trả về → giờ VN của lúc hệ thống nhận số (raw.numberAt) → kết quả cũ chưa có numberAt:
 * thông điệp IN thành công của khai tạm (IDA/EDA/IDA01/EDA01) mang đúng số (sớm nhất; không có thì thông điệp khai tạm sớm nhất) → `storedAt`
 * (lúc kết quả tờ được lưu trước lần xử lý này). KHÔNG dùng "hôm nay": ghi bù tờ cũ với ngày hôm nay có thể đè số tờ khai mới hơn của mặt hàng.
 */
async function issuedDate(deps: Pick<CustomsDeps, "uow">, ctx: { orgId: OrgId; userId: UserId }, result: Pick<ResultRow, "dossierId" | "branch" | "raw">, declarationNo: string, storedAt: Date): Promise<string> {
  const registered = result.raw?.customsInfo?.registeredDate;
  if (registered) return registered;
  const numberAt = isoDate(result.raw?.numberAt);
  if (numberAt) return vnDateOf(numberAt);
  const msgs = await deps.uow.asOrg(ctx, (r) => r.messages.list(ctx.orgId, result.dossierId, result.branch));
  const ida = msgs.filter((m) => m.direction === "IN" && m.result === "OK" && baseOp(m.operation) === "IDA").sort((a, b) => a.at.getTime() - b.at.getTime());
  const same = ida.filter((m) => (m.payloadMasked as { soToKhai?: unknown } | null)?.soToKhai === declarationNo);
  const pick = same[0] ?? ida[0];
  return vnDateOf(pick ? pick.at : storedAt);
}

/**
 * Đối soát C6 cho một tờ (kết quả `result` như vừa lưu): có số tờ khai và dấu raw.catalogNo không khớp (số, tập dòng đã gửi) → ghi mặt hàng của tờ
 * vào danh mục (ngày – issuedDate; `storedAt` = updated_at của kết quả TRƯỚC lần xử lý này), thành công → đặt dấu (transaction ngắn riêng,
 * chỉ khi tờ còn đúng số). Danh mục lỗi → không đặt dấu, lần sau ghi lại. Không nối danh mục / không đọc được dòng → bỏ qua.
 */
export async function reconcileCatalogDeclarationNo(
  deps: Pick<CustomsDeps, "catalog" | "declarations" | "uow">,
  ctx: { orgId: OrgId; userId: UserId },
  result: Pick<ResultRow, "dossierId" | "branch" | "declarationNo" | "raw">,
  storedAt: Date,
): Promise<void> {
  const declarationNo = result.declarationNo;
  if (!declarationNo) return;
  const key = sentLinesKey(result.raw);
  if (markerMatches(result.raw, declarationNo, key)) return;
  const catalog = deps.catalog;
  const read = deps.declarations.lineCatalogItems?.bind(deps.declarations);
  if (!catalog || !read) return;
  const { dossierId, branch } = result;
  let declarationId: string | null = null;
  try {
    const found = await read(ctx.orgId, dossierId);
    if (!found) return;
    declarationId = found.declarationId;
    const itemIds = sheetCatalogItems(found.lines, result.raw, branch);
    if (itemIds.length) {
      const date = await issuedDate(deps, ctx, result, declarationNo, storedAt);
      await catalog.recordDeclarationNo(ctx.orgId, itemIds.map((itemId) => ({ itemId, declarationNo, date })));
    }
  } catch (e) {
    log.error("integration→catalog: ghi số tờ khai cuối của mặt hàng lỗi – sẽ ghi lại ở lần xử lý sau", { orgId: ctx.orgId, dossierId, declarationId, branch, declarationNo, err: e });
    return;
  }
  try {
    await deps.uow.asOrg(ctx, (r) => r.results.markCatalogNo(ctx.orgId, dossierId, branch, declarationNo, key));
  } catch (e) {
    log.error("integration→catalog: đánh dấu số tờ khai đã ghi danh mục lỗi – lần sau gọi lại (idempotent)", { orgId: ctx.orgId, dossierId, branch, declarationNo, err: e });
  }
}
