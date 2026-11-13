/** Mã nối: tiền tố + 6 chữ số (số lớn hơn 999999 giữ nguyên, không cắt). */
export const formatItemNo = (prefix: string, seq: number) => `${prefix}${String(seq).padStart(6, "0")}`;
