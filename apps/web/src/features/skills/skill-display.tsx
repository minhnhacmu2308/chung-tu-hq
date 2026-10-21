"use client";
// Hiển thị dùng chung cho màn Skill AI.
import { Badge, fill, Tooltip, useMessages } from "@kb/ui";
import { MIN_SAMPLES_FOR_ACCURACY } from "@/api/skills";
import { formatNumber } from "@/lib/format";
import type { Skill } from "@/mocks/types";
import { DISPLAY_MESSAGES } from "./skills.messages";

export { FIELD_TYPE_LABELS, SKILL_KIND_LABELS } from "./skills.messages";

export const formatPercent = (v: number) => `${formatNumber(v * 100, 1)}%`;

/** Ngưỡng màu: ≥ 95% tốt, ≥ 90% chấp nhận, thấp hơn cần thêm mẫu. Luôn kèm chữ – không truyền nghĩa chỉ bằng màu. */
export function accuracyTone(v: number) {
  return v >= 0.95 ? "success" : v >= 0.9 ? "warning" : "danger";
}

export function AccuracyBadge({ skill }: { skill: Pick<Skill, "accuracy" | "labeledSamples" | "kind"> }) {
  const t = useMessages(DISPLAY_MESSAGES);
  if (skill.accuracy === undefined || skill.labeledSamples < MIN_SAMPLES_FOR_ACCURACY) {
    return (
      <Tooltip content={fill(t.needSamples, { n: MIN_SAMPLES_FOR_ACCURACY })}>
        <span tabIndex={0} className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus">
          <Badge tone="neutral" variant="outline">{t.notEnough}</Badge>
        </span>
      </Tooltip>
    );
  }
  return <Badge tone={accuracyTone(skill.accuracy)}>{formatPercent(skill.accuracy)}</Badge>;
}
