// Danh sách "cần chú ý" trên màn Tổng quan vận hành – code thuần.
import { LOW_CREDITS, type AdminOrg, type AttentionItem } from "@kb/contracts";

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
    const href = `/admin/orgs/${o.id}?tab=plan`;
    if (o.plan.kind === "PAYG") {
      // Chỉ nhắc doanh nghiệp đang khai (có tờ khai được chấp nhận trong 30 ngày) – không làm ồn với doanh nghiệp chưa dùng.
      if (o.billing.balance <= LOW_CREDITS && o.billing.declarations30d > 0)
        out.push({
          id: `low_credits_${o.id}`, kind: "LOW_CREDITS", severity: o.billing.balance <= 0 ? "danger" : "warning",
          title: o.billing.balance <= 0 ? `${o.name} đã hết lượt` : `${o.name} còn ${o.billing.balance} lượt`,
          detail: `${o.billing.declarations30d} tờ khai trong 30 ngày qua – nhắc khách mua thêm lượt hoặc nạp tay.`, href,
        });
      continue;
    }
    const c = o.billing.contract;
    if (!c?.endsOn) {
      out.push({ id: `contract_no_end_${o.id}`, kind: "CONTRACT_NO_END", severity: "warning", title: `${o.name}: hợp đồng chưa có ngày kết thúc`, detail: "Nhập số hợp đồng, hiệu lực và giá trị ở tab Gói.", href });
      continue;
    }
    if (c.status === "EXPIRING")
      out.push({ id: `contract_expiring_${o.id}`, kind: "CONTRACT_EXPIRING", severity: "warning", title: `${o.name}: hợp đồng ${c.daysLeft === 0 ? "hết hạn hôm nay" : `còn ${c.daysLeft} ngày`}`, detail: `Hết hạn ${c.endsOn} – liên hệ gia hạn.`, href });
    if (c.status === "GRACE" || c.status === "EXPIRED")
      out.push({
        id: `contract_expired_${o.id}`, kind: "CONTRACT_EXPIRED", severity: c.status === "EXPIRED" ? "danger" : "warning",
        title: `${o.name}: hợp đồng đã hết hạn ${-(c.daysLeft ?? 0)} ngày`,
        detail: c.status === "EXPIRED" ? "Đã quá 7 ngày ân hạn – doanh nghiệp không khai được tờ khai mới." : "Đang trong 7 ngày ân hạn – vẫn khai được, cần gia hạn ngay.", href,
      });
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
