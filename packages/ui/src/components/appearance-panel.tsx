import { ImagePlus, MousePointer2, Trash2 } from "lucide-react";
import { useId, useRef, useState, type ReactNode } from "react";
import { cn } from "../lib/cn.js";
import { useMessages, useUiLocale, type Messages } from "../lib/i18n.js";
import { ACCENT_PRESETS, BRAND_PRESETS, DEFAULT_APPEARANCE, MENU_IMAGE_MAX_CHARS, type Appearance, type OrgField } from "../theme/appearance.js";
import type { BrandAdjustment } from "../theme/brand-theme.js";
import { Button } from "./button.js";
import { ColorSwatchPicker } from "./choice.js";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./overlay.js";

const KEYS = [
  "panel", "title", "reset", "locked",
  "language", "mode", "light", "dark", "system", "cursor", "on", "off", "description", "shown", "hidden",
  "backdrop", "flat", "aurora", "density", "compact", "comfortable", "spacious", "gray", "brand",
  "radius", "square", "default", "rounded", "fontSize", "small", "medium", "large", "font", "sfPro", "systemFont",
  "adjustLight", "adjustDark",
  "menuPosition", "menuLeft", "menuTop", "menuRight",
  "tabs", "tabGeneral", "tabLayout", "tabColor",
  "accent", "gradient", "mesh",
  "menuStyle", "menuDefault", "menuTint", "menuBold", "menuImage",
  "pattern", "waves", "dots", "grid", "custom", "upload", "replace", "remove", "imageHint", "imageInvalid",
] as const;
type Key = (typeof KEYS)[number];

