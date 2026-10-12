// Dải xám cố định. PHẢI trùng với khối --kb-gray-* trong styles/tokens.css (có test kiểm tra).
export const GRAY_SCALES = {
  slate: {
    50: "#F8FAFC", 100: "#F1F5F9", 200: "#E2E8F0", 300: "#CBD5E1", 400: "#94A3B8", 500: "#64748B",
    600: "#475569", 700: "#334155", 800: "#1E293B", 900: "#0F172A", 950: "#020617",
  },
  gray: {
    50: "#FAFAFA", 100: "#F4F4F5", 200: "#E4E4E7", 300: "#D4D4D8", 400: "#A1A1AA", 500: "#71717A",
    600: "#52525B", 700: "#3F3F46", 800: "#27272A", 900: "#18181B", 950: "#09090B",
  },
} as const;

export type GrayScale = keyof typeof GRAY_SCALES;

/** Mặt nền (surface) nơi đặt chữ/nút, theo chế độ – dùng để tính tương phản màu thương hiệu. */
export const SURFACES = {
  light: ["#FFFFFF"],
  dark: Object.values(GRAY_SCALES).map((s) => s[900]),
} as const;
