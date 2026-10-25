import { cva, type VariantProps } from "class-variance-authority";
import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "../lib/cn.js";
import { Illustration, type IllustrationName, type IllustrationProps } from "./illustration.js";
import { useUiLocale, type UiLocale } from "../lib/i18n.js";

/* ---------------- Badge ---------------- */

export type Tone = "neutral" | "primary" | "success" | "warning" | "danger" | "info";

export const badgeVariants = cva("inline-flex items-center gap-1 rounded-full font-medium whitespace-nowrap", {
  variants: {
    size: { sm: "px-1.5 py-px text-[0.6875rem]", md: "px-2 py-0.5 text-xs", lg: "px-2.5 py-1 text-sm" },
    tone: { neutral: "", primary: "", success: "", warning: "", danger: "", info: "" },
    variant: { subtle: "", solid: "", outline: "border bg-transparent" },
  },
  compoundVariants: [
    { variant: "subtle", tone: "neutral", class: "bg-neutral-subtle text-neutral-subtle-fg" },
    { variant: "subtle", tone: "primary", class: "bg-primary-subtle text-primary-subtle-fg" },
    { variant: "subtle", tone: "success", class: "bg-success-subtle text-success-subtle-fg" },
    { variant: "subtle", tone: "warning", class: "bg-warning-subtle text-warning-subtle-fg" },
    { variant: "subtle", tone: "danger", class: "bg-danger-subtle text-danger-subtle-fg" },
    { variant: "subtle", tone: "info", class: "bg-info-subtle text-info-subtle-fg" },
    { variant: "solid", tone: "neutral", class: "bg-neutral text-neutral-fg" },
    { variant: "solid", tone: "primary", class: "bg-primary text-primary-fg" },
    { variant: "solid", tone: "success", class: "bg-success text-success-fg" },
    { variant: "solid", tone: "warning", class: "bg-warning text-warning-fg" },
    { variant: "solid", tone: "danger", class: "bg-danger text-danger-fg" },
    { variant: "solid", tone: "info", class: "bg-info text-info-fg" },
    { variant: "outline", tone: "neutral", class: "border-border-strong text-fg-muted" },
    { variant: "outline", tone: "primary", class: "border-primary text-primary" },
    { variant: "outline", tone: "success", class: "border-success text-success-subtle-fg" },
    { variant: "outline", tone: "warning", class: "border-warning text-warning-subtle-fg" },
    { variant: "outline", tone: "danger", class: "border-danger text-danger-subtle-fg" },
    { variant: "outline", tone: "info", class: "border-info text-info-subtle-fg" },
  ],
  defaultVariants: { tone: "neutral", variant: "subtle", size: "md" },
});

export type BadgeProps = ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & {
    /** Chấm tròn đầu nhãn – dùng cho nhãn trạng thái. */
    dot?: boolean;
    /** Icon đầu nhãn (tự co theo cỡ chữ). */
    icon?: ReactNode;
  };

export function Badge({ className, tone, variant, size, dot = false, icon, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ tone, variant, size }), className)} {...props}>
      {dot && <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />}
      {icon && <span aria-hidden="true" className="inline-flex shrink-0 [&>svg]:h-[1em] [&>svg]:w-[1em]">{icon}</span>}
      {children}
    </span>
  );
}

/* ---------------- StatusBadge ---------------- */
// Trạng thái nghiệp vụ dùng thống nhất toàn hệ thống. Luôn có chữ – không truyền nghĩa chỉ bằng màu.

