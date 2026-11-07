// Chỉ số Prometheus của web (ADR 0012, docs/OBSERVABILITY.md). Không qua phiên đăng nhập: chặn bằng `Authorization: Bearer <METRICS_TOKEN>`.
// Không đặt METRICS_TOKEN → 404 như route không tồn tại. Không đi qua route() để lần scrape không tự đếm vào khaibao_http_*.
import { configureMetrics, metricsAccess, metricsText } from "@kb/core/observability";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest): Promise<Response> {
  // Đọc thẳng process.env (không qua container): chạy được cả khi container chưa dựng; METRICS_TOKEN đã được loadEnv kiểm lúc khởi động.
  const access = metricsAccess(req.headers.get("authorization"), process.env.METRICS_TOKEN || undefined);
  if (access === "disabled") return NextResponse.json({ code: "NOT_FOUND", message: "Không tìm thấy" }, { status: 404 });
  if (access === "unauthorized") return NextResponse.json({ code: "UNAUTHENTICATED", message: "Thiếu hoặc sai token" }, { status: 401, headers: { "www-authenticate": "Bearer" } });
  configureMetrics({ service: "web", version: process.env.npm_package_version, commit: process.env.GIT_COMMIT });
  const { body, contentType } = await metricsText();
  return new Response(body, { status: 200, headers: { "content-type": contentType, "cache-control": "no-store" } });
}
