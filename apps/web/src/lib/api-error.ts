import type { ReasonParams } from "@kb/contracts";

/**
 * Lỗi nghiệp vụ từ backend (hoặc mock). `code` cố định; `message` tiếng Việt sẵn dùng.
 * `reason` + `params`: mã lý do ổn định (@kb/contracts reason-codes) để giao diện dịch – xem `errorText` (lib/reason-codes.ts).
 */
export class ApiError extends Error {
  reason?: string;
  params?: ReasonParams;
  constructor(
    public code: string,
    message: string,
    public status = 400,
    extra?: { reason?: string | undefined; params?: ReasonParams | undefined },
  ) {
    super(message);
    this.name = "ApiError";
    if (extra?.reason) this.reason = extra.reason;
    if (extra?.params) this.params = extra.params;
  }
}
