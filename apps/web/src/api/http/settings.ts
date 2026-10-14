// Tài khoản doanh nghiệp, thành viên, kết nối, chứng thư số – gọi backend thật. Cùng chữ ký với src/mocks/api/settings.ts.
import {
  DigitalCertificateSchema, IntegrationSchema, MemberSchema, OkSchema, OrganizationSchema,
  type Integration, type OrgProfileInput, type Organization, type Role,
} from "@kb/contracts";
import { z } from "zod";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/http";

export type { OrgProfileInput };

export const getOrganization = () => apiGet("org", OrganizationSchema);
export const updateOrganization = (input: OrgProfileInput) => apiPatch("org", input, OrganizationSchema);
export const updateSuspectThreshold = (threshold: Organization["suspectThreshold"]) => apiPatch("org/suspect-threshold", { threshold }, OrganizationSchema);
export const listMembers = () => apiGet("org/members", z.array(MemberSchema));
export const inviteMember = (input: { email: string; role: Role }) => apiPost("org/members", input, MemberSchema);
export const changeMemberRole = (id: string, role: Role) => apiPatch(`org/members/${id}/role`, { role }, MemberSchema);
export const setMemberDisabled = (id: string, disabled: boolean) => apiPatch(`org/members/${id}/disabled`, { disabled }, MemberSchema);
export const listIntegrations = () => apiGet("org/integrations", z.array(IntegrationSchema));
export const testIntegration = (id: Integration["id"]) => apiPost(`org/integrations/${id}/test`, {}, IntegrationSchema);
export const listCertificates = () => apiGet("org/certificates", z.array(DigitalCertificateSchema));
export const setDefaultCertificate = async (id: string) => {
  await apiPost(`org/certificates/${id}/default`, {}, OkSchema);
};
export const addCertificate = (input: { issuer: string; serial: string; validTo: string }) => apiPost("org/certificates", input, DigitalCertificateSchema);
export const removeCertificate = async (id: string) => {
  await apiDelete(`org/certificates/${id}`, OkSchema);
};
