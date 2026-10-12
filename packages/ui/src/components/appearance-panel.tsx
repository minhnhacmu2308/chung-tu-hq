import { useId } from "react";
import { cn } from "../lib/cn.js";
import { useMessages, useUiLocale, type Messages } from "../lib/i18n.js";
import { BRAND_PRESETS, DEFAULT_APPEARANCE, type Appearance, type OrgField } from "../theme/appearance.js";
import type { BrandAdjustment } from "../theme/brand-theme.js";
import { ColorSwatchPicker, SegmentedControl } from "./choice.js";

const KEYS = [
  "panel", "title", "reset", "locked",
  "language", "mode", "light", "dark", "system", "cursor", "on", "off", "description", "shown", "hidden",
  "backdrop", "flat", "aurora", "density", "compact", "comfortable", "spacious", "gray", "brand",
  "radius", "square", "default", "rounded", "fontSize", "small", "medium", "large", "font", "sfPro", "systemFont",
  "adjustLight", "adjustDark",
] as const;
type Key = (typeof KEYS)[number];

const MESSAGES = {
  vi: {
    panel: "Cấu hình giao diện", title: "Cấu hình", reset: "Đặt lại mặc định", locked: " (doanh nghiệp đã khóa)",
    language: "Ngôn ngữ", mode: "Giao diện", light: "Sáng", dark: "Tối", system: "Theo hệ thống",
    cursor: "Hiệu ứng con trỏ", on: "Bật", off: "Tắt", description: "Mô tả trang", shown: "Hiện", hidden: "Ẩn",
    backdrop: "Nền trang", flat: "Phẳng", aurora: "Aurora",
    density: "Mật độ", compact: "Gọn", comfortable: "Chuẩn", spacious: "Thoáng",
    gray: "Dải xám", brand: "Màu thương hiệu",
    radius: "Bo góc", square: "Vuông", default: "Mặc định", rounded: "Bo tròn",
    fontSize: "Cỡ chữ", small: "Nhỏ", medium: "Vừa", large: "Lớn",
    font: "Font chữ", sfPro: "SF Pro (máy Apple)", systemFont: "Font hệ thống",
    adjustLight: "Giao diện sáng: {from} → {to} (đủ tương phản {ratio}:1)",
    adjustDark: "Giao diện tối: {from} → {to} (đủ tương phản {ratio}:1)",
  },
  en: {
    panel: "Appearance settings", title: "Appearance", reset: "Reset to default", locked: " (locked by organization)",
    language: "Language", mode: "Theme", light: "Light", dark: "Dark", system: "System",
    cursor: "Cursor effect", on: "On", off: "Off", description: "Page description", shown: "Show", hidden: "Hide",
    backdrop: "Background", flat: "Flat", aurora: "Aurora",
    density: "Density", compact: "Compact", comfortable: "Default", spacious: "Spacious",
    gray: "Gray scale", brand: "Brand color",
    radius: "Corners", square: "Square", default: "Default", rounded: "Rounded",
    fontSize: "Font size", small: "Small", medium: "Medium", large: "Large",
    font: "Font", sfPro: "SF Pro (Apple devices)", systemFont: "System font",
    adjustLight: "Light theme: {from} → {to} (meets {ratio}:1 contrast)",
    adjustDark: "Dark theme: {from} → {to} (meets {ratio}:1 contrast)",
  },
} satisfies Messages<Key>;

export type AppearancePanelProps = {
  value: Appearance;
  onChange: (next: Appearance) => void;
  /** Trường doanh nghiệp đã khóa – hiển thị nhưng không cho đổi. */
  locked?: readonly OrgField[];
  /** Admin được nhập mã màu tự do. */
  allowCustomBrand?: boolean;
  /** Ghi chú khi màu bị tự chỉnh để đủ tương phản (từ appearanceCss().adjustments). */
  brandAdjustments?: readonly BrandAdjustment[];
  labels?: Partial<Record<Key, string>>;
  className?: string;
};

