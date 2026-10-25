import { NextResponse, type NextRequest } from "next/server";
import { getContainer } from "@/container";
import { dataSource } from "@/lib/data-source";

export const dynamic = "force-dynamic";

/** Mỗi phép thử tối đa 3 giây – health không được treo theo hạ tầng. */
const PROBE_TIMEOUT_MS = 3_000;
const withTimeout = <T>(p: Promise<T>) => Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), PROBE_TIMEOUT_MS))]);

/**
 * `?probe=live` – liveness: tiến trình còn trả lời (không chạm hạ tầng; orchestrator khởi động lại khi lỗi).
 * Mặc định – readiness: Postgres, Redis, kho lưu file (ghi/xóa một khóa nhỏ); 503 khi một trong ba lỗi. `worker` chỉ để thông tin
 * (0 worker không làm web mất sẵn sàng). Không trả thông điệp lỗi gốc (có thể chứa chuỗi kết nối); chi tiết ghi log phía máy chủ.
 */
export async function GET(req: NextRequest) {
  const source = dataSource();
  if (req.nextUrl.searchParams.get("probe") === "live") return NextResponse.json({ ok: true, probe: "live", uptimeSec: Math.round(process.uptime()) });
  if (source === "mock") return NextResponse.json({ ok: true, dataSource: source, checks: {} });

  let c: ReturnType<typeof getContainer>;
  try {
    c = getContainer();
  } catch (e) {
    console.error("[health] cấu hình không hợp lệ:", (e as Error).message);
    return NextResponse.json({ ok: false, dataSource: source, checks: { config: "error" } }, { status: 503 });
  }

  const checks: Record<string, "ok" | "error"> = {};
  const probe = async (name: string, fn: () => Promise<unknown>) => {
    try {
      await withTimeout(fn());
      checks[name] = "ok";
    } catch (e) {
      console.error(`[health] ${name}:`, (e as Error).message);
      checks[name] = "error";
    }
  };
  const storage = c.dossier?.storage;
  await Promise.all([
    probe("postgres", () => c.pingDb()),
    probe("redis", () => c.redis.ping()),
    ...(storage ? [probe("storage", async () => { await storage.put("_health/web-ready", Buffer.from("ok"), "text/plain"); await storage.delete("_health/web-ready"); })] : []),
  ]);
  const required = (["postgres", "redis", "storage"] as const).filter((k) => k in checks);
  const ok = required.every((k) => checks[k] === "ok");
  // Worker: thông tin, không ảnh hưởng readiness của web.
  let worker: number | null = null;
  try {
    worker = c.workerCount ? await withTimeout(c.workerCount()) : null;
  } catch {
    worker = null;
  }
  return NextResponse.json({ ok, dataSource: source, checks, ...(worker !== null ? { workers: worker } : {}) }, { status: ok ? 200 : 503 });
}
