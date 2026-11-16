// Thương hiệu doanh nghiệp (tên + logo) và ảnh đại diện (ADR 0016). Chọn mock|http theo NEXT_PUBLIC_DATA_SOURCE.
import { pick } from "@/lib/data-source";
import * as mock from "@/mocks/api/branding";
import * as http from "./http/branding";

export const updateOrgBrand = pick(mock.updateOrgBrand, http.updateOrgBrand);
export const uploadOrgLogo = pick(mock.uploadOrgLogo, http.uploadOrgLogo);
export const removeOrgLogo = pick(mock.removeOrgLogo, http.removeOrgLogo);
export const uploadMyAvatar = pick(mock.uploadMyAvatar, http.uploadMyAvatar);
export const removeMyAvatar = pick(mock.removeMyAvatar, http.removeMyAvatar);
/** `src` ảnh logo: http → `/api/org/logo?v=…`, mock → data URL; chưa có logo → undefined. */
export const orgLogoSrc = pick(mock.orgLogoSrc, http.orgLogoSrc);
/** `src` ảnh đại diện: http → `/api/org/members/<id>/avatar?v=…`, mock → data URL; chưa có → undefined. */
export const memberAvatarSrc = pick(mock.memberAvatarSrc, http.memberAvatarSrc);
