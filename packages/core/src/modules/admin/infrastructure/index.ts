import { createDb, type Db } from "../../../db/client.js";
import { systemClock, type Clock } from "../../../shared/clock.js";
import { ulidIdGen } from "../../../shared/ids.js";
import { randomBytes } from "node:crypto";
import QRCode from "qrcode";
import type { AdminDeps, AttemptLimiter, IdentityGateway, IntegrationProbe, JobMonitor, KeyVault, QrRenderer, SystemProbe } from "../application/ports.js";
import { DrizzleAdminUow } from "./drizzle-uow.js";

export { DrizzleAdminUow };

/** Mã QR SVG (mức sửa lỗi M, lề 1) cho URI otpauth của bước thiết lập 2FA. */
export const svgQr: QrRenderer = { svg: (text) => QRCode.toString(text, { type: "svg", errorCorrectionLevel: "M", margin: 1 }) };

/**
 * Hạ tầng khu Quản trị hệ thống. `platformUrl` là kết nối role kb_platform (ADR 0006) – pool riêng, KHÔNG dùng chung với kb_app.
 * Hàng đợi, kiểm tra dịch vụ và gọi thử tích hợp do composition root cung cấp (bullmq/ioredis nằm ở apps).
 */
export function createAdminInfrastructure(opts: {
  platformUrl: string; identity: IdentityGateway; jobs: JobMonitor; system: SystemProbe; probe: IntegrationProbe; vault: KeyVault; limiter: AttemptLimiter;
  qr?: QrRenderer; random?: (n: number) => Buffer; clock?: Clock;
}): AdminDeps & { db: Db } {
  const db = createDb(opts.platformUrl, { max: 3 });
  return {
    db, uow: new DrizzleAdminUow(db), identity: opts.identity, jobs: opts.jobs, system: opts.system, probe: opts.probe, vault: opts.vault,
    qr: opts.qr ?? svgQr, limiter: opts.limiter, random: opts.random ?? randomBytes, clock: opts.clock ?? systemClock, idGen: ulidIdGen,
  };
}

/** Quản trị viên của một tài khoản (identity hỏi khi đăng nhập). */
export async function platformStaffOf(uow: DrizzleAdminUow, userId: string): Promise<{ status: "ACTIVE" | "INVITED" | "DISABLED" } | null> {
  const s = await uow.run((r) => r.staff.get(userId));
  return s ? { status: s.status } : null;
}
