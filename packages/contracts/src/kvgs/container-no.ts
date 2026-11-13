/** Chuẩn hóa số container từ OCR/nhập tay: bỏ khoảng trắng, `-`, `.`; viết hoa. */
export function normalizeContainerNo(raw: string): string {
  return raw.replace(/[\s.-]/g, "").toUpperCase();
}

/** Giá trị chữ cái ISO 6346: A=10 … Z=38, bỏ các bội số của 11 (11, 22, 33). */
function letterValue(ch: string): number {
  let v = 10;
  for (let c = 65; c < ch.charCodeAt(0); c++) {
    v++;
    if (v % 11 === 0) v++;
  }
  return v;
}

/** 4 chữ (chữ thứ 4 ∈ U/J/Z) + 6 số + chữ số kiểm ISO 6346. Đầu vào đã chuẩn hóa. */
export function isValidContainerNo(no: string): boolean {
  if (!/^[A-Z]{3}[UJZ]\d{7}$/.test(no)) return false;
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const ch = no.charAt(i);
    const v = i < 4 ? letterValue(ch) : Number(ch);
    sum += v * 2 ** i;
  }
  return (sum % 11) % 10 === Number(no.charAt(10));
}
