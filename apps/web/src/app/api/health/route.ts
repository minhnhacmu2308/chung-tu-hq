import { NextResponse } from "next/server";
import { getContainer } from "@/container";
import { dataSource } from "@/lib/data-source";

export const dynamic = "force-dynamic";

/**
 * Kiểm tra đường nối web → Postgres/Redis. Không cần session.
 * Không trả thông điệp lỗi gốc (có thể chứa chuỗi kết nối); chi tiết ghi log phía server.
 */
export async function GET() {
  const source = dataSource();
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
      await fn();
      checks[name] = "ok";
    } catch (e) {
      console.error(`[health] ${name}:`, (e as Error).message);
      checks[name] = "error";
    }
  };
  await probe("postgres", () => c.pingDb());
  await probe("redis", () => c.redis.ping());
  const ok = Object.values(checks).every((v) => v === "ok");
  return NextResponse.json({ ok, dataSource: source, checks }, { status: ok ? 200 : 503 });
}
