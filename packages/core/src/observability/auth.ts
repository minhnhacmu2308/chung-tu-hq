// Chặn truy cập /metrics bằng Bearer token (METRICS_TOKEN). Không đặt token → tắt hẳn (web trả 404, worker không mở cổng).
import { createHash, timingSafeEqual } from "node:crypto";

export type MetricsAccess = "ok" | "unauthorized" | "disabled";

const digest = (s: string) => createHash("sha256").update(s, "utf8").digest();

/**
 * So header `Authorization` với token bằng so sánh thời gian hằng (băm SHA-256 trước để không lộ độ dài token).
 * Không bao giờ log token hay header.
 */
export function metricsAccess(authorization: string | null | undefined, token: string | undefined): MetricsAccess {
  if (!token) return "disabled";
  const m = /^Bearer[ \t]+(\S+)[ \t]*$/i.exec(authorization ?? "");
  if (!m) return "unauthorized";
  return timingSafeEqual(digest(m[1]!), digest(token)) ? "ok" : "unauthorized";
}
