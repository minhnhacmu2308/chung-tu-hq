// Thương hiệu doanh nghiệp + ảnh đại diện (ADR 0016) – gọi backend thật. Cùng chữ ký với src/mocks/api/branding.ts.
import { MemberSchema, OrganizationSchema, type Member, type OrgBrandInput, type Organization } from "@kb/contracts";
import { apiDelete, apiPatch, apiUpload } from "@/lib/http";

const imageForm = (file: File) => {
  const form = new FormData();
  form.append("files", file, file.name);
  return form;
};

export const updateOrgBrand = (input: OrgBrandInput) => apiPatch("org/brand", input, OrganizationSchema);
export const uploadOrgLogo = (file: File) => apiUpload("org/logo", imageForm(file), OrganizationSchema, "PUT");
export const removeOrgLogo = () => apiDelete("org/logo", OrganizationSchema);
export const uploadMyAvatar = (file: File) => apiUpload("me/avatar", imageForm(file), MemberSchema, "PUT");
export const removeMyAvatar = () => apiDelete("me/avatar", MemberSchema);

/** URL ảnh qua route có kiểm phiên; `?v=` đổi mỗi lần thay ảnh nên trình duyệt cache lâu được. */
export const orgLogoSrc = (org: Pick<Organization, "brand"> | undefined): string | undefined =>
  org?.brand.logoVersion ? `/api/org/logo?v=${encodeURIComponent(org.brand.logoVersion)}` : undefined;
export const memberAvatarSrc = (m: Pick<Member, "id" | "avatarVersion"> | undefined): string | undefined =>
  m?.avatarVersion ? `/api/org/members/${encodeURIComponent(m.id)}/avatar?v=${encodeURIComponent(m.avatarVersion)}` : undefined;
