// Tỷ giá tính thuế: job chụp bảng Vietcombank tối thứ Năm, đội vận hành xem/sửa, cảnh báo khi lấy lỗi.
import { beforeEach, describe, expect, it } from "vitest";
import { fixedClock } from "../../../../shared/clock.js";
import { sequentialIdGen } from "../../../../shared/ids.js";
import { errCode, unwrap } from "../../../../shared/result.js";
import { VCB_XML_2026_10_15 } from "../../domain/__fixtures__/vcb-2026-10-15.js";
import { buildAttention } from "../../domain/attention.js";
import type { StaffActor } from "../../domain/staff-rules.js";
import { captureWeeklyRates, listExchangeRates, rateAttentionInput, recordRateFetchFailure, upsertExchangeRate, type RateDeps } from "../exchange-rates.js";
import type { AdminDeps, AdminRepos, AuditRow, ExchangeRateRow, RateFetchRow } from "../ports.js";

const NOW = "2026-10-15T16:30:00.000Z"; // 23:30 thứ Năm giờ VN
let rates: ExchangeRateRow[];
let fetches: RateFetchRow[];
let audits: AuditRow[];
let xml: string;
let deps: RateDeps & AdminDeps;
const platform: StaffActor = { userId: "usr_bao", name: "Hoàng Bảo", email: "bao@x.vn", role: "SUPER_ADMIN", status: "ACTIVE" };
const support: StaffActor = { ...platform, userId: "usr_trang", role: "SUPPORT" };

beforeEach(() => {
  rates = [];
  fetches = [];
  audits = [];
  xml = VCB_XML_2026_10_15;
  const repos = {
    exchangeRates: {
      list: async (from: string) => rates.filter((r) => r.effectiveFrom >= from).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom) || a.currency.localeCompare(b.currency)),
      upsertAuto: async (rows: { currency: string; effectiveFrom: string; rate: string }[], boardAt: Date) => {
        for (const x of rows) {
          const ex = rates.find((r) => r.currency === x.currency && r.effectiveFrom === x.effectiveFrom);
          if (ex?.source === "MANUAL") continue;
          if (ex) Object.assign(ex, { rate: x.rate, source: "VCB", snapshotAt: boardAt });
          else rates.push({ ...x, source: "VCB", snapshotAt: boardAt, updatedBy: null, updatedByName: null, note: null });
        }
      },
      upsertManual: async (x: { currency: string; effectiveFrom: string; rate: string; updatedBy: string; note: string }) => {
        rates = rates.filter((r) => !(r.currency === x.currency && r.effectiveFrom === x.effectiveFrom));
        rates.push({ currency: x.currency, effectiveFrom: x.effectiveFrom, rate: x.rate, source: "MANUAL", snapshotAt: null, updatedBy: x.updatedBy, updatedByName: "Hoàng Bảo", note: x.note });
      },
    },
    rateFetches: { insert: async (r: RateFetchRow) => void fetches.push(r), latest: async () => fetches.at(-1) ?? null },
    audit: { insert: async (a: AuditRow) => void audits.push(a), list: async () => audits },
  } as unknown as AdminRepos;
  deps = { uow: { run: (fn: (r: AdminRepos) => Promise<unknown>) => fn(repos) }, vcb: { fetchBoard: async () => xml }, clock: fixedClock(NOW), idGen: sequentialIdGen() } as unknown as RateDeps & AdminDeps;
});

