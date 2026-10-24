/** 33030000 → 3303.00.00 (cách viết mã HS quen thuộc trên giao diện). */
export const formatHs = (code: string) => (/^\d{8}$/.test(code) ? `${code.slice(0, 4)}.${code.slice(4, 6)}.${code.slice(6)}` : code);
