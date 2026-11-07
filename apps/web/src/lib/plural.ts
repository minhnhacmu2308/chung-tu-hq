// Số ít / số nhiều cho bộ nhãn có `{n}` (tiếng Anh: "1 credit" / "2 credits"). Bộ nhãn khai thêm khóa `<key>One` ở cả 3 ngôn ngữ
// (vi/zh dùng cùng câu với khóa gốc) – thiếu khóa thì dùng khóa gốc.

/** Câu của khóa `key` theo số `n`: |n| = 1 → `<key>One` (nếu có), còn lại → `key`. */
export function byCount<T extends Record<string, string>>(t: T, key: Extract<keyof T, string>, n: number): string {
  const one = (t as Record<string, string>)[`${key}One`];
  return Math.abs(n) === 1 && one ? one : (t[key] as string);
}
