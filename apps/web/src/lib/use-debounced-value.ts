// Giá trị trễ `ms` sau lần đổi cuối – dùng cho ô tìm gọi server (không gửi một yêu cầu cho mỗi phím gõ).
import { useEffect, useState } from "react";

export function useDebouncedValue<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}
