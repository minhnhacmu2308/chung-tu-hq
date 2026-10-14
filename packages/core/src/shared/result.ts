import type { DomainError } from "./errors.js";

export type Ok<T> = { ok: true; value: T };
export type Err<E> = { ok: false; error: E };
export type Result<T, E = DomainError> = Ok<T> | Err<E>;

export const ok = <T>(value: T): Ok<T> => ({ ok: true, value });
export const err = <E>(error: E): Err<E> => ({ ok: false, error });
export const isOk = <T, E>(r: Result<T, E>): r is Ok<T> => r.ok;

/** Chỉ dùng trong test hoặc script. */
export function unwrap<T, E>(r: Result<T, E>): T {
  if (r.ok) return r.value;
  throw new Error(`Result err: ${JSON.stringify(r.error)}`);
}

/** Chỉ dùng trong test: mã lỗi của Result (undefined nếu ok). */
export function errCode<T>(r: Result<T>): string | undefined {
  return r.ok ? undefined : r.error.code;
}
