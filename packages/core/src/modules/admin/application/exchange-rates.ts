// Tỷ giá tính thuế theo tuần (BACKEND-TODO D2): job tối thứ Năm chụp bảng Vietcombank; đội vận hành xem/sửa ở khu Quản trị.
import type { ExchangeRate, ExchangeRatesView, UpsertExchangeRateInput } from "@kb/contracts";
import type { Clock } from "../../../shared/clock.js";
import type { IdGen } from "../../../shared/ids.js";
import { domainError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { nextMonday, parseVcbJson, parseVcbXml, vnDateOf, weekStart } from "../domain/exchange-rate.js";
import type { RateAttentionInput } from "../domain/attention.js";
import { audit, guarded, type StaffActor } from "./_shared.js";
import type { AdminDeps, AdminRepos, AdminUow, ExchangeRateRow, RateFetchRow } from "./ports.js";

/** Bảng tỷ giá công khai của Vietcombank (XML). */
export interface VcbRateSource {
  fetchBoard(): Promise<string>;
  /** Bảng cuối ngày `date` (YYYY-MM-DD, giờ VN) – JSON, để lấy bù tuần đã qua. */
  fetchBoardOn(date: string): Promise<string>;
}
export type RateDeps = { uow: AdminUow; vcb: VcbRateSource; clock: Clock; idGen: IdGen };

const DAY = 86_400_000;
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
/** Lịch job: 16:30 UTC thứ Năm = 23:30 giờ VN ("cuối ngày"). */
export const RATE_JOB_CRON = "30 16 * * 4";
export function nextRateRunAt(now: Date): string {
  for (let d = 0; d <= 7; d++) {
    const t = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + d, 16, 30));
    if (t.getUTCDay() === 4 && t > now) return t.toISOString();
  }
  throw new Error("unreachable");
}

const toDto = (r: ExchangeRateRow): ExchangeRate => ({
  currency: r.currency, effectiveFrom: r.effectiveFrom, rate: r.rate.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, ""), source: r.source,
  snapshotAt: r.snapshotAt?.toISOString() ?? null, updatedByName: r.updatedByName, note: r.note,
});
const fetchDto = (f: RateFetchRow) => ({ id: f.id, ranAt: f.ranAt.toISOString(), effectiveFrom: f.effectiveFrom, status: f.status, count: f.count, boardAt: f.boardAt?.toISOString() ?? null, error: f.error });

/** Job: lấy bảng Vietcombank → tỷ giá hiệu lực từ thứ Hai kế tiếp (nguồn VCB), không đè nhập tay. Lỗi → ném để BullMQ thử lại (không ghi một phần). */
export async function captureWeeklyRates(deps: RateDeps): Promise<Result<{ effectiveFrom: string; count: number; boardAt: string }>> {
  const now = deps.clock.now();
  const effectiveFrom = nextMonday(now);
  // Khung chụp: tối thứ Năm → sáng thứ Sáu (giờ VN). Chạy bù muộn hơn (worker chết) → không đoán tỷ giá, ghi FAILED để nhập tay.
  const today = vnDateOf(now);
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay();
  if (dow !== 4 && dow !== 5) return fail(deps, `Ngoài khung chụp tỷ giá (tối thứ Năm → sáng thứ Sáu); hôm nay ${today} – nhập tay tỷ giá tuần ${effectiveFrom}`);
  const thursday = addDays(today, dow === 5 ? -1 : 0);
  const board = parseVcbXml(await deps.vcb.fetchBoard());
  // Bảng phải là của thứ Năm (hoặc ngày làm việc liền trước khi nghỉ lễ, tối đa 10 ngày) – không nhận bảng ngày sau.
  const boardDay = vnDateOf(board.boardAt);
  if (boardDay > thursday || boardDay < addDays(thursday, -10)) return fail(deps, `Bảng Vietcombank ngày ${boardDay} không phải bảng cuối ngày thứ Năm ${thursday} – nhập tay tỷ giá tuần ${effectiveFrom}`);
  await deps.uow.run(async (r) => {
    await r.exchangeRates.upsertAuto(board.rates.map((x) => ({ currency: x.currency, effectiveFrom, rate: x.transfer })), board.boardAt, now);
    await r.rateFetches.insert({ id: deps.idGen.next("job"), ranAt: now, effectiveFrom, status: "OK", count: board.rates.length, boardAt: board.boardAt, error: null });
  });
  return ok({ effectiveFrom, count: board.rates.length, boardAt: board.boardAt.toISOString() });
}

/**
 * Lấy bù tỷ giá của TUẦN ĐANG ÁP DỤNG khi chưa có (worker không chạy tối thứ Năm, mới cài production…): đọc bảng cuối ngày thứ Năm tuần trước
 * qua API theo ngày của Vietcombank. Tuần đã có bảng Vietcombank → không làm gì. Tỷ giá mẫu (SEED) không tính là có.
 * Chạy khi worker khởi động và mỗi sáng. Lỗi mạng → ném để BullMQ thử lại.
 */
