// Mã hóa lại mọi bí mật đang ở phiên bản khóa cũ bằng khóa hiện hành (xoay khóa APP_MASTER_KEYS). Việc bảo trì xuyên module
// (org_secrets, mail_connections, platform_integrations, platform_staff) nên nằm ở tầng db; chạy bằng kết nối admin
// (các bảng có RLS theo org / chỉ kb_platform đọc được): scripts/rotate-secrets.ts.
import { and, eq, isNotNull, lt, sql } from "drizzle-orm";
import type { Db } from "../client.js";
import { platformIntegrations, platformStaff } from "../schema/admin.js";
import { orgSecrets } from "../schema/identity.js";
import { mailConnections } from "../schema/mailbox.js";

/** Phần của AesSecretStore mà việc xoay khóa cần (không import module identity từ tầng db). */
export type RotatingCipher = { readonly currentVersion: number; reencrypt(ciphertext: string, keyVersion: number): { ciphertext: string; keyVersion: number; changed: boolean } };

export type RotateReport = { current: number; tables: Record<string, { scanned: number; rotated: number }>; dryRun: boolean };

/** Dòng nào `key_version < current` → giải mã bằng khóa cũ, mã hóa lại, ghi `key_version` mới. Lỗi giải mã một dòng → ném (không bỏ qua im lặng). */
export async function rotateSecrets(db: Db, store: RotatingCipher, opts: { dryRun?: boolean } = {}): Promise<RotateReport> {
  const current = store.currentVersion;
  const dryRun = opts.dryRun ?? false;
  const report: RotateReport = { current, tables: {}, dryRun };
  const tally = (table: string, rotated: boolean) => {
    const t = (report.tables[table] ??= { scanned: 0, rotated: 0 });
    t.scanned++;
    if (rotated) t.rotated++;
  };

  await db.transaction(async (tx) => {
    for (const row of await tx.select({ id: orgSecrets.id, ciphertext: orgSecrets.ciphertext, keyVersion: orgSecrets.keyVersion }).from(orgSecrets).where(lt(orgSecrets.keyVersion, current))) {
      const next = store.reencrypt(row.ciphertext, row.keyVersion);
      tally("org_secrets", next.changed);
      if (next.changed && !dryRun) await tx.update(orgSecrets).set({ ciphertext: next.ciphertext, keyVersion: next.keyVersion, updatedAt: new Date() }).where(eq(orgSecrets.id, row.id));
    }
    for (const row of await tx.select({ id: mailConnections.id, ciphertext: mailConnections.ciphertext, keyVersion: mailConnections.keyVersion }).from(mailConnections).where(lt(mailConnections.keyVersion, current))) {
      const next = store.reencrypt(row.ciphertext, row.keyVersion);
      tally("mail_connections", next.changed);
      if (next.changed && !dryRun) await tx.update(mailConnections).set({ ciphertext: next.ciphertext, keyVersion: next.keyVersion, updatedAt: new Date() }).where(eq(mailConnections.id, row.id));
    }
    for (const row of await tx.select({ id: platformIntegrations.id, ciphertext: platformIntegrations.ciphertext, keyVersion: platformIntegrations.keyVersion }).from(platformIntegrations).where(and(lt(platformIntegrations.keyVersion, current), isNotNull(platformIntegrations.ciphertext)))) {
      const next = store.reencrypt(row.ciphertext!, row.keyVersion);
      tally("platform_integrations", next.changed);
      if (next.changed && !dryRun) await tx.update(platformIntegrations).set({ ciphertext: next.ciphertext, keyVersion: next.keyVersion }).where(eq(platformIntegrations.id, row.id));
    }
    // TOTP: hai cột (đã bật + đang thiết lập) dùng chung một phiên bản khóa.
    for (const row of await tx
      .select({ userId: platformStaff.userId, enabled: platformStaff.totpCiphertext, pending: platformStaff.totpPendingCiphertext, keyVersion: platformStaff.totpKeyVersion })
      .from(platformStaff)
      .where(and(lt(platformStaff.totpKeyVersion, current), sql`(${platformStaff.totpCiphertext} is not null or ${platformStaff.totpPendingCiphertext} is not null)`))) {
      const enabled = row.enabled ? store.reencrypt(row.enabled, row.keyVersion) : null;
      const pending = row.pending ? store.reencrypt(row.pending, row.keyVersion) : null;
      tally("platform_staff", true);
      if (!dryRun) await tx.update(platformStaff).set({ totpCiphertext: enabled?.ciphertext ?? null, totpPendingCiphertext: pending?.ciphertext ?? null, totpKeyVersion: current }).where(eq(platformStaff.userId, row.userId));
    }
  });
  return report;
}