const MESSAGES = {
  vi: {
    panel: "Cấu hình giao diện", title: "Cấu hình", reset: "Đặt lại mặc định", locked: " (doanh nghiệp đã khóa)",
    language: "Ngôn ngữ", mode: "Giao diện", light: "Sáng", dark: "Tối", system: "Theo hệ thống",
    cursor: "Hiệu ứng con trỏ", on: "Bật", off: "Tắt", description: "Mô tả trang", shown: "Hiện", hidden: "Ẩn",
    backdrop: "Nền trang", flat: "Phẳng", aurora: "Aurora",
    density: "Mật độ", compact: "Gọn", comfortable: "Chuẩn", spacious: "Thoáng",
    gray: "Dải xám", brand: "Màu chính", accent: "Màu phụ", gradient: "Chuyển màu", mesh: "Loang màu",
    radius: "Bo góc", square: "Vuông", default: "Mặc định", rounded: "Bo tròn",
    fontSize: "Cỡ chữ", small: "Nhỏ", medium: "Vừa", large: "Lớn",
    font: "Font chữ", sfPro: "SF Pro (máy Apple)", systemFont: "Font hệ thống",
    adjustLight: "Giao diện sáng: {from} → {to} (đủ tương phản {ratio}:1)",
    adjustDark: "Giao diện tối: {from} → {to} (đủ tương phản {ratio}:1)",
    menuPosition: "Vị trí menu", menuLeft: "Bên trái", menuTop: "Phía trên", menuRight: "Bên phải",
    tabs: "Nhóm cấu hình", tabGeneral: "Chung", tabLayout: "Bố cục & chữ", tabColor: "Màu sắc",
    menuStyle: "Nền menu", menuDefault: "Mặc định", menuTint: "Pha nhạt", menuBold: "Pha đậm", menuImage: "Hình nền",
    pattern: "Hình nền menu", waves: "Sóng màu", dots: "Chấm bi", grid: "Ô lưới", custom: "Ảnh của bạn",
    upload: "Tải ảnh lên", replace: "Đổi ảnh", remove: "Xóa ảnh",
    imageHint: "PNG, JPG hoặc WebP. Ảnh được thu nhỏ và chỉ lưu trên trình duyệt này.",
    imageInvalid: "Không đọc được ảnh này. Chọn ảnh PNG, JPG hoặc WebP khác.",
  },
  en: {
    panel: "Appearance settings", title: "Appearance", reset: "Reset to default", locked: " (locked by organization)",
    language: "Language", mode: "Theme", light: "Light", dark: "Dark", system: "System",
    cursor: "Cursor effect", on: "On", off: "Off", description: "Page description", shown: "Show", hidden: "Hide",
    backdrop: "Background", flat: "Flat", aurora: "Aurora",
    density: "Density", compact: "Compact", comfortable: "Default", spacious: "Spacious",
    gray: "Gray scale", brand: "Primary color", accent: "Secondary color", gradient: "Gradient", mesh: "Mesh",
    radius: "Corners", square: "Square", default: "Default", rounded: "Rounded",
    fontSize: "Font size", small: "Small", medium: "Medium", large: "Large",
    font: "Font", sfPro: "SF Pro (Apple devices)", systemFont: "System font",
    adjustLight: "Light theme: {from} → {to} (meets {ratio}:1 contrast)",
    adjustDark: "Dark theme: {from} → {to} (meets {ratio}:1 contrast)",
    menuPosition: "Menu position", menuLeft: "Left", menuTop: "Top", menuRight: "Right",
    tabs: "Setting groups", tabGeneral: "General", tabLayout: "Layout & type", tabColor: "Colors",
    menuStyle: "Menu background", menuDefault: "Default", menuTint: "Soft blend", menuBold: "Bold blend", menuImage: "Image",
    pattern: "Menu image", waves: "Waves", dots: "Dots", grid: "Grid", custom: "Your image",
    upload: "Upload image", replace: "Change image", remove: "Remove image",
    imageHint: "PNG, JPG or WebP. The image is resized and stored only in this browser.",
    imageInvalid: "This image could not be read. Choose another PNG, JPG or WebP image.",
  },
  zh: {
    panel: "外观设置", title: "外观", reset: "恢复默认", locked: "（企业已锁定）",
    language: "语言", mode: "主题", light: "浅色", dark: "深色", system: "跟随系统",
    cursor: "光标效果", on: "开", off: "关", description: "页面说明", shown: "显示", hidden: "隐藏",
    backdrop: "页面背景", flat: "纯色", aurora: "极光",
    density: "密度", compact: "紧凑", comfortable: "标准", spacious: "宽松",
    gray: "灰阶", brand: "主色", accent: "辅助色", gradient: "渐变", mesh: "晕染",
    radius: "圆角", square: "直角", default: "默认", rounded: "圆润",
    fontSize: "字号", small: "小", medium: "中", large: "大",
    font: "字体", sfPro: "SF Pro（Apple 设备）", systemFont: "系统字体",
    adjustLight: "浅色主题：{from} → {to}（满足 {ratio}:1 对比度）",
    adjustDark: "深色主题：{from} → {to}（满足 {ratio}:1 对比度）",
    menuPosition: "菜单位置", menuLeft: "左侧", menuTop: "顶部", menuRight: "右侧",
    tabs: "设置分组", tabGeneral: "通用", tabLayout: "布局与文字", tabColor: "颜色",
    menuStyle: "菜单背景", menuDefault: "默认", menuTint: "浅色混合", menuBold: "深色混合", menuImage: "背景图",
    pattern: "菜单背景图", waves: "波纹", dots: "圆点", grid: "网格", custom: "自定义图片",
    upload: "上传图片", replace: "更换图片", remove: "移除图片",
    imageHint: "支持 PNG、JPG、WebP。图片会被缩小，仅保存在此浏览器中。",
    imageInvalid: "无法读取该图片，请换一张 PNG、JPG 或 WebP 图片。",
  },
} satisfies Messages<Key>;

/* ---------------- Hình mô phỏng cho từng tùy chọn ---------------- */
// Chỉ để nhìn (aria-hidden). Kích thước/bo góc dùng số cố định để hình KHÔNG đổi theo chính tùy chọn đang chỉnh.

