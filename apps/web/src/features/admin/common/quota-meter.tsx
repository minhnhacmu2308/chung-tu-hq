import { Progress } from "@kb/ui";
import { formatNumber } from "@/lib/format";
import { quotaState } from "./admin-display";

/** Mức dùng hạn mức hồ sơ tháng: số + thanh + chữ trạng thái khi cần chú ý (không truyền nghĩa chỉ bằng màu). */
export function QuotaMeter({ used, limit, bonus = 0, compact = false }: { used: number; limit: number; bonus?: number; compact?: boolean }) {
  const total = limit + bonus;
  const q = quotaState(used, total);
  return (
    <div className={compact ? "flex min-w-32 flex-col gap-1" : "flex flex-col gap-1.5"}>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="tabular-nums text-fg">
          {formatNumber(used)} / {formatNumber(total)}
          {!compact && " hồ sơ"}
        </span>
        {q.tone !== "primary" && <span className={q.tone === "danger" ? "text-xs text-danger-subtle-fg" : "text-xs text-warning-subtle-fg"}>{q.label}</span>}
      </div>
      <Progress value={Math.min(used, total)} max={Math.max(total, 1)} tone={q.tone} size="sm" aria-label={`Đã dùng ${q.percent}% hạn mức hồ sơ – ${q.label}`} />
      {!compact && bonus > 0 && <p className="text-xs text-fg-subtle">Gồm {formatNumber(bonus)} hồ sơ nới tạm trong tháng này.</p>}
    </div>
  );
}