/** Bảng "Cấu hình giao diện". Không tự lưu – gọi onChange, nơi dùng tự lưu và áp dụng. */
export function AppearancePanel({
  value,
  onChange,
  locked = [],
  allowCustomBrand = false,
  brandAdjustments = [],
  labels,
  className,
}: AppearancePanelProps) {
  const t = useMessages(MESSAGES, labels);
  const locale = useUiLocale();
  const swatches = BRAND_PRESETS.map((p) => ({ id: p.id, hex: p.hex, label: locale === "en" ? p.labelEn : p.label }));
  const set = <K extends keyof Appearance>(key: K) => (v: Appearance[K]) => onChange({ ...value, [key]: v });
  const isLocked = (f: OrgField) => locked.includes(f);
  const fontName = useId();
  const withLock = (label: string, f: OrgField) => (
    <>
      {label}
      {isLocked(f) && <span className="text-xs text-fg-subtle">{t.locked}</span>}
    </>
  );
  const fonts: { value: Appearance["font"]; label: string }[] = [
    { value: "be-vietnam-pro", label: "Be Vietnam Pro" },
    { value: "geist", label: "Geist" },
    { value: "inter", label: "Inter" },
    { value: "roboto", label: "Roboto" },
    { value: "sf-pro", label: t.sfPro },
    { value: "system", label: t.systemFont },
  ];

  return (
    <section aria-label={t.panel} className={cn("flex w-full max-w-sm flex-col gap-4 text-fg", className)}>
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">{t.title}</h2>
        <button
          type="button"
          className="rounded-sm text-sm text-fg-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          onClick={() =>
            onChange({
              ...DEFAULT_APPEARANCE,
              // Trường bị khóa giữ nguyên giá trị doanh nghiệp
              ...Object.fromEntries(locked.map((f) => [f, value[f]])),
            })
          }
        >
          {t.reset}
        </button>
      </div>

      <SegmentedControl label={t.language} value={value.locale} onChange={set("locale")}
        options={[{ value: "vi", label: "VI" }, { value: "en", label: "EN" }]} />
      <SegmentedControl label={t.mode} value={value.mode} onChange={set("mode")}
        options={[{ value: "light", label: t.light }, { value: "dark", label: t.dark }, { value: "system", label: t.system }]} />
      <SegmentedControl label={t.cursor} value={value.cursorEffect ? "on" : "off"} onChange={(v) => set("cursorEffect")(v === "on")}
        options={[{ value: "on", label: t.on }, { value: "off", label: t.off }]} />
      <SegmentedControl label={t.description} value={value.showPageDescription ? "shown" : "hidden"} onChange={(v) => set("showPageDescription")(v === "shown")}
        options={[{ value: "shown", label: t.shown }, { value: "hidden", label: t.hidden }]} />
      <SegmentedControl label={withLock(t.backdrop, "backdrop")} value={value.backdrop} onChange={set("backdrop")} disabled={isLocked("backdrop")}
        options={[{ value: "flat", label: t.flat }, { value: "aurora", label: t.aurora }]} />
      <SegmentedControl label={t.density} value={value.density} onChange={set("density")}
        options={[{ value: "compact", label: t.compact }, { value: "comfortable", label: t.comfortable }, { value: "spacious", label: t.spacious }]} />
      <SegmentedControl label={withLock(t.gray, "gray")} value={value.gray} onChange={set("gray")} disabled={isLocked("gray")}
        options={[{ value: "slate", label: "Slate" }, { value: "gray", label: "Gray" }]} />

      <ColorSwatchPicker
        label={withLock(t.brand, "brand")}
        value={value.brand}
        onChange={set("brand")}
        swatches={swatches}
        allowCustom={allowCustomBrand}
        disabled={isLocked("brand")}
      />
      {brandAdjustments.length > 0 && (
        <ul className="-mt-2 flex flex-col gap-0.5 text-xs text-fg-subtle">
          {brandAdjustments.map((a) => (
            <li key={a.mode}>
              {(a.mode === "light" ? t.adjustLight : t.adjustDark)
                .replace("{from}", a.from)
                .replace("{to}", a.to)
                .replace("{ratio}", String(a.minContrast))}
            </li>
          ))}
        </ul>
      )}

      <SegmentedControl label={withLock(t.radius, "radius")} value={value.radius} onChange={set("radius")} disabled={isLocked("radius")}
        options={[{ value: "square", label: t.square }, { value: "default", label: t.default }, { value: "rounded", label: t.rounded }]} />
      <SegmentedControl label={t.fontSize} value={value.fontSize} onChange={set("fontSize")}
        options={[{ value: "sm", label: t.small }, { value: "md", label: t.medium }, { value: "lg", label: t.large }]} />

      <fieldset disabled={isLocked("font")} className="flex flex-col gap-2 disabled:opacity-60">
        <legend className="mb-2 text-sm text-fg">{withLock(t.font, "font")}</legend>
        {fonts.map((f) => (
          <label
            key={f.value}
            className={cn(
              "cursor-pointer rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg-muted",
              "has-[:checked]:border-primary has-[:checked]:bg-primary-subtle has-[:checked]:text-primary-subtle-fg",
              "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-focus",
            )}
          >
            <input type="radio" className="sr-only" name={fontName} value={f.value} checked={value.font === f.value} onChange={() => set("font")(f.value)} />
            {f.label}
          </label>
        ))}
      </fieldset>
    </section>
  );
}
