"use client";
// Nút "Hiển thị" ở dòng tiêu đề nhóm: chế độ ô (E), nhãn bên trái (F), mật độ (H – dùng chung cấu hình Giao diện của cả ứng dụng).
import { Button, Popover, PopoverContent, PopoverTrigger, RadioGroup, SegmentedControl, Stack, Switch } from "@kb/ui";
import { SlidersHorizontal } from "lucide-react";
import { useAppearance } from "@/features/appearance/use-appearance";
import type { ViewMode } from "./compact-rules";
import { useViewPrefs } from "./view-prefs";

const MODES: { value: ViewMode; label: string; description: string }[] = [
  { value: "can-nhap", label: "Ô cần nhập", description: "Ô bắt buộc, ô theo tình huống đang áp dụng và ô đã có dữ liệu" },
  { value: "ap-dung", label: "Ô đang áp dụng", description: "Mọi ô áp dụng cho tờ khai này" },
  { value: "tat-ca", label: "Tất cả", description: "Cả ô không áp dụng (hiện mờ kèm lý do) – để đối chiếu đủ ô" },
];
type Density = "compact" | "comfortable" | "spacious";

export function ViewOptions() {
  const { mode, labelsLeft, set } = useViewPrefs();
  const { appearance, setAppearance } = useAppearance();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" variant="secondary" leftIcon={<SlidersHorizontal className="h-4 w-4" />}>
          Hiển thị: {MODES.find((m) => m.value === mode)?.label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 max-w-full" showClose>
        <Stack gap="md">
          <RadioGroup label="Ô hiển thị" options={MODES} value={mode} onChange={(m: ViewMode) => set({ mode: m })} />
          <Switch label="Nhãn bên trái" description="Màn hình rộng: nhãn bên trái, ô bên phải – mỗi ô thấp hơn" checked={labelsLeft} onCheckedChange={(v) => set({ labelsLeft: v })} />
          <SegmentedControl<Density>
            label="Mật độ"
            value={appearance.density}
            onChange={(d) => setAppearance({ ...appearance, density: d })}
            options={[{ value: "compact", label: "Gọn" }, { value: "comfortable", label: "Vừa" }, { value: "spacious", label: "Rộng" }]}
          />
          <p className="text-xs text-fg-subtle">Mật độ áp dụng cho cả ứng dụng (giống mục Giao diện).</p>
        </Stack>
      </PopoverContent>
    </Popover>
  );
}