export const STATUS_META = {
  // Kết quả luật đối chiếu
  PASS: { tone: "success", label: "Khớp" },
  WARN: { tone: "warning", label: "Lưu ý" },
  FAIL: { tone: "danger", label: "Lỗi" },
  SKIPPED: { tone: "neutral", label: "Bỏ qua" },
  // Trạng thái trường dữ liệu (ADR 0003)
  CROSS_CHECKED: { tone: "success", label: "Đã đối chiếu" },
  SINGLE_SOURCE: { tone: "neutral", label: "Một nguồn" },
  CONFLICT: { tone: "danger", label: "Mâu thuẫn" },
  INVALID_FORMAT: { tone: "danger", label: "Sai định dạng" },
  MODEL_UNSURE: { tone: "warning", label: "Cần kiểm tra" },
  USER_CONFIRMED: { tone: "info", label: "Đã xác nhận" },
  // Trạng thái duyệt hồ sơ
  AUTO_APPROVED: { tone: "success", label: "Tự duyệt được" },
  NEEDS_REVIEW: { tone: "warning", label: "Cần người duyệt" },
  // Phân luồng Hải quan
  GREEN_CHANNEL: { tone: "success", label: "Luồng xanh" },
  YELLOW_CHANNEL: { tone: "warning", label: "Luồng vàng" },
  RED_CHANNEL: { tone: "danger", label: "Luồng đỏ" },
  // Trạng thái hồ sơ khai báo
  DOSSIER_DRAFT: { tone: "neutral", label: "Nháp" },
  DOSSIER_PROCESSING: { tone: "info", label: "Đang xử lý" },
  DOSSIER_NEEDS_REVIEW: { tone: "warning", label: "Cần kiểm tra" },
  DOSSIER_APPROVED: { tone: "primary", label: "Đã duyệt, chờ truyền" },
  DOSSIER_SUBMITTED: { tone: "info", label: "Đã truyền HQ" },
  DOSSIER_CLEARED: { tone: "success", label: "Đã thông quan" },
  DOSSIER_CANCELLED: { tone: "neutral", label: "Đã hủy" },
  // Trạng thái tờ khai trên kênh Hải quan
  CUSTOMS_READY: { tone: "neutral", label: "Chờ truyền" },
  CUSTOMS_SENDING: { tone: "info", label: "Đang truyền" },
  CUSTOMS_INSPECTING: { tone: "warning", label: "Đang kiểm tra" },
  CUSTOMS_CLEARED: { tone: "success", label: "Đã thông quan" },
  // Bản khai bổ sung sau thông quan (AMA)
  AMA_DRAFT: { tone: "warning", label: "Bản nháp, chờ duyệt" },
  AMA_APPROVED: { tone: "primary", label: "Đã duyệt, chờ khai AMA" },
  AMA_PRE_DECLARED: { tone: "info", label: "Đã khai tạm AMA" },
  AMA_RECALLED: { tone: "warning", label: "Đã gọi về sửa (AMB)" },
  AMA_REGISTERED: { tone: "success", label: "Đã khai chính thức (AMC)" },
  // Trạng thái tài khoản (thành viên doanh nghiệp, quản trị viên hệ thống)
  ACCOUNT_ACTIVE: { tone: "success", label: "Đang hoạt động" },
  ACCOUNT_INVITED: { tone: "warning", label: "Đã mời" },
  ACCOUNT_DISABLED: { tone: "neutral", label: "Đã khóa" },
  ACCOUNT_PENDING_JOIN: { tone: "info", label: "Chờ duyệt tham gia" },
  // Trạng thái doanh nghiệp (back-office)
  ORG_ACTIVE: { tone: "success", label: "Đang hoạt động" },
  ORG_SUSPENDED: { tone: "danger", label: "Tạm khóa" },
  // Kết nối hệ thống ngoài
  INTEGRATION_CONNECTED: { tone: "success", label: "Đã kết nối" },
  INTEGRATION_ERROR: { tone: "danger", label: "Lỗi kết nối" },
  INTEGRATION_NOT_CONFIGURED: { tone: "neutral", label: "Chưa cấu hình" },
  // Hộp thư chứng từ: kết nối Gmail / Outlook và email lấy về
  MAILBOX_ACTIVE: { tone: "success", label: "Đang kết nối" },
  MAILBOX_SYNCING: { tone: "info", label: "Đang lấy thư" },
  MAILBOX_ERROR: { tone: "danger", label: "Lỗi lấy thư" },
  MAILBOX_REAUTH: { tone: "warning", label: "Cần kết nối lại" },
  INBOX_NEW: { tone: "info", label: "Chưa xếp" },
  INBOX_DONE: { tone: "success", label: "Đã xếp vào hồ sơ" },
  INBOX_IGNORED: { tone: "neutral", label: "Đã bỏ qua" },
  // Sức khỏe dịch vụ nền
  SERVICE_UP: { tone: "success", label: "Hoạt động tốt" },
  SERVICE_DEGRADED: { tone: "warning", label: "Suy giảm" },
  SERVICE_DOWN: { tone: "danger", label: "Ngừng hoạt động" },
  // Thông báo hệ thống, skill mẫu
  ANNOUNCEMENT_SENT: { tone: "success", label: "Đã gửi" },
  ANNOUNCEMENT_WITHDRAWN: { tone: "neutral", label: "Đã thu hồi" },
  TEMPLATE_PUBLISHED: { tone: "success", label: "Đã phát hành" },
  TEMPLATE_DRAFT: { tone: "neutral", label: "Chưa phát hành" },
  // Chứng từ tải lên → AI đọc
  DOC_UPLOADING: { tone: "info", label: "Đang tải lên" },
  DOC_QUEUED: { tone: "neutral", label: "Chờ đọc" },
  DOC_READING: { tone: "info", label: "AI đang đọc" },
  DOC_DONE: { tone: "success", label: "Đã đọc" },
  DOC_ERROR: { tone: "danger", label: "Lỗi" },
} as const satisfies Record<string, { tone: Tone; label: string }>;

