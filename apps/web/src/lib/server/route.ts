// Wrapper cho route handler: parse input, map lỗi nghiệp vụ → HTTP, không lộ chi tiết lỗi hạ tầng.
import type { DomainError, DomainErrorCode, Result } from "@kb/core/shared";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodType } from "zod";

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

class DomainHttpError extends HttpError {
  constructor(e: DomainError) {
    super(STATUS_BY_CODE[e.code] ?? 422, e.code, e.message ?? e.code);
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
  INVALID_HS: 400,
  NOT_SUPPORTED: 422,
  NOT_ENOUGH_SAMPLES: 409,
  NO_CERT: 400,
  GATEWAY_ERROR: 502,
  INTEGRATION_NOT_CONFIGURED: 409,
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

export function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "0.0.0.0";
}

type Params = Record<string, string>;
type Handler = (req: NextRequest, params: Params) => Promise<Response | unknown>;

/** Bọc handler: kết quả object → JSON 200; Response trả nguyên; lỗi → JSON {code,message}. */
export function route(handler: Handler) {
  return async (req: NextRequest, ctx: { params: Promise<Params> }): Promise<Response> => {
    try {
      const params = await ctx.params;
      const out = await handler(req, params);
      if (out instanceof Response) return out;
      if (out === undefined) return new NextResponse(null, { status: 204 });
      return NextResponse.json(out);
    } catch (e) {
      if (e instanceof HttpError) return NextResponse.json({ code: e.code, message: e.message }, { status: e.status });
      if (e instanceof ZodError) {
        return NextResponse.json({ code: "VALIDATION", message: "Dữ liệu không hợp lệ", issues: e.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, { status: 400 });
      }
      console.error(`[api] ${req.method} ${req.nextUrl.pathname}:`, e);
      return NextResponse.json({ code: "INTERNAL", message: "Lỗi máy chủ, thử lại sau" }, { status: 500 });
    }
  };
}
