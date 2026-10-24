// Tài khoản VNACCS của doanh nghiệp: lưu mã hóa ở org_secrets (kind VNACCS). Mật khẩu/terminal key không bao giờ trả ra API.
import { VnaccsAccountInputSchema, type VnaccsAccount, type VnaccsAccountInput } from "@kb/contracts";
import { z } from "zod";
import type { Ctx } from "../../../shared/ctx.js";
import { domainError } from "../../../shared/errors.js";
import { asOrgId, asUserId } from "../../../shared/ids.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { canManageOrg } from "../domain/role-rules.js";
import type { IdentityDeps, OrgSecretRow, SecretStore } from "./ports.js";

export const VNACCS_SECRET_KIND = "VNACCS";
const StoredSchema = VnaccsAccountInputSchema;

const notConfigured = () => err(domainError("INTEGRATION_NOT_CONFIGURED", "Máy chủ chưa cấu hình khóa mã hóa (APP_MASTER_KEY)"));
const decode = (store: SecretStore, row: OrgSecretRow): VnaccsAccountInput => StoredSchema.parse(JSON.parse(store.decrypt(row.ciphertext, row.keyVersion)) as unknown);
const toDto = (store: SecretStore, row: OrgSecretRow | null): VnaccsAccount => {
  if (!row) return { configured: false, userId: null, terminalId: null, updatedAt: null };
  const a = decode(store, row);
  return { configured: true, userId: a.userId, terminalId: a.terminalId, updatedAt: row.updatedAt.toISOString() };
};

/** Mọi thành viên xem được trạng thái (không lộ mật khẩu/terminal key) – màn Khai báo Hải quan cần biết đã cấu hình chưa. */
export async function getVnaccsAccount(deps: IdentityDeps, ctx: Ctx): Promise<Result<VnaccsAccount>> {
  if (!deps.secrets) return notConfigured();
  const row = await deps.uow.asOrg(ctx, (r) => r.secrets.get(ctx.orgId, VNACCS_SECRET_KIND));
  return ok(toDto(deps.secrets, row));
}

/** Lưu/thay tài khoản VNACCS. Chỉ Quản trị / Chủ sở hữu. */
export async function saveVnaccsAccount(deps: IdentityDeps, ctx: Ctx, input: VnaccsAccountInput): Promise<Result<VnaccsAccount>> {
  const allowed = canManageOrg(ctx.role);
  if (!allowed.ok) return allowed;
  if (!deps.secrets) return notConfigured();
  const parsed = VnaccsAccountInputSchema.safeParse(input);
  if (!parsed.success) return err(domainError("VALIDATION", parsed.error.issues.map((i) => i.message).join("; "), z.flattenError(parsed.error).fieldErrors));
  const { ciphertext, keyVersion } = deps.secrets.encrypt(JSON.stringify(parsed.data));
  const row: OrgSecretRow = { id: deps.idGen.next("sec"), orgId: ctx.orgId, kind: VNACCS_SECRET_KIND, ciphertext, keyVersion, updatedAt: deps.clock.now() };
  await deps.uow.asOrg(ctx, (r) => r.secrets.upsert(row));
  // Không ghi mật khẩu/khóa vào nhật ký – chỉ userId VNACCS.
  await deps.audit?.record(ctx, { action: "VNACCS_ACCOUNT_SAVED", targetType: "vnaccs_account", targetId: VNACCS_SECRET_KIND, targetLabel: parsed.data.userId });
  return ok(toDto(deps.secrets, row));
}

/** Gỡ tài khoản VNACCS (doanh nghiệp không truyền được tờ khai tới khi nhập lại). Chỉ Quản trị / Chủ sở hữu. */
export async function removeVnaccsAccount(deps: IdentityDeps, ctx: Ctx): Promise<Result<VnaccsAccount>> {
  const allowed = canManageOrg(ctx.role);
  if (!allowed.ok) return allowed;
  if (!deps.secrets) return notConfigured();
  await deps.uow.asOrg(ctx, (r) => r.secrets.delete(ctx.orgId, VNACCS_SECRET_KIND));
  await deps.audit?.record(ctx, { action: "VNACCS_ACCOUNT_REMOVED", targetType: "vnaccs_account", targetId: VNACCS_SECRET_KIND, targetLabel: VNACCS_SECRET_KIND });
  return ok(toDto(deps.secrets, null));
}

/**
 * Tài khoản đã giải mã cho cổng Hải quan (chỉ composition root nối vào gateway; không gọi từ route).
 * Ngữ cảnh hệ thống của org (worker không có người dùng).
 */
export async function readVnaccsCredentials(deps: IdentityDeps, orgId: string): Promise<VnaccsAccountInput | null> {
  if (!deps.secrets) return null;
  const row = await deps.uow.asOrg({ orgId: asOrgId(orgId), userId: asUserId("") }, (r) => r.secrets.get(orgId, VNACCS_SECRET_KIND));
  return row ? decode(deps.secrets, row) : null;
}
