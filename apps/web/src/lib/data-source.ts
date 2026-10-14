export type DataSource = "mock" | "http";

/** Mặc định mock để bản demo (Vercel, PM) chạy không cần backend. */
export function dataSource(): DataSource {
  return process.env.NEXT_PUBLIC_DATA_SOURCE === "http" ? "http" : "mock";
}

/** Chọn hiện thực theo nguồn dữ liệu; hai bên phải cùng chữ ký. */
export function pick<T>(mock: T, http: T): T {
  return dataSource() === "http" ? http : mock;
}