export type Status = keyof typeof STATUS_META;

/** Nhãn tiếng Anh tương ứng STATUS_META (nhãn tiếng Việt nằm trong STATUS_META). */
export const STATUS_LABELS_EN: Record<Status, string> = {
  PASS: "Match", WARN: "Note", FAIL: "Error", SKIPPED: "Skipped",
  CROSS_CHECKED: "Cross-checked", SINGLE_SOURCE: "Single source", CONFLICT: "Conflict", INVALID_FORMAT: "Invalid format",
  MODEL_UNSURE: "Needs check", USER_CONFIRMED: "Confirmed",
  AUTO_APPROVED: "Auto-approved", NEEDS_REVIEW: "Needs review",
  GREEN_CHANNEL: "Green channel", YELLOW_CHANNEL: "Yellow channel", RED_CHANNEL: "Red channel",
  DOSSIER_DRAFT: "Draft", DOSSIER_PROCESSING: "Processing", DOSSIER_NEEDS_REVIEW: "Needs check", DOSSIER_APPROVED: "Approved, awaiting submission",
  DOSSIER_SUBMITTED: "Submitted to customs", DOSSIER_CLEARED: "Cleared", DOSSIER_CANCELLED: "Cancelled",
  CUSTOMS_READY: "Awaiting submission", CUSTOMS_SENDING: "Submitting", CUSTOMS_INSPECTING: "Under inspection", CUSTOMS_CLEARED: "Cleared",
  AMA_DRAFT: "Draft, awaiting approval", AMA_APPROVED: "Approved, awaiting AMA", AMA_PRE_DECLARED: "AMA pre-declared", AMA_RECALLED: "Recalled for edit (AMB)", AMA_REGISTERED: "Registered (AMC)",
  ACCOUNT_ACTIVE: "Active", ACCOUNT_INVITED: "Invited", ACCOUNT_DISABLED: "Disabled", ACCOUNT_PENDING_JOIN: "Awaiting approval",
  ORG_ACTIVE: "Active", ORG_SUSPENDED: "Suspended",
  INTEGRATION_CONNECTED: "Connected", INTEGRATION_ERROR: "Connection error", INTEGRATION_NOT_CONFIGURED: "Not configured",
  MAILBOX_ACTIVE: "Connected", MAILBOX_SYNCING: "Fetching emails", MAILBOX_ERROR: "Fetch failed", MAILBOX_REAUTH: "Reconnect needed",
  INBOX_NEW: "Not filed", INBOX_DONE: "Filed to dossier", INBOX_IGNORED: "Ignored",
  SERVICE_UP: "Healthy", SERVICE_DEGRADED: "Degraded", SERVICE_DOWN: "Down",
  ANNOUNCEMENT_SENT: "Sent", ANNOUNCEMENT_WITHDRAWN: "Withdrawn", TEMPLATE_PUBLISHED: "Published", TEMPLATE_DRAFT: "Unpublished",
  DOC_UPLOADING: "Uploading", DOC_QUEUED: "Queued", DOC_READING: "AI reading", DOC_DONE: "Read", DOC_ERROR: "Error",
};

