// Thương hiệu doanh nghiệp + ảnh đại diện (mock, ADR 0016): ảnh lưu data URL trong DB giả (localStorage), cùng luật với backend.
import { BRAND_IMAGE_MAX_BYTES, OrgBrandInputSchema, sniffImage, type Member, type OrgBrandInput, type Organization } from "@kb/contracts";
import { getDb } from "@/mocks/db";
import { orgView } from "@/mocks/billing-sim";
import { reasonApiError } from "@/mocks/reason-error";
import type { MockDb } from "@/mocks/db";
import { ApiError, mutate, nowIso } from "@/lib/mock-request";

const requireManager = (db: MockDb) => {
  const role = db.members.find((m) => m.id === db.currentUserId)?.role;
  if (role !== "OWNER" && role !== "ADMIN") throw new ApiError("FORBIDDEN", "Cần vai trò Quản trị hoặc Chủ sở hữu");
};

/** Kiểm như backend (byte đầu file, ≤ 1 MB) rồi đổi thành data URL. */
async function toDataUrl(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length > BRAND_IMAGE_MAX_BYTES) throw reasonApiError("FILE_TOO_LARGE", "IMAGE_TOO_LARGE", { max: "1 MB" });
  const kind = sniffImage(bytes);
  if (!kind) throw reasonApiError("FILE_INVALID", "IMAGE_TYPE_UNSUPPORTED");
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return `data:${kind.mime};base64,${btoa(bin)}`;
}

const me = (db: MockDb) => db.members.find((m) => m.id === db.currentUserId)!;

export const updateOrgBrand = (input: OrgBrandInput) =>
  mutate((db): Organization => {
    requireManager(db);
    db.org.brand = { ...db.org.brand, name: OrgBrandInputSchema.parse(input).name };
    return orgView(db);
  });

// shortcut: data URL ≤ 1,4 MB mỗi ảnh nằm trong localStorage (~5 MB) – quá hạn mức thì saveDb bỏ qua, F5 mất ảnh; đủ cho demo.
export const uploadOrgLogo = async (file: File) => {
  const url = await toDataUrl(file);
  return mutate((db): Organization => {
    requireManager(db);
    db.images = { ...db.images, logo: url };
    db.org.brand = { ...db.org.brand, logoVersion: nowIso() };
    return orgView(db);
  });
};

export const removeOrgLogo = () =>
  mutate((db): Organization => {
    requireManager(db);
    if (db.images) delete db.images.logo;
    db.org.brand = { ...db.org.brand, logoVersion: null };
    return orgView(db);
  });

export const uploadMyAvatar = async (file: File) => {
  const url = await toDataUrl(file);
  return mutate((db): Member => {
    const m = me(db);
    db.images = { ...db.images, [`avatar:${m.id}`]: url };
    m.avatarVersion = nowIso();
    return m;
  });
};

export const removeMyAvatar = () =>
  mutate((db): Member => {
    const m = me(db);
    if (db.images) delete db.images[`avatar:${m.id}`];
    m.avatarVersion = null;
    return m;
  });

/** Ảnh ở dạng data URL (không có route ảnh ở chế độ mock). */
export const orgLogoSrc = (org: Pick<Organization, "brand"> | undefined): string | undefined =>
  org?.brand.logoVersion ? getDb().images?.logo : undefined;
export const memberAvatarSrc = (m: Pick<Member, "id" | "avatarVersion"> | undefined): string | undefined =>
  m?.avatarVersion ? getDb().images?.[`avatar:${m.id}`] : undefined;
