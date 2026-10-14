/** Lỗi nghiệp vụ từ backend (hoặc mock). `code` cố định để UI dịch; `message` tiếng Việt sẵn dùng. */
export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
