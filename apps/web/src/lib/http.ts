// Lớp gọi backend: mọi hàm trong src/api/http/* đi qua đây. Mọi thất bại đều ném ApiError để màn hình hiện thông báo tiếng Việt.
import type { ZodType } from "zod";
import { fill, pickMessages } from "@kb/ui";
import { ApiError } from "./api-error";
import { ERROR_MESSAGES } from "./errors.messages";
import { getFormatLocale } from "./format";

const msg = () => pickMessages(ERROR_MESSAGES, getFormatLocale());

const BASE = "/api";

async function request<T>(method: string, path: string, init: RequestInit, schema?: ZodType<T>): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/${path}`, { ...init, method, credentials: "include" });
  } catch {
    throw new ApiError("NETWORK", msg().network, 0);
  }
  if (!res.ok) throw await toApiError(res);
  if (!hasJsonBody(res)) return undefined as T;
  const data: unknown = await res.json();
  if (!schema) return data as T;
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new ApiError("CONTRACT_MISMATCH", msg().contractMismatch, res.status);
  return parsed.data;
}

/** 204, body rỗng hoặc không phải JSON → coi như không có dữ liệu. */
function hasJsonBody(res: Response) {
  if (res.status === 204 || res.headers.get("content-length") === "0") return false;
  return (res.headers.get("content-type") ?? "").includes("application/json");
}

async function toApiError(res: Response): Promise<ApiError> {
  try {
    const body = (await res.json()) as { code?: string; message?: string };
    if (body && typeof body.code === "string") return new ApiError(body.code, body.message ?? body.code, res.status);
  } catch {
    /* body không phải JSON */
  }
  return new ApiError(`HTTP_${res.status}`, fill(msg().serverError, { status: res.status }), res.status);
}

const json = (body: unknown): RequestInit => ({ headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

export const apiGet = <T>(path: string, schema?: ZodType<T>) => request<T>("GET", path, {}, schema);
export const apiPost = <T>(path: string, body: unknown, schema?: ZodType<T>) => request<T>("POST", path, json(body), schema);
export const apiPut = <T>(path: string, body: unknown, schema?: ZodType<T>) => request<T>("PUT", path, json(body), schema);
export const apiPatch = <T>(path: string, body: unknown, schema?: ZodType<T>) => request<T>("PATCH", path, json(body), schema);
export const apiDelete = <T>(path: string, schema?: ZodType<T>) => request<T>("DELETE", path, {}, schema);
export const apiUpload = <T>(path: string, form: FormData, schema?: ZodType<T>) => request<T>("POST", path, { body: form }, schema);