describe("captureWeeklyRates", () => {
  it("chụp bảng → tỷ giá hiệu lực từ thứ Hai 19/10, nguồn VCB, giờ bảng; ghi nhật ký OK", async () => {
    const r = unwrap(await captureWeeklyRates(deps));
    expect(r).toMatchObject({ effectiveFrom: "2026-10-19", count: 7 });
    expect(rates.find((x) => x.currency === "USD")).toMatchObject({ effectiveFrom: "2026-10-19", rate: "25710.00", source: "VCB" });
    expect(rates.find((x) => x.currency === "USD")!.snapshotAt!.toISOString()).toBe("2026-10-15T02:32:19.000Z");
    expect(fetches).toMatchObject([{ status: "OK", count: 7, effectiveFrom: "2026-10-19" }]);
  });
  it("đã có tỷ giá nhập tay cùng tuần → giữ nguyên; chạy lại không nhân đôi", async () => {
    rates.push({ currency: "USD", effectiveFrom: "2026-10-19", rate: "25800", source: "MANUAL", snapshotAt: null, updatedBy: "usr_bao", updatedByName: "Hoàng Bảo", note: "x" });
    unwrap(await captureWeeklyRates(deps));
    unwrap(await captureWeeklyRates(deps));
    expect(rates.filter((x) => x.currency === "USD")).toEqual([expect.objectContaining({ rate: "25800", source: "MANUAL" })]);
    expect(rates.filter((x) => x.currency === "EUR")).toHaveLength(1);
  });
  it("Vietcombank trả HTML → ném lỗi (để BullMQ thử lại), không ghi tỷ giá nào", async () => {
    xml = "<html>bảo trì</html>";
    await expect(captureWeeklyRates(deps)).rejects.toThrow(/Vietcombank/);
    expect(rates).toEqual([]);
  });
  it("chạy ngoài khung (worker chết tối thứ Năm, BullMQ chạy bù thứ Hai) → không ghi tỷ giá, ghi FAILED", async () => {
    deps.clock = fixedClock("2026-10-19T03:00:00.000Z");
    const r = await captureWeeklyRates(deps);
    expect(r.ok).toBe(false);
    expect(rates).toEqual([]);
    expect(fetches.at(-1)).toMatchObject({ status: "FAILED", error: expect.stringContaining("thứ Năm") });
  });
  it("bảng của ngày sau thứ Năm (Vietcombank đã đổi bảng sáng thứ Sáu) → không nhận; bảng thứ Tư khi thứ Năm nghỉ lễ → nhận", async () => {
    deps.clock = fixedClock("2026-10-15T23:00:00.000Z"); // 06:00 VN thứ Sáu – còn trong khung thử lại
    xml = VCB_XML_2026_10_15.replace("10/15/2026 9:32:19 AM", "10/16/2026 5:59:00 AM");
    expect((await captureWeeklyRates(deps)).ok).toBe(false);
    expect(rates).toEqual([]);
    xml = VCB_XML_2026_10_15.replace("10/15/2026 9:32:19 AM", "10/14/2026 4:00:00 PM");
    expect(unwrap(await captureWeeklyRates(deps)).effectiveFrom).toBe("2026-10-19");
  });
  it("hết lượt thử → nhật ký FAILED → 'Cần chú ý' báo đỏ; chưa có USD tuần này → báo", async () => {
    await recordRateFetchFailure(deps, "Bảng tỷ giá Vietcombank không đọc được: không phải ExrateList");
    const input = await deps.uow.run((r) => rateAttentionInput(r, deps.clock.now()));
    const items = buildAttention({ orgs: [], integrations: [], failedJobs: 0, pendingJoins: [], now: deps.clock.now(), rates: input });
    expect(items.filter((i) => i.kind === "RATE_FETCH").map((i) => i.severity)).toEqual(["danger", "danger"]);
    expect(items[0]!.href).toBe("/admin/exchange-rates");
  });
});

describe("xem / sửa tỷ giá (khu Quản trị)", () => {
  it("upsert: SUPPORT bị chặn; PLATFORM ghi MANUAL + nhật ký có lý do; ngoại tệ VCB không công bố (TWD) nhập được", async () => {
    const input = { currency: "TWD", effectiveFrom: "2026-10-19", rate: "805.12", reason: "Tỷ giá chéo NHNN tuần 19/10" };
    expect(errCode(await upsertExchangeRate(deps, support, input))).toBe("FORBIDDEN");
    const saved = unwrap(await upsertExchangeRate(deps, platform, input));
    expect(saved).toMatchObject({ currency: "TWD", effectiveFrom: "2026-10-19", rate: "805.12", source: "MANUAL", updatedByName: "Hoàng Bảo" });
    expect(audits).toMatchObject([{ action: "EXCHANGE_RATE_UPDATED", targetType: "EXCHANGE_RATE", reason: input.reason, detail: expect.stringContaining("805.12") }]);
  });
  it("list: nhóm theo tuần mới nhất trước; lần lấy gần nhất; lần chạy kế tiếp là thứ Năm sau 16:30Z", async () => {
    unwrap(await captureWeeklyRates(deps));
    rates.push({ currency: "USD", effectiveFrom: "2026-10-12", rate: "25600", source: "SEED", snapshotAt: null, updatedBy: null, updatedByName: null, note: null });
    const v = unwrap(await listExchangeRates(deps, support));
    expect(v.weeks.map((w) => w.effectiveFrom)).toEqual(["2026-10-19", "2026-10-12"]);
    expect(v.lastFetch).toMatchObject({ status: "OK", count: 7 });
    expect(v.nextRunAt).toBe("2026-10-22T16:30:00.000Z");
  });
});
