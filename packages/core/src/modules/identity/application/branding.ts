// Thương hiệu doanh nghiệp (tên + logo) và ảnh đại diện thành viên – ADR 0016.
// Ảnh nằm ở kho file (port ImageStore), DB chỉ giữ khóa + thời điểm đổi (làm `?v=` cho URL ảnh).
import { OrgBrandInputSchema, sniffImage, type Member, type Organization } from "@kb/contracts";
import type { Ctx } from "../../../shared/ctx.js";
import { domainError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { checkImage } from "../domain/image.js";
import { canManageOrg } from "../domain/role-rules.js";
import { toMember } from "./_to-dto.js";
import { getOrganization } from "./get-organization.js";
import type { IdentityDeps, ImageStore } from "./ports.js";

export type StoredImage = { bytes: Buffer; mime: string };

const noStore = () => err(domainError("INTEGRATION_NOT_CONFIGURED", "Chưa cấu hình kho lưu file"));

/** Xóa ảnh cũ sau khi DB đã trỏ sang ảnh mới – lỗi kho không làm hỏng thao tác (chỉ còn file mồ côi). */
async function dropOld(images: ImageStore, key: string | null | undefined) {
  if (!key) return;
  try {
    await images.delete(key);
  } catch {
    /* best-effort */
  }
}

async function readStored(images: ImageStore | undefined, key: string | null | undefined): Promise<StoredImage | null> {
  if (!images || !key) return null;
  let bytes: Buffer;
  try {
    bytes = await images.get(key);
  } catch {
    return null;
  }
  return { bytes, mime: sniffImage(bytes)?.mime ?? "application/octet-stream" };
}

/** Đổi tên thương hiệu ("" = về mặc định KhaiBáo AI). Chỉ Quản trị / Chủ sở hữu. */
export async function updateOrgBrandName(deps: IdentityDeps, ctx: Ctx, input: { name: string | null }): Promise<Result<Organization>> {
  const allowed = canManageOrg(ctx.role);
  if (!allowed.ok) return allowed;
  const { name } = OrgBrandInputSchema.parse({ name: input.name ?? "" });
  await deps.uow.asOrg(ctx, (r) => r.orgs.update(ctx.orgId, { brandName: name }));
  await deps.audit?.record(ctx, { action: "ORG_BRAND_NAME", targetType: "organization", targetId: ctx.orgId, targetLabel: name ?? "" });
  return getOrganization(deps, ctx);
}

/** Đặt logo: ghi ảnh mới → trỏ DB sang ảnh mới → xóa ảnh cũ. */
export async function setOrgLogo(deps: IdentityDeps, ctx: Ctx, bytes: Buffer): Promise<Result<Organization>> {
  const allowed = canManageOrg(ctx.role);
  if (!allowed.ok) return allowed;
  const kind = checkImage(bytes);
  if (!kind.ok) return kind;
  if (!deps.images) return noStore();
  const key = `branding/${ctx.orgId}/logo-${deps.idGen.next("img")}.${kind.value.ext}`;
  await deps.images.put(key, bytes, kind.value.mime);
  const old = await deps.uow.asOrg(ctx, async (r) => {
    const o = await r.orgs.findById(ctx.orgId);
    await r.orgs.update(ctx.orgId, { logoKey: key, logoUpdatedAt: deps.clock.now() });
    return o?.logoKey;
  });
  await dropOld(deps.images, old);
  await deps.audit?.record(ctx, { action: "ORG_LOGO_SET", targetType: "organization", targetId: ctx.orgId, targetLabel: "logo" });
  return getOrganization(deps, ctx);
}

export async function removeOrgLogo(deps: IdentityDeps, ctx: Ctx): Promise<Result<Organization>> {
  const allowed = canManageOrg(ctx.role);
  if (!allowed.ok) return allowed;
  const old = await deps.uow.asOrg(ctx, async (r) => {
    const o = await r.orgs.findById(ctx.orgId);
    if (o?.logoKey) await r.orgs.update(ctx.orgId, { logoKey: null, logoUpdatedAt: null });
    return o?.logoKey;
  });
  if (old) {
    if (deps.images) await dropOld(deps.images, old);
    await deps.audit?.record(ctx, { action: "ORG_LOGO_REMOVED", targetType: "organization", targetId: ctx.orgId, targetLabel: "logo" });
  }
  return getOrganization(deps, ctx);
}

/** Logo của org đang đăng nhập; null = chưa có (route trả 404). */
export async function readOrgLogo(deps: IdentityDeps, ctx: Ctx): Promise<StoredImage | null> {
  const org = await deps.uow.asOrg(ctx, (r) => r.orgs.findById(ctx.orgId));
  return readStored(deps.images, org?.logoKey);
}

async function myMember(deps: IdentityDeps, ctx: Ctx): Promise<Result<Member>> {
  const res = await deps.uow.asOrg(ctx, async (r) => ({ u: await r.users.findById(ctx.userId), m: await r.memberships.find(ctx.orgId, ctx.userId) }));
  return res.u && res.m ? ok(toMember(res.u, res.m)) : err(domainError("NOT_FOUND", "Không tìm thấy thành viên"));
}

/** Ảnh đại diện của chính mình (mọi vai trò). */
export async function setMyAvatar(deps: IdentityDeps, ctx: Ctx, bytes: Buffer): Promise<Result<Member>> {
  const kind = checkImage(bytes);
  if (!kind.ok) return kind;
  if (!deps.images) return noStore();
  const key = `avatars/${ctx.userId}/${deps.idGen.next("img")}.${kind.value.ext}`;
  await deps.images.put(key, bytes, kind.value.mime);
  const old = await deps.uow.asOrg(ctx, async (r) => {
    const u = await r.users.findById(ctx.userId);
    await r.users.update(ctx.userId, { avatarKey: key, avatarUpdatedAt: deps.clock.now() });
    return u?.avatarKey;
  });
  await dropOld(deps.images, old);
  return myMember(deps, ctx);
}

export async function removeMyAvatar(deps: IdentityDeps, ctx: Ctx): Promise<Result<Member>> {
  const old = await deps.uow.asOrg(ctx, async (r) => {
    const u = await r.users.findById(ctx.userId);
    if (u?.avatarKey) await r.users.update(ctx.userId, { avatarKey: null, avatarUpdatedAt: null });
    return u?.avatarKey;
  });
  if (old && deps.images) await dropOld(deps.images, old);
  return myMember(deps, ctx);
}

/** Ảnh đại diện của một thành viên CÙNG doanh nghiệp đang đăng nhập; người ngoài org → NOT_FOUND. */
export async function readMemberAvatar(deps: IdentityDeps, ctx: Ctx, userId: string): Promise<Result<StoredImage>> {
  const user = await deps.uow.asOrg(ctx, async (r) => ((await r.memberships.find(ctx.orgId, userId)) ? r.users.findById(userId) : null));
  const img = await readStored(deps.images, user?.avatarKey);
  return img ? ok(img) : err(domainError("NOT_FOUND", "Không có ảnh đại diện"));
}
