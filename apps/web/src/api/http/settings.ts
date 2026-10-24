// Tài khoản doanh nghiệp, thành viên, kết nối, chứng thư số – gọi backend thật. Cùng chữ ký với src/mocks/api/settings.ts.
import {
  DeclarationProfileSchema, DigitalCertificateSchema, IntegrationSchema, JoinRequestSchema, MemberSchema, OkSchema, OrganizationSchema, RuleOptionViewSchema,
  TransferOwnershipResultSchema, VnaccsAccountSchema,
  type DeclarationDirection, type DeclarationProfileInput, type Integration, type OrgProfileInput, type Organization, type RejectJoinRequestInput, type Role,
  type TransferOwnershipInput, type VnaccsAccountInput,
} from "@kb/contracts";
import { z } from "zod";
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from "@/lib/http";

export type { OrgProfileInput };

export const getOrganization = () => apiGet("org", OrganizationSchema);
export const updateOrganization = (input: OrgProfileInput) => apiPatch("org", input, OrganizationSchema);
export const updateSuspectThreshold = (threshold: Organization["suspectThreshold"]) => apiPatch("org/suspect-threshold", { threshold }, OrganizationSchema);
export const updateFourEyes = (enabled: boolean) => apiPatch("org/four-eyes", { enabled }, OrganizationSchema);
export const listMembers = () => apiGet("org/members", z.array(MemberSchema));
export const inviteMember = (input: { email: string; role: Role }) => apiPost("org/members", input, MemberSchema);
export const changeMemberRole = (id: string, role: Role) => apiPatch(`org/members/${id}/role`, { role }, MemberSchema);
export const setMemberDisabled = (id: string, disabled: boolean) => apiPatch(`org/members/${id}/disabled`, { disabled }, MemberSchema);
export const transferOwnership = (id: string, input: TransferOwnershipInput) => apiPost(`org/members/${id}/transfer-ownership`, input, TransferOwnershipResultSchema);
export const listJoinRequests = () => apiGet("org/join-requests", z.array(JoinRequestSchema));
export const approveJoinRequest = (id: string) => apiPost(`org/join-requests/${id}/approve`, {}, MemberSchema);
export const rejectJoinRequest = async (id: string, input: RejectJoinRequestInput) => {
  await apiPost(`org/join-requests/${id}/reject`, input, OkSchema);
};
export const listIntegrations = () => apiGet("org/integrations", z.array(IntegrationSchema));
export const testIntegration = (id: Integration["id"]) => apiPost(`org/integrations/${id}/test`, {}, IntegrationSchema);
export const getVnaccsAccount = () => apiGet("org/vnaccs-account", VnaccsAccountSchema);
export const saveVnaccsAccount = (input: VnaccsAccountInput) => apiPut("org/vnaccs-account", input, VnaccsAccountSchema);
export const removeVnaccsAccount = () => apiDelete("org/vnaccs-account", VnaccsAccountSchema);
export const getDeclarationProfile = (direction: DeclarationDirection) => apiGet(`org/declaration-profile/${direction}`, DeclarationProfileSchema);
export const saveDeclarationProfile = (direction: DeclarationDirection, input: DeclarationProfileInput) => apiPut(`org/declaration-profile/${direction}`, input, DeclarationProfileSchema);
export const listDeclarationRules = (direction: DeclarationDirection) => apiGet(`org/declaration-rules/${direction}`, z.array(RuleOptionViewSchema));
export const listCertificates = () => apiGet("org/certificates", z.array(DigitalCertificateSchema));
export const setDefaultCertificate = async (id: string) => {
  await apiPost(`org/certificates/${id}/default`, {}, OkSchema);
};
export const addCertificate = (input: { issuer: string; serial: string; validTo: string }) => apiPost("org/certificates", input, DigitalCertificateSchema);
export const removeCertificate = async (id: string) => {
  await apiDelete(`org/certificates/${id}`, OkSchema);
};
