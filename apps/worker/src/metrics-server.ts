import { createServer, type Server } from "node:http";
import { metricsAccess, metricsText } from "@kb/core/observability";
import { createLogger } from "@kb/core/shared";

const log = createLogger({ name: "worker" });

/**
 * Cổng chỉ số Prometheus của worker (ADR 0012): `GET /metrics` kèm `Authorization: Bearer <METRICS_TOKEN>`.
 * Chỉ mở khi đặt METRICS_TOKEN; không publish cổng ra máy chủ – Prometheus scrape qua mạng docker `hscodepro-observability`.
 */
export function startMetricsServer(opts: { port: number; token: string; host?: string }): Server {
  const server = createServer(async (req, res) => {
    const send = (status: number, body: string, type = "text/plain; charset=utf-8", extra: Record<string, string> = {}) => {
      res.writeHead(status, { "content-type": type, "cache-control": "no-store", ...extra });
      res.end(body);
    };
    const path = (req.url ?? "/").split("?")[0];
    if (req.method !== "GET" || path !== "/metrics") return send(404, "not found");
    if (metricsAccess(req.headers.authorization, opts.token) !== "ok") return send(401, "unauthorized", undefined, { "www-authenticate": "Bearer" });
    try {
      const { body, contentType } = await metricsText();
      send(200, body, contentType);
    } catch (e) {
      log.error("không xuất được chỉ số", { err: e });
      send(500, "error");
    }
  });
  server.listen(opts.port, opts.host ?? "0.0.0.0", () => log.info("metrics server đang nghe", { port: opts.port }));
  server.on("error", (e) => log.error("metrics server lỗi", { err: e }));
  return server;
}
