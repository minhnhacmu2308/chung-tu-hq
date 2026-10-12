// Tiện ích màu sRGB + độ tương phản WCAG 2.x. Thuần, không phụ thuộc DOM.

export type Rgb = { r: number; g: number; b: number };

const HEX = /^#([0-9a-f]{6})$/i;

export function isHex(value: string): boolean {
  return HEX.test(value);
}

export function hexToRgb(hex: string): Rgb {
  const m = HEX.exec(hex);
  if (!m?.[1]) throw new Error(`Màu không hợp lệ: ${hex} (cần dạng #RRGGBB)`);
  const n = Number.parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const to = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`.toUpperCase();
}

/** Trộn màu `a` với màu `b` theo tỉ lệ `t` (0 = a, 1 = b). */
export function mix(a: string, b: string, t: number): string {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return rgbToHex({ r: x.r + (y.r - x.r) * t, g: x.g + (y.g - x.g) * t, b: x.b + (y.b - x.b) * t });
}

function channel(v: number): number {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Tỉ lệ tương phản WCAG (1–21). */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Trộn dần `color` về phía `toward` (bước 2%) cho tới khi tương phản với `against` ≥ `min`.
 * Trả về màu gốc nếu đã đạt.
 */
export function ensureContrast(color: string, against: string, min: number, toward: string): string {
  for (let t = 0; t <= 1.0001; t += 0.02) {
    const c = mix(color, toward, t);
    if (contrast(c, against) >= min) return c;
  }
  return toward;
}
