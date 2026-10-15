// Danh sách "cần chú ý" trên màn Tổng quan vận hành – code thuần.
import type { AdminOrg, AttentionItem } from "@kb/contracts";
import { daysUntil } from "./period.js";

export const QUOTA_WARN = 0.9;
export const EXPIRING_DAYS = 7;
export const JOIN_STALE_DAYS = 3;
const DAY = 86_400_000;

/** Tỷ giá tính thuế: tuần hiện tại (thứ Hai), đã có USD chưa, lần lấy Vietcombank gần nhất. */
export type RateAttentionInput = { thisWeek: string; hasUsdThisWeek: boolean; lastFetch: { status: "OK" | "FAILED"; effectiveFrom: string; error: string | null } | null };

export type AttentionInput = {
  orgs: AdminOrg[];
  integrations: { id: string; name: string; status: string; detail?: string | undefined }[];
  failedJobs: number;
  /** Thời điểm gửi của các yêu cầu tham gia đang chờ. */
  pendingJoins: Date[];
  now: Date;
  rates?: RateAttentionInput;
};

export function buildAttention(i: AttentionInput): AttentionItem[] {
  const out: AttentionItem[] = [];
  for (const o of i.orgs.filter((x) => x.status === "ACTIVE")) {
    const limit = o.plan.dossiersPerMonth + o.quotaBonus;
    const ratio = limit > 0 ? o.usage.dossiersThisMonth / limit : 0;
    if (ratio >= QUOTA_WARN) {
      out.push({
        id: `quota_${o.id}`,
        kind: "QUOTA",
        severity: ratio >= 1 ? "danger" : "warning",
        title: ratio >= 1 ? `${o.name} đã hết hạn mức` : `${o.name} sắp hết hạn mức`,
        detail: `${o.usage.dossiersThisMonth}/${limit} hồ sơ tháng này · gói ${o.plan.name}`,
        href: `/admin/orgs/${o.id}?tab=plan`,
      });
    }
    const days = daysUntil(new Date(`${o.plan.renewsAt}T00:00:00Z`), i.now);
    // Gói trả phí tự gia hạn theo kỳ; chỉ dùng thử mới thật sự "hết hạn".
    if (o.plan.code === "TRIAL" && days <= EXPIRING_DAYS) {
      out.push({
        id: `expiring_${o.id}`,
        kind: "PLAN_EXPIRING",
        severity: days < 0 ? "danger" : "warning",
        title: `${o.name}: dùng thử ${days < 0 ? `đã hết hạn ${-days} ngày` : days === 0 ? "hết hạn hôm nay" : `hết hạn sau ${days} ngày`}`,
        detail: "Liên hệ chuyển sang gói trả phí hoặc gia hạn dùng thử.",
        href: `/admin/orgs/${o.id}?tab=plan`,
      });
    }
  }
  for (const it of i.integrations.filter((x) => x.status === "ERROR")) {
    out.push({ id: `integration_${it.id}`, kind: "INTEGRATION_ERROR", severity: "danger", title: `${it.name} đang lỗi`, detail: it.detail ?? "Kiểm tra kết nối.", href: "/admin/integrations" });
  }
  if (i.failedJobs > 0) {
    out.push({ id: "jobs_failed", kind: "JOBS_FAILED", severity: "warning", title: `${i.failedJobs} job lỗi chờ xử lý`, detail: "Xem nguyên nhân và chạy lại ở màn Sức khỏe hệ thống.", href: "/admin/system" });
  }
  const stale = i.pendingJoins.filter((at) => i.now.getTime() - at.getTime() > JOIN_STALE_DAYS * DAY).length;
  if (stale > 0) {
    out.push({ id: "join_pending", kind: "JOIN_PENDING", severity: "warning", title: `${stale} yêu cầu tham gia chờ quá ${JOIN_STALE_DAYS} ngày`, detail: "Chủ doanh nghiệp chưa duyệt – nhắc họ hoặc liên hệ người đăng ký.", href: "/admin/users?view=pending" });
  }
  const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  if (i.rates?.lastFetch?.status === "FAILED") {
    out.push({ id: "rate_fetch_failed", kind: "RATE_FETCH", severity: "danger", title: `Không lấy được tỷ giá tính thuế tuần ${ddmm(i.rates.lastFetch.effectiveFrom)}`, detail: `${i.rates.lastFetch.error ?? "Lỗi không rõ"} – nhập tay ở mục Tỷ giá tính thuế.`, href: "/admin/exchange-rates" });
  }
  if (i.rates && !i.rates.hasUsdThisWeek) {
    out.push({ id: "rate_missing", kind: "RATE_FETCH", severity: "danger", title: `Chưa có tỷ giá USD tuần ${ddmm(i.rates.thisWeek)}`, detail: "Tờ khai đang dùng tỷ giá tuần trước – kiểm tra và nhập tay nếu cần.", href: "/admin/exchange-rates" });
  }
  // Đỏ trước, vàng sau; giữ thứ tự gốc trong cùng mức.
  return out.sort((a, b) => Number(b.severity === "danger") - Number(a.severity === "danger"));
}
