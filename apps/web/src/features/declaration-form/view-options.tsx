"use client";
// Nút "Hiển thị" ở dòng tiêu đề nhóm: chế độ ô (E), nhãn bên trái (F), mật độ (H – dùng chung cấu hình Giao diện của cả ứng dụng).
import { Button, fill, Popover, PopoverContent, PopoverTrigger, RadioGroup, SegmentedControl, Stack, Switch, useMessages } from "@kb/ui";
import { SlidersHorizontal } from "lucide-react";
import { useAppearance } from "@/features/appearance/use-appearance";
import type { ViewMode } from "./compact-rules";
import { FORM_MESSAGES } from "./form.messages";
import { useViewPrefs } from "./view-prefs";

type Density = "compact" | "comfortable" | "spacious";

export function ViewOptions() {
  const { mode, labelsLeft, set } = useViewPrefs();
  const { appearance, setAppearance } = useAppearance();
  const t = useMessages(FORM_MESSAGES);
  const modes: { value: ViewMode; label: string; description: string }[] = [
    { value: "can-nhap", label: t.modeNeedTitle, description: t.modeNeedDesc },
    { value: "ap-dung", label: t.modeApplicableTitle, description: t.modeApplicableDesc },
    { value: "tat-ca", label: t.modeAllTitle, description: t.modeAllDesc },
  ];
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" variant="secondary" leftIcon={<SlidersHorizontal className="h-4 w-4" />}>
          {fill(t.viewButton, { mode: modes.find((m) => m.value === mode)?.label ?? "" })}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 max-w-full" showClose>
        <Stack gap="md">
          <RadioGroup label={t.fieldsShown} options={modes} value={mode} onChange={(m: ViewMode) => set({ mode: m })} />
          <Switch label={t.labelsLeft} description={t.labelsLeftDesc} checked={labelsLeft} onCheckedChange={(v) => set({ labelsLeft: v })} />
          <SegmentedControl<Density>
            label={t.density}
            value={appearance.density}
            onChange={(d) => setAppearance({ ...appearance, density: d })}
            options={[{ value: "compact", label: t.densityCompact }, { value: "comfortable", label: t.densityComfortable }, { value: "spacious", label: t.densitySpacious }]}
          />
          <p className="text-xs text-fg-subtle">{t.densityNote}</p>
        </Stack>
      </PopoverContent>
    </Popover>
  );
}