/** Nhãn tiếng Trung (giản thể) tương ứng STATUS_META. */
export const STATUS_LABELS_ZH: Record<Status, string> = {
  PASS: "一致", WARN: "注意", FAIL: "错误", SKIPPED: "已跳过",
  CROSS_CHECKED: "已交叉核对", SINGLE_SOURCE: "单一来源", CONFLICT: "冲突", INVALID_FORMAT: "格式错误",
  MODEL_UNSURE: "需检查", USER_CONFIRMED: "已确认",
  AUTO_APPROVED: "可自动批准", NEEDS_REVIEW: "需审批人审核",
  GREEN_CHANNEL: "绿色通道", YELLOW_CHANNEL: "黄色通道", RED_CHANNEL: "红色通道",
  DOSSIER_DRAFT: "草稿", DOSSIER_PROCESSING: "处理中", DOSSIER_NEEDS_REVIEW: "需检查", DOSSIER_APPROVED: "已批准，待发送",
  DOSSIER_SUBMITTED: "已发送海关", DOSSIER_CLEARED: "已通关", DOSSIER_CANCELLED: "已取消",
  CUSTOMS_READY: "待发送", CUSTOMS_SENDING: "发送中", CUSTOMS_INSPECTING: "查验中", CUSTOMS_CLEARED: "已通关",
  AMA_DRAFT: "草稿，待批准", AMA_APPROVED: "已批准，待 AMA 申报", AMA_PRE_DECLARED: "已 AMA 临时申报", AMA_RECALLED: "已调回修改（AMB）", AMA_REGISTERED: "已正式申报（AMC）",
  ACCOUNT_ACTIVE: "正常", ACCOUNT_INVITED: "已邀请", ACCOUNT_DISABLED: "已停用", ACCOUNT_PENDING_JOIN: "待批准加入",
  ORG_ACTIVE: "正常", ORG_SUSPENDED: "已暂停",
  INTEGRATION_CONNECTED: "已连接", INTEGRATION_ERROR: "连接错误", INTEGRATION_NOT_CONFIGURED: "未配置",
  MAILBOX_ACTIVE: "已连接", MAILBOX_SYNCING: "正在获取邮件", MAILBOX_ERROR: "获取失败", MAILBOX_REAUTH: "需重新连接",
  INBOX_NEW: "未归档", INBOX_DONE: "已归入档案", INBOX_IGNORED: "已忽略",
  SERVICE_UP: "运行正常", SERVICE_DEGRADED: "性能下降", SERVICE_DOWN: "已停止",
  ANNOUNCEMENT_SENT: "已发送", ANNOUNCEMENT_WITHDRAWN: "已撤回", TEMPLATE_PUBLISHED: "已发布", TEMPLATE_DRAFT: "未发布",
  DOC_UPLOADING: "上传中", DOC_QUEUED: "等待读取", DOC_READING: "AI 读取中", DOC_DONE: "已读取", DOC_ERROR: "错误",
};

/** Nhãn trạng thái theo ngôn ngữ – dùng cho code không phải component (bộ lọc bảng, xuất file…). */
export function statusLabel(status: Status, locale: UiLocale): string {
  if (locale === "en") return STATUS_LABELS_EN[status];
  if (locale === "zh") return STATUS_LABELS_ZH[status];
  return STATUS_META[status].label;
}