const FRAME = "flex h-12 w-full overflow-hidden rounded-sm border border-border bg-bg";

/** Trang thu nhỏ: dòng tiêu đề + một thẻ. Màu lấy từ token nên theo `color-scheme` của phần tử bao ngoài. */
function MiniPage({ className }: { className?: string }) {
  return (
    <span className={cn("flex h-full min-w-0 flex-1 flex-col gap-1 bg-bg p-1.5", className)}>
      <span className="h-1.5 w-1/2 shrink-0 rounded-full bg-fg-muted" />
      <span className="flex-1 rounded-sm border border-border bg-surface" />
    </span>
  );
}

/** Bố cục trang: thanh menu (màu thương hiệu) ở trái / trên / phải, phần còn lại là nội dung. */
function MenuPositionPreview({ position }: { position: Appearance["menuPosition"] }) {
  const top = position === "top";
  return (
    <span className={cn(FRAME, "gap-1 p-1", top ? "flex-col" : position === "right" && "flex-row-reverse")}>
      <span className={cn("flex shrink-0 gap-0.5 rounded-sm bg-primary p-0.5", top ? "h-2.5 w-full items-center" : "w-1/4 flex-col")}>
        {[0, 1, 2].map((i) => (
          <span key={i} className={cn("rounded-full bg-primary-fg opacity-70", top ? "h-1 w-3" : "h-1 w-full")} />
        ))}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="h-1.5 w-1/2 rounded-full bg-border-strong" />
        <span className="flex flex-1 gap-1">
          <span className="flex-1 rounded-sm bg-surface shadow-sm" />
          <span className="flex-1 rounded-sm bg-surface shadow-sm" />
        </span>
      </span>
    </span>
  );
}

/** Sáng / Tối / Theo hệ thống (nửa sáng nửa tối). Ép `color-scheme` tại chỗ để token tự ra đúng màu. */
function ModePreview({ mode }: { mode: Appearance["mode"] }) {
  return (
    <span className={FRAME}>
      {mode !== "dark" && <MiniPage className="[color-scheme:light]" />}
      {mode !== "light" && <MiniPage className="[color-scheme:dark]" />}
    </span>
  );
}

/** Nền trang: CSS dùng chung với nền thật (tokens.css, [data-backdrop-preview]) nên hình khớp đúng màu chính + phụ. */
function BackdropPreview({ backdrop }: { backdrop: Appearance["backdrop"] }) {
  return (
    <span data-backdrop-preview={backdrop} className={FRAME}>
      <MiniPage className="bg-transparent" />
    </span>
  );
}

/** Nền menu: cột menu thu nhỏ dùng đúng CSS của menu thật ([data-menu-preview]) + vùng nội dung. */
function MenuStylePreview({ style, pattern }: { style: Appearance["menuStyle"]; pattern: Appearance["menuPattern"] }) {
  return (
    <span className={cn(FRAME, "gap-1 p-1")}>
      <span
        data-menu-preview={style}
        data-pattern={pattern}
        className="flex w-2/5 shrink-0 flex-col gap-1 rounded-sm border border-border bg-surface p-1"
      >
        <span className="h-1.5 w-3 rounded-full bg-primary" />
        {[0, 1, 2].map((i) => (
          <span key={i} className={cn("h-1 rounded-full", i === 0 ? "w-full bg-primary-subtle" : "w-4/5 bg-fg-muted opacity-70")} />
        ))}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="h-1.5 w-1/2 rounded-full bg-border-strong" />
        <span className="flex-1 rounded-sm bg-surface shadow-sm" />
      </span>
    </span>
  );
}

const DENSITY_GAP = { compact: "gap-0.5", comfortable: "gap-1.5", spacious: "gap-2.5" } as const;
function DensityPreview({ density }: { density: Appearance["density"] }) {
  return (
    <span className={cn(FRAME, "flex-col justify-center px-2", DENSITY_GAP[density])}>
      {["w-full", "w-4/5", "w-full"].map((w, i) => (
        <span key={i} className={cn("h-1.5 shrink-0 rounded-full bg-border-strong", w)} />
      ))}
    </span>
  );
}