export async function ensureCurrentWeekRates(deps: RateDeps): Promise<Result<{ effectiveFrom: string; count: number; boardAt: string } | { effectiveFrom: string; skipped: true }>> {
  const now = deps.clock.now();
  const effectiveFrom = weekStart(vnDateOf(now));
  const has = await deps.uow.run((r) => r.exchangeRates.list(effectiveFrom));
  // Đã có bảng Vietcombank của tuần → xong. Chỉ có nhập tay vài mã (vd USD) → vẫn lấy bảng để có các ngoại tệ khác (nhập tay không bị đè).
  if (has.some((x) => x.effectiveFrom === effectiveFrom && x.source === "VCB")) return ok({ effectiveFrom, skipped: true });
  const thursday = addDays(effectiveFrom, -4);
  const board = parseVcbJson(await deps.vcb.fetchBoardOn(thursday));
  // Bảng phải là của thứ Năm đó (hoặc ngày làm việc liền trước khi nghỉ lễ, tối đa 10 ngày).
  const boardDay = vnDateOf(board.boardAt);
  if (boardDay > thursday || boardDay < addDays(thursday, -10)) return fail(deps, `Bảng Vietcombank ngày ${boardDay} không phải bảng cuối ngày thứ Năm ${thursday} – nhập tay tỷ giá tuần ${effectiveFrom}`, effectiveFrom);
  await deps.uow.run(async (r) => {
    await r.exchangeRates.upsertAuto(board.rates.map((x) => ({ currency: x.currency, effectiveFrom, rate: x.transfer })), board.boardAt, now);
    await r.rateFetches.insert({ id: deps.idGen.next("job"), ranAt: now, effectiveFrom, status: "OK", count: board.rates.length, boardAt: board.boardAt, error: null });
  });
  return ok({ effectiveFrom, count: board.rates.length, boardAt: board.boardAt.toISOString() });
}

async function fail(deps: RateDeps, error: string, effectiveFrom?: string): Promise<Result<never>> {
  await recordRateFetchFailure(deps, error, effectiveFrom);
  return err(domainError("INVALID_STATE", error));
}

/** Worker hết lượt thử (tới sáng thứ Sáu): ghi FAILED → mục "Cần chú ý" của khu Quản trị; tờ khai vẫn dùng tỷ giá tuần trước kèm cảnh báo. */
export async function recordRateFetchFailure(deps: RateDeps, error: string, effectiveFrom?: string): Promise<void> {
  const now = deps.clock.now();
  await deps.uow.run((r) => r.rateFetches.insert({ id: deps.idGen.next("job"), ranAt: now, effectiveFrom: effectiveFrom ?? nextMonday(now), status: "FAILED", count: 0, boardAt: null, error: error.slice(0, 500) }));
}

/** Lấy bù hết lượt thử: ghi FAILED cho TUẦN ĐANG ÁP DỤNG (tuần lấy bù), không phải tuần sau. */
export async function recordRateCatchUpFailure(deps: RateDeps, error: string): Promise<void> {
  const now = deps.clock.now();
  const effectiveFrom = weekStart(vnDateOf(now));
  // Tuần đã có tỷ giá Vietcombank (vd job thứ Năm đã lấy) → không báo động giả.
  const rows = await deps.uow.run((r) => r.exchangeRates.list(effectiveFrom));
  if (rows.some((x) => x.effectiveFrom === effectiveFrom && x.source === "VCB")) return;
  await recordRateFetchFailure(deps, error, effectiveFrom);
}

/** Dữ liệu cho mục "Cần chú ý": lần lấy gần nhất + tuần này đã có tỷ giá USD chưa. */
export async function rateAttentionInput(r: AdminRepos, now: Date): Promise<RateAttentionInput> {
  const thisWeek = weekStart(vnDateOf(now));
  const [lastFetch, rows] = await Promise.all([r.rateFetches.latest(), r.exchangeRates.list(thisWeek)]);
  return { thisWeek, hasUsdThisWeek: rows.some((x) => x.currency === "USD" && x.effectiveFrom === thisWeek), lastFetch: lastFetch ? { status: lastFetch.status, effectiveFrom: lastFetch.effectiveFrom, error: lastFetch.error } : null };
}

/** 8 tuần gần nhất (kể cả tuần sau nếu đã chụp), nhóm theo tuần mới nhất trước. */
export async function listExchangeRates(deps: AdminDeps, actor: StaffActor, opts: { weeks?: number } = {}): Promise<Result<ExchangeRatesView>> {
  return guarded(actor, "VIEW", () =>
    deps.uow.run(async (r) => {
      const now = deps.clock.now();
      const from = addDays(weekStart(vnDateOf(now)), -7 * ((opts.weeks ?? 8) - 1));
      const [rows, last] = await Promise.all([r.exchangeRates.list(from), r.rateFetches.latest()]);
      const weeks = new Map<string, ExchangeRate[]>();
      for (const row of rows) weeks.set(row.effectiveFrom, [...(weeks.get(row.effectiveFrom) ?? []), toDto(row)]);
      return ok({
        weeks: [...weeks.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([effectiveFrom, rates]) => ({ effectiveFrom, rates })),
        lastFetch: last ? fetchDto(last) : null,
        nextRunAt: nextRateRunAt(now),
      });
    }),
  );
}

/** Đội vận hành thêm/sửa tỷ giá một tuần (vd tỷ giá chéo NHNN). Quyền PLATFORM, ghi nhật ký kèm lý do. */
export async function upsertExchangeRate(deps: AdminDeps, actor: StaffActor, input: UpsertExchangeRateInput): Promise<Result<ExchangeRate>> {
  return guarded(actor, "PLATFORM", () =>
    deps.uow.run(async (r) => {
      const at = deps.clock.now();
      await r.exchangeRates.upsertManual({ currency: input.currency, effectiveFrom: input.effectiveFrom, rate: input.rate, updatedBy: actor.userId, note: input.reason }, at);
      await audit(deps, r, actor, "EXCHANGE_RATE_UPDATED", { type: "EXCHANGE_RATE", id: `${input.currency}_${input.effectiveFrom}`, label: `${input.currency} tuần ${input.effectiveFrom}` }, input.reason, `Tỷ giá ${input.rate}`);
      const row = (await r.exchangeRates.list(input.effectiveFrom)).find((x) => x.currency === input.currency && x.effectiveFrom === input.effectiveFrom)!;
      return ok(toDto(row));
    }),
  );
}