/** `icon` (tùy chọn) thay chấm màu – vd spinner khi đang chạy, dấu tích khi xong. */
export type StatusBadgeProps = { status: Status; label?: string; className?: string; icon?: ReactNode };

export function StatusBadge({ status, label, className, icon }: StatusBadgeProps) {
  const meta = STATUS_META[status];
  const locale = useUiLocale();
  return (
    <Badge tone={meta.tone} {...(icon ? { icon } : { dot: true })} className={className} data-status={status}>
      {label ?? statusLabel(status, locale)}
    </Badge>
  );
}

/* ---------------- Alert ---------------- */

const ALERT_TONE: Record<Exclude<Tone, "primary">, string> = {
  neutral: "bg-neutral-subtle text-neutral-subtle-fg border-border",
  success: "bg-success-subtle text-success-subtle-fg border-success/30",
  warning: "bg-warning-subtle text-warning-subtle-fg border-warning/30",
  danger: "bg-danger-subtle text-danger-subtle-fg border-danger/30",
  info: "bg-info-subtle text-info-subtle-fg border-info/30",
};
// Icon đi kèm tông màu: không truyền nghĩa chỉ bằng màu.
const ALERT_ICON = { neutral: Info, success: CircleCheck, warning: TriangleAlert, danger: CircleAlert, info: Info } as const;

export type AlertProps = {
  tone?: Exclude<Tone, "primary">;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
};

/** danger/warning dùng role="alert" (đọc ngay); còn lại role="status". */
export function Alert({ tone = "info", title, children, action, className }: AlertProps) {
  const Icon = ALERT_ICON[tone];
  return (
    <div
      role={tone === "danger" || tone === "warning" ? "alert" : "status"}
      className={cn("flex items-start gap-3 rounded-md border px-4 py-3 text-sm", ALERT_TONE[tone], className)}
    >
      <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      {/* Nội dung + action một hàng xuống dòng được: khung hẹp (mobile) thì action xuống dưới nội dung thay vì ép chữ thành cột hẹp. */}
      <div className="flex min-w-0 flex-1 flex-wrap items-start gap-x-3 gap-y-2">
        <div className="flex min-w-0 flex-1 basis-60 flex-col gap-0.5">
          {title && <p className="font-semibold">{title}</p>}
          {children && <div>{children}</div>}
        </div>
        {action}
      </div>
    </div>
  );
}

/* ---------------- Skeleton ---------------- */

export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return <div aria-hidden="true" className={cn("skeleton-shimmer rounded-md", className)} {...props} />;
}

/* ---------------- EmptyState ---------------- */

export type EmptyStateProps = {
  icon?: ReactNode;
  /** Hình minh họa thay cho icon (bảng trống, không có kết quả, trang 404, lỗi). Không có cả icon lẫn illustration → "empty". */
  illustration?: IllustrationName;
  illustrationSize?: IllustrationProps["size"];
  title: ReactNode;
  description?: ReactNode;
  /** Hành động tiếp theo – bắt buộc nghĩ tới: người dùng nên làm gì khi trống. */
  action?: ReactNode;
  className?: string;
};

export function EmptyState({ icon, illustration: illustrationProp, illustrationSize, title, description, action, className }: EmptyStateProps) {
  // Không truyền icon → mặc định hình minh họa "trống" (khối nhỏ gọn thì truyền icon).
  const illustration = illustrationProp ?? (icon ? undefined : "empty");
  return (
    <div className={cn("flex flex-col items-center gap-2 px-6 py-12 text-center", className)}>
      {illustration ? (
        <Illustration name={illustration} size={illustrationSize ?? (illustrationProp ? "md" : "sm")} className="mb-2 motion-safe:animate-fade-in" />
      ) : icon && (
        <div className="mb-1 inline-flex h-12 w-12 items-center justify-center rounded-full bg-surface-muted text-fg-subtle [&>svg]:h-6 [&>svg]:w-6" aria-hidden="true">
          {icon}
        </div>
      )}
      <p className="text-base font-semibold text-fg">{title}</p>
      {description && <p className="max-w-md text-sm text-fg-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