/** Dải xám: 5 bậc của đúng bảng xám đó (đặt `data-gray-preview` để token xám trong hình không theo cấu hình hiện tại). */
function GrayPreview({ gray }: { gray: Appearance["gray"] }) {
  return (
    <span data-gray-preview={gray} className={cn(FRAME, "[color-scheme:light]")}>
      {["bg-surface-muted", "bg-border", "bg-border-strong", "bg-fg-muted", "bg-fg"].map((c) => (
        <span key={c} className={cn("flex-1", c)} />
      ))}
    </span>
  );
}

const RADIUS_CORNER = { square: "rounded-tl-none", default: "rounded-tl-[8px]", rounded: "rounded-tl-[18px]" } as const;
function RadiusPreview({ radius }: { radius: Appearance["radius"] }) {
  return (
    <span className={cn(FRAME, "items-end justify-end")}>
      <span className={cn("h-9 w-3/4 border-l-2 border-t-2 border-primary bg-primary-subtle", RADIUS_CORNER[radius])} />
    </span>
  );
}

const FONT_SIZE = { sm: "text-[12px]", md: "text-[15px]", lg: "text-[19px]" } as const;
function TextPreview({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn(FRAME, "items-center justify-center font-semibold text-fg", className)}>{children}</span>;
}

function CursorPreview({ on }: { on: boolean }) {
  return (
    <span className={cn(FRAME, "relative items-center justify-center")}>
      {on && <span className="absolute h-7 w-7 rounded-full bg-primary opacity-25" />}
      <MousePointer2 className="relative h-4 w-4 text-fg" />
    </span>
  );
}

function DescriptionPreview({ shown }: { shown: boolean }) {
  return (
    <span className={cn(FRAME, "flex-col justify-center gap-1.5 px-2")}>
      <span className="h-2 w-2/3 rounded-full bg-fg-muted" />
      {shown && <span className="h-1 w-full rounded-full bg-border-strong" />}
    </span>
  );
}

