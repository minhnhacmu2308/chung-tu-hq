// Wrapper cho route handler: parse input, map lỗi nghiệp vụ → HTTP, không lộ chi tiết lỗi hạ tầng.
import { createLogger, type DomainError, type DomainErrorCode, type Logger, type Result } from "@kb/core/shared";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodType } from "zod";

/** `reason` + `params`: mã lý do ổn định (@kb/contracts reason-codes) để giao diện dịch – server không dịch, `message` luôn tiếng Việt. */
export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public reason?: string,
    public params?: Record<string, string | number>,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export class DomainHttpError extends HttpError {
  constructor(e: DomainError) {
    super(STATUS_BY_CODE[e.code] ?? 422, e.code, e.message ?? e.code, e.reason, e.params);
  }
}

const STATUS_BY_CODE: Partial<Record<DomainErrorCode, number>> = {
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  UNAUTHENTICATED: 401,
  INVALID_CREDENTIALS: 401,
  RATE_LIMITED: 429,
  VALIDATION: 400,
  TOKEN_INVALID: 400,
  FILE_INVALID: 400,
  FILE_TOO_LARGE: 400,
  NOT_READY: 409,
  INVALID_STATE: 409,
  DOSSIER_LOCKED: 409,
  QUOTA_EXCEEDED: 402,
  EMAIL_TAKEN: 409,
  TAX_CODE_EXISTS: 409,
  DUPLICATE: 409,
  ALREADY_SUBMITTED: 409,
  MEMBERSHIP_PENDING: 403,
  MEMBERSHIP_DISABLED: 403,
  NO_ORGANIZATION: 403,
  EMAIL_NOT_VERIFIED: 403,
  NO_ITEMS: 409,
  NO_DECLARATION: 409,
  HS_UNCONFIRMED: 409,
  BLOCKER_FAILED: 409,
  NOT_APPROVED: 409,
  RATE_WEEK_CHANGED: 409,
  SKILL_IN_USE: 409,
  INVALID_HS: 400,
  NOT_SUPPORTED: 422,
  NOT_ENOUGH_SAMPLES: 409,
  NO_CERT: 400,
  GATEWAY_ERROR: 502,
  INTEGRATION_NOT_CONFIGURED: 409,
  CONFLICT: 409,
  ORG_SUSPENDED: 403,
  MFA_REQUIRED: 403,
  MFA_INVALID: 400,
};

/** ok → value; err → ném để route() trả HTTP tương ứng. */
export function fromResult<T>(r: Result<T>): T {
  if (r.ok) return r.value;
  throw new DomainHttpError(r.error);
}

export async function json(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new HttpError(400, "VALIDATION", "Nội dung gửi lên không phải JSON");
  }
}

export async function parseBody<T>(req: NextRequest, schema: ZodType<T>): Promise<T> {
  return schema.parse(await json(req));
}

/**
 * IP khách sau `trustedHops` reverse proxy: proxy tin cậy ghi IP thật vào CUỐI X-Forwarded-For, phần đầu do khách gửi có thể giả
 * (lách giới hạn đăng nhập/đăng ký). `trustedHops` = 0 → không tin X-Forwarded-For. Không có gì → "unknown" (gom một nhóm, vẫn bị giới hạn).
 */
export function clientIp(req: NextRequest, trustedHops = 1): string {
  const chain = (req.headers.get("x-forwarded-for") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (trustedHops > 0 && chain.length > 0) {
    const fromRight = Math.min(trustedHops, chain.length);
    return chain[chain.length - fromRight]!;
  }
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

/** Thân JSON của lỗi: {code, message} + mã lý do và tham số khi có. */
export const errorBody = (e: HttpError) => ({ code: e.code, message: e.message, ...(e.reason ? { reason: e.reason } : {}), ...(e.params ? { params: e.params } : {}) });

export const REQUEST_ID_HEADER = "x-request-id";
const REQUEST_ID_OK = /^[A-Za-z0-9._-]{8,128}$/;

/** Mã định danh request: nhận từ reverse proxy (nếu hợp lệ) hoặc tự sinh; trả lại trong header để người dùng báo lỗi kèm mã. */
export function requestIdOf(req: NextRequest): string {
  const given = req.headers.get(REQUEST_ID_HEADER);
  return given && REQUEST_ID_OK.test(given) ? given : crypto.randomUUID();
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Chống CSRF lớp hai (lớp một là cookie SameSite=Lax): request ghi (POST/PUT/PATCH/DELETE) gửi kèm `Origin` thì Origin phải
 * cùng host với trang (host sau reverse proxy lấy từ `x-forwarded-host`). Trình duyệt luôn gửi Origin cho request cross-site
 * và cho fetch cùng site; request không có Origin (curl, script nội bộ, test) được cho qua vì không mang cookie trình duyệt.
 */
export function crossSiteOrigin(req: NextRequest): boolean {
  if (SAFE_METHODS.has(req.method)) return false;
  if (req.headers.get("sec-fetch-site") === "cross-site") return true;
  const origin = req.headers.get("origin");
  if (!origin || origin === "null") return origin === "null";
  const host = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || req.headers.get("host") || req.nextUrl.host;
  try {
    return new URL(origin).host !== host;
  } catch {
    return true;
  }
}

type Params = Record<string, string>;
type Handler = (req: NextRequest, params: Params) => Promise<Response | unknown>;

let logger: Logger | undefined;
const log = () => (logger ??= createLogger({ name: "web" }));
/** Chỉ test: thay logger. */
export const setRouteLogger = (l: Logger | undefined) => void (logger = l);

/**
 * Bọc handler: kết quả object → JSON 200; Response trả nguyên; lỗi → JSON {code,message,reason?,params?}.
 * Mọi phản hồi mang `x-request-id`; lỗi 500 trả thêm `requestId` để đối chiếu log (không lộ message/stack).
 */
export function route(handler: Handler) {
  return async (req: NextRequest, ctx: { params: Promise<Params> }): Promise<Response> => {
    const requestId = requestIdOf(req);
    const startedAt = Date.now();
    const finish = (res: Response) => {
      res.headers.set(REQUEST_ID_HEADER, requestId);
      return res;
    };
    try {
      if (crossSiteOrigin(req)) throw new HttpError(403, "CSRF", "Request không đến từ ứng dụng");
      const params = await ctx.params;
      const out = await handler(req, params);
      if (out instanceof Response) return finish(out);
      if (out === undefined) return finish(new NextResponse(null, { status: 204 }));
      return finish(NextResponse.json(out));
    } catch (e) {
      if (e instanceof HttpError) return finish(NextResponse.json(errorBody(e), { status: e.status }));
      if (e instanceof ZodError) {
        return finish(NextResponse.json({ code: "VALIDATION", message: "Dữ liệu không hợp lệ", issues: e.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, { status: 400 }));
      }
      log().error("lỗi không xử lý được trong route", { requestId, method: req.method, path: req.nextUrl.pathname, durationMs: Date.now() - startedAt, err: e });
      return finish(NextResponse.json({ code: "INTERNAL", message: "Lỗi máy chủ, thử lại sau", requestId }, { status: 500 }));
    }
  };
}
