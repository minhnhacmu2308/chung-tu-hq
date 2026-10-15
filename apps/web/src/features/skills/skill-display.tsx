"use client";
// Hiển thị dùng chung cho màn Skill AI.
import { Badge, Tooltip } from "@kb/ui";
import { MIN_SAMPLES_FOR_ACCURACY } from "@/api/skills";
import { formatNumber } from "@/lib/format";
import type { Skill, SkillField, SkillKind } from "@/mocks/types";

export const SKILL_KIND_LABELS: Record<SkillKind, string> = {
  DOCUMENT: "Theo loại chứng từ",
  SUPPLIER: "Theo nhà cung cấp",
};

export const FIELD_TYPE_LABELS: Record<SkillField["type"], string> = {
  string: "Văn bản",
  decimal: "Số thập phân",
  date: "Ngày",
  code: "Mã / số hiệu",
  party: "Thương nhân",
  items: "Bảng dòng hàng",
};

export const formatPercent = (v: number) => `${formatNumber(v * 100, 1)}%`;

/** Ngưỡng màu: ≥ 95% tốt, ≥ 90% chấp nhận, thấp hơn cần thêm mẫu. Luôn kèm chữ – không truyền nghĩa chỉ bằng màu. */
export function accuracyTone(v: number) {
  return v >= 0.95 ? "success" : v >= 0.9 ? "warning" : "danger";
}

export function AccuracyBadge({ skill }: { skill: Pick<Skill, "accuracy" | "labeledSamples" | "kind"> }) {
  if (skill.accuracy === undefined || skill.labeledSamples < MIN_SAMPLES_FOR_ACCURACY) {
    return (
      <Tooltip content={`Cần ít nhất ${MIN_SAMPLES_FOR_ACCURACY} mẫu đã gắn nhãn để đo độ chính xác`}>
        <span tabIndex={0} className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus">
          <Badge tone="neutral" variant="outline">Chưa đủ mẫu</Badge>
        </span>
      </Tooltip>
    );
  }
  return <Badge tone={accuracyTone(skill.accuracy)}>{formatPercent(skill.accuracy)}</Badge>;
}
