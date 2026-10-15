// Tài khoản & tích hợp. Chọn mock|http theo NEXT_PUBLIC_DATA_SOURCE.
import { pick } from "@/lib/data-source";
import * as mock from "@/mocks/api/settings";
import * as http from "./http/settings";

export const settingsKeys = mock.settingsKeys;
export type { OrgProfileInput } from "@kb/contracts";

export const getOrganization = pick(mock.getOrganization, http.getOrganization);
export const updateOrganization = pick(mock.updateOrganization, http.updateOrganization);
export const updateSuspectThreshold = pick(mock.updateSuspectThreshold, http.updateSuspectThreshold);
export const updateFourEyes = pick(mock.updateFourEyes, http.updateFourEyes);
export const listMembers = pick(mock.listMembers, http.listMembers);
export const inviteMember = pick(mock.inviteMember, http.inviteMember);
export const changeMemberRole = pick(mock.changeMemberRole, http.changeMemberRole);
export const setMemberDisabled = pick(mock.setMemberDisabled, http.setMemberDisabled);
export const listIntegrations = pick(mock.listIntegrations, http.listIntegrations);
export const testIntegration = pick(mock.testIntegration, http.testIntegration);
export const getVnaccsAccount = pick(mock.getVnaccsAccount, http.getVnaccsAccount);
export const saveVnaccsAccount = pick(mock.saveVnaccsAccount, http.saveVnaccsAccount);
export const removeVnaccsAccount = pick(mock.removeVnaccsAccount, http.removeVnaccsAccount);
export const getDeclarationProfile = pick(mock.getDeclarationProfile, http.getDeclarationProfile);
export const saveDeclarationProfile = pick(mock.saveDeclarationProfile, http.saveDeclarationProfile);
export const listDeclarationRules = pick(mock.listDeclarationRules, http.listDeclarationRules);
export const listCertificates = pick(mock.listCertificates, http.listCertificates);
export const setDefaultCertificate = pick(mock.setDefaultCertificate, http.setDefaultCertificate);
export const addCertificate = pick(mock.addCertificate, http.addCertificate);
export const removeCertificate = pick(mock.removeCertificate, http.removeCertificate);