const CHOICE_COLS = { 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-4" } as const;

type PreviewOption<T extends string> = { value: T; label: string; preview: ReactNode };

/** Nhóm radio dạng thẻ: mỗi lựa chọn có hình mô phỏng phía trên nhãn để người dùng hình dung trước khi chọn. */
function PreviewChoice<T extends string>({
  label,
  value,
  onChange,
  options,
  disabled = false,
}: {
  label: ReactNode;
  value: T;
  onChange: (v: T) => void;
  options: readonly PreviewOption<T>[];
  disabled?: boolean;
}) {
  const name = useId();
  return (
    <fieldset disabled={disabled} className="flex flex-col gap-2 disabled:opacity-60">
      <legend className="mb-2 text-sm text-fg">{label}</legend>
      <div className={cn("grid gap-2", CHOICE_COLS[options.length === 2 ? 2 : options.length >= 4 ? 4 : 3])}>
        {options.map((o) => (
          <label
            key={o.value}
            className={cn(
              "flex cursor-pointer flex-col items-center gap-1.5 rounded-md border border-border bg-surface p-2 text-center text-xs text-fg-muted",
              "hover:border-border-strong has-[:checked]:border-primary has-[:checked]:bg-primary-subtle has-[:checked]:font-medium has-[:checked]:text-primary-subtle-fg",
              "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-focus has-[:disabled]:cursor-not-allowed",
            )}
          >
            <input type="radio" className="sr-only" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} />
            <span aria-hidden="true" className="w-full">{o.preview}</span>
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * Thu nhỏ ảnh người dùng chọn thành JPEG ≤ 640×1280 (đủ cho cột menu) để lưu được trong trình duyệt.
 * Trả null nếu không đọc được ảnh hoặc vẫn quá lớn sau khi nén.
 */
async function shrinkImage(file: File): Promise<string | null> {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return null;
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    const scale = Math.min(1, 640 / img.naturalWidth, 1280 / img.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    for (const q of [0.82, 0.65, 0.5]) {
      const data = canvas.toDataURL("image/jpeg", q);
      if (data.startsWith("data:image/jpeg;base64,") && data.length <= MENU_IMAGE_MAX_CHARS) return data;
    }
    return null;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Chọn hình nền menu: 3 họa tiết + ảnh của bạn (tải lên / đổi / xóa). */
function MenuImagePicker({ value, onChange, t }: { value: Appearance; onChange: (next: Appearance) => void; t: Record<Key, string> }) {
  const file = useRef<HTMLInputElement>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const hintId = useId();
  const pick = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    const data = await shrinkImage(f);
    setBusy(false);
    setError(!data);
    if (data) onChange({ ...value, menuPattern: "custom", menuImage: data });
  };
  return (
    <div className="flex flex-col gap-2">
      <PreviewChoice
        label={t.pattern}
        value={value.menuPattern}
        onChange={(p) => onChange({ ...value, menuPattern: p })}
        options={(["waves", "dots", "grid", "custom"] as const).map((p) => ({
          value: p,
          label: t[p],
          preview: <MenuStylePreview style="image" pattern={p === "custom" && !value.menuImage ? "waves" : p} />,
        }))}
      />
      {value.menuPattern === "custom" && (
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" size="sm" loading={busy} leftIcon={<ImagePlus aria-hidden="true" className="h-4 w-4" />} aria-describedby={hintId} onClick={() => file.current?.click()}>
              {value.menuImage ? t.replace : t.upload}
            </Button>
            {value.menuImage && (
              <Button type="button" variant="ghost" size="sm" leftIcon={<Trash2 aria-hidden="true" className="h-4 w-4" />} onClick={() => onChange({ ...value, menuImage: null })}>
                {t.remove}
              </Button>
            )}
          </div>
          <input
            ref={file}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => {
              void pick(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <p id={hintId} className="text-xs text-fg-subtle">{t.imageHint}</p>
          {error && <p role="alert" className="text-xs text-danger">{t.imageInvalid}</p>}
        </div>
      )}
    </div>
  );
}

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
  /** Nhóm mở sẵn khi hiện bảng (mặc định "general"). */
  defaultTab?: "general" | "layout" | "color";
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
  defaultTab = "general",
  className,
}: AppearancePanelProps) {
  const t = useMessages(MESSAGES, labels);
  const locale = useUiLocale();
  const presetLabel = (p: { label: string; labelEn: string; labelZh: string }) => (locale === "en" ? p.labelEn : locale === "zh" ? p.labelZh : p.label);
  const swatches = BRAND_PRESETS.map((p) => ({ id: p.id, hex: p.hex, label: presetLabel(p) }));
  const accentSwatches = ACCENT_PRESETS.map((p) => ({ id: p.id, hex: p.hex, label: presetLabel(p) }));
  const set = <K extends keyof Appearance>(key: K) => (v: Appearance[K]) => onChange({ ...value, [key]: v });
  const isLocked = (f: OrgField) => locked.includes(f);
  const fontName = useId();
  // Mỗi font hiện bằng chính font đó (stack giống tokens.css: webfont app đã tải → font cài trên máy → hệ thống).
  const FONT_STACK: Record<Appearance["font"], string> = {
    "be-vietnam-pro": 'var(--kb-webfont-be-vietnam-pro, "Be Vietnam Pro"), system-ui, sans-serif',
    geist: 'var(--kb-webfont-geist, "Geist"), system-ui, sans-serif',
    inter: 'var(--kb-webfont-inter, "Inter"), system-ui, sans-serif',
    roboto: 'var(--kb-webfont-roboto, "Roboto"), system-ui, sans-serif',
    "sf-pro": '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif',
    system: "system-ui, sans-serif",
  };
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
    // @container: bảng tự dãn theo chỗ đặt – popup/panel hẹp xếp 1 cột, thẻ rộng (trang Thiết lập) xếp 2 cột cho cân.
    <section aria-label={t.panel} className={cn("@container flex w-full flex-col gap-4 text-fg", className)}>
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

      {/* Chia 3 nhóm để bảng không dài lê thê. Cả 3 nhóm luôn nằm trong DOM (forceMount), nhóm không chọn chỉ bị ẩn. */}
      <Tabs defaultValue={defaultTab}>
        <TabsList aria-label={t.tabs}>
          <TabsTrigger value="general">{t.tabGeneral}</TabsTrigger>
          <TabsTrigger value="layout">{t.tabLayout}</TabsTrigger>
          <TabsTrigger value="color">{t.tabColor}</TabsTrigger>
        </TabsList>
        <TabsContent value="general" forceMount className="grid items-start gap-4 cq-lg:grid-cols-2 cq-lg:gap-x-8 data-[state=inactive]:hidden">
      <PreviewChoice label={t.language} value={value.locale} onChange={set("locale")}
        options={[
          // Tên ngôn ngữ luôn viết bằng chính ngôn ngữ đó (không dịch) để người không đọc được ngôn ngữ hiện tại vẫn tìm thấy.
          { value: "vi", label: "Tiếng Việt", preview: <TextPreview className="text-xs">Xin chào</TextPreview> },
          { value: "en", label: "English", preview: <TextPreview className="text-xs">Hello</TextPreview> },
          { value: "zh", label: "中文", preview: <TextPreview className="text-xs">你好</TextPreview> },
        ]} />
      <PreviewChoice label={t.mode} value={value.mode} onChange={set("mode")}
        options={(["light", "dark", "system"] as const).map((m) => ({ value: m, label: t[m], preview: <ModePreview mode={m} /> }))} />
      <PreviewChoice label={t.menuPosition} value={value.menuPosition} onChange={set("menuPosition")}
        options={[
          { value: "left", label: t.menuLeft, preview: <MenuPositionPreview position="left" /> },
          { value: "top", label: t.menuTop, preview: <MenuPositionPreview position="top" /> },
          { value: "right", label: t.menuRight, preview: <MenuPositionPreview position="right" /> },
        ]} />
      <PreviewChoice label={t.description} value={value.showPageDescription ? "shown" : "hidden"} onChange={(v) => set("showPageDescription")(v === "shown")}
        options={[
          { value: "shown", label: t.shown, preview: <DescriptionPreview shown /> },
          { value: "hidden", label: t.hidden, preview: <DescriptionPreview shown={false} /> },
        ]} />
      <PreviewChoice label={t.cursor} value={value.cursorEffect ? "on" : "off"} onChange={(v) => set("cursorEffect")(v === "on")}
        options={[
          { value: "on", label: t.on, preview: <CursorPreview on /> },
          { value: "off", label: t.off, preview: <CursorPreview on={false} /> },
        ]} />
        </TabsContent>
        <TabsContent value="layout" forceMount className="grid items-start gap-4 cq-lg:grid-cols-2 cq-lg:gap-x-8 data-[state=inactive]:hidden">
      <PreviewChoice label={t.density} value={value.density} onChange={set("density")}
        options={(["compact", "comfortable", "spacious"] as const).map((d) => ({ value: d, label: t[d], preview: <DensityPreview density={d} /> }))} />
      <PreviewChoice label={t.fontSize} value={value.fontSize} onChange={set("fontSize")}
        options={[
          { value: "sm", label: t.small, preview: <TextPreview className={FONT_SIZE.sm}>Aa</TextPreview> },
          { value: "md", label: t.medium, preview: <TextPreview className={FONT_SIZE.md}>Aa</TextPreview> },
          { value: "lg", label: t.large, preview: <TextPreview className={FONT_SIZE.lg}>Aa</TextPreview> },
        ]} />
      <PreviewChoice label={withLock(t.radius, "radius")} value={value.radius} onChange={set("radius")} disabled={isLocked("radius")}
        options={(["square", "default", "rounded"] as const).map((r) => ({ value: r, label: t[r], preview: <RadiusPreview radius={r} /> }))} />
      <fieldset disabled={isLocked("font")} className="flex flex-col gap-2 disabled:opacity-60">
        <legend className="mb-2 text-sm text-fg">{withLock(t.font, "font")}</legend>
        {fonts.map((f) => (
          <label
            key={f.value}
            className={cn(
              "flex cursor-pointer items-center justify-between gap-3 rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg-muted",
              "has-[:checked]:border-primary has-[:checked]:bg-primary-subtle has-[:checked]:text-primary-subtle-fg",
              "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-focus",
            )}
          >
            <input type="radio" className="sr-only" name={fontName} value={f.value} checked={value.font === f.value} onChange={() => set("font")(f.value)} />
            <span style={{ fontFamily: FONT_STACK[f.value] }}>{f.label}</span>
            <span aria-hidden="true" className="text-base text-fg" style={{ fontFamily: FONT_STACK[f.value] }}>Aa Ăă 123</span>
          </label>
        ))}
      </fieldset>
        </TabsContent>
        <TabsContent value="color" forceMount className="grid items-start gap-4 cq-lg:grid-cols-2 cq-lg:gap-x-8 data-[state=inactive]:hidden">
      {/* Màu chính + ghi chú điều chỉnh tương phản là một ô lưới. */}
      <div className="flex flex-col gap-2">
      <ColorSwatchPicker
        label={withLock(t.brand, "brand")}
        value={value.brand}
        onChange={set("brand")}
        swatches={swatches}
        allowCustom={allowCustomBrand}
        disabled={isLocked("brand")}
      />
      {brandAdjustments.length > 0 && (
        <ul className="flex flex-col gap-0.5 text-xs text-fg-subtle">
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
      </div>

      {/* Màu phụ chỉ để pha nền (không dùng cho chữ) nên ai cũng được nhập mã màu riêng. */}
      <ColorSwatchPicker
        label={withLock(t.accent, "accent")}
        value={value.accent}
        onChange={set("accent")}
        swatches={accentSwatches}
        allowCustom
        disabled={isLocked("accent")}
      />
      <PreviewChoice label={withLock(t.backdrop, "backdrop")} value={value.backdrop} onChange={set("backdrop")} disabled={isLocked("backdrop")}
        options={(["flat", "aurora", "gradient", "mesh"] as const).map((b) => ({ value: b, label: t[b], preview: <BackdropPreview backdrop={b} /> }))} />
      <PreviewChoice label={t.menuStyle} value={value.menuStyle} onChange={set("menuStyle")}
        options={[
          { value: "default", label: t.menuDefault, preview: <MenuStylePreview style="default" pattern={value.menuPattern} /> },
          { value: "tint", label: t.menuTint, preview: <MenuStylePreview style="tint" pattern={value.menuPattern} /> },
          { value: "bold", label: t.menuBold, preview: <MenuStylePreview style="bold" pattern={value.menuPattern} /> },
          { value: "image", label: t.menuImage, preview: <MenuStylePreview style="image" pattern={value.menuPattern === "custom" && !value.menuImage ? "waves" : value.menuPattern} /> },
        ]} />
      {value.menuStyle === "image" && <MenuImagePicker value={value} onChange={onChange} t={t} />}
      <PreviewChoice label={withLock(t.gray, "gray")} value={value.gray} onChange={set("gray")} disabled={isLocked("gray")}
        options={[
          { value: "slate", label: "Slate", preview: <GrayPreview gray="slate" /> },
          { value: "gray", label: "Gray", preview: <GrayPreview gray="gray" /> },
        ]} />
        </TabsContent>
      </Tabs>
    </section>
  );
}
