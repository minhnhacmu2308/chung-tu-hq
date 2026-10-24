import { createServer, type Server } from "node:http";
import { createLogger } from "@kb/core/shared";

/** Phần của Redis mà health cần (không import ioredis ngoài composition root). */
type Pingable = { ping(): Promise<string> };

const log = createLogger({ name: "worker" });

/**
 * Health HTTP nhỏ cho worker (orchestrator/Caddy/uptime check): `GET /health/live` – tiến trình sống; `GET /health/ready` – Redis
 * trả lời và worker đang nghe hàng đợi. Chỉ bật khi đặt WORKER_HEALTH_PORT (dev không cần).
 */
export function startHealthServer(opts: { port: number; redis: Pingable; queues: () => string[]; isShuttingDown: () => boolean }): Server {
  const server = createServer(async (req, res) => {
    const url = req.url ?? "/";
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (url.startsWith("/health/live")) return send(200, { ok: true, probe: "live", uptimeSec: Math.round(process.uptime()) });
    if (url.startsWith("/health/ready")) {
      if (opts.isShuttingDown()) return send(503, { ok: false, reason: "shutting_down" });
      try {
        await Promise.race([opts.redis.ping(), new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 3_000))]);
        return send(200, { ok: true, probe: "ready", queues: opts.queues() });
      } catch {
        return send(503, { ok: false, checks: { redis: "error" } });
      }
    }
    send(404, { ok: false });
  });
  server.listen(opts.port, () => log.info("health server đang nghe", { port: opts.port }));
  server.on("error", (e) => log.error("health server lỗi", { err: e }));
  return server;
}
