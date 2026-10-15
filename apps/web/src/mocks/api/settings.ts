// Tài khoản doanh nghiệp, thành viên, tích hợp, chứng thư số (mock).
import { ApiError, mutate, newId, nowIso, query } from "@/lib/mock-request";
import { DeclarationProfileInputSchema, PROFILE_FIELD_CODES, VnaccsAccountInputSchema, type DeclarationDirection, type DeclarationProfile, type DeclarationProfileInput, type RuleOptionView, type VnaccsAccount, type VnaccsAccountInput } from "@kb/contracts";
import { mockRules } from "@/mocks/seed/declaration-rules";
import type { DigitalCertificate, Integration, Member, Organization, Role } from "@/mocks/types";

export const settingsKeys = {
  org: ["settings", "org"] as const,
  members: ["settings", "members"] as const,
  integrations: ["settings", "integrations"] as const,
  certificates: ["settings", "certificates"] as const,
  vnaccs: ["settings", "vnaccs-account"] as const,
  declarationProfile: (direction: "NK" | "XK") => ["settings", "declaration-profile", direction] as const,
  declarationRules: (direction: "NK" | "XK") => ["settings", "declaration-rules", direction] as const,
};

export const getOrganization = () => query((db) => db.org);

import type { OrgProfileInput } from "@kb/contracts";
export type { OrgProfileInput };
export const updateOrganization = (input: OrgProfileInput) =>
  mutate((db) => {
    if (!input.name.trim()) throw new ApiError("VALIDATION", "Tên doanh nghiệp không được để trống");
    Object.assign(db.org, { name: input.name.trim(), address: input.address.trim(), phone: input.phone.trim() });
    return db.org;
  });

export const updateSuspectThreshold = (threshold: Organization["suspectThreshold"]) =>
  mutate((db) => {
    db.org.suspectThreshold = threshold;
    return db.org;
  });

/** Bật/tắt nguyên tắc 4 mắt (chỉ Quản trị / Chủ sở hữu). */
export const updateFourEyes = (enabled: boolean) =>
  mutate((db) => {
    const role = db.members.find((m) => m.id === db.currentUserId)?.role;
    if (role !== "OWNER" && role !== "ADMIN") throw new ApiError("FORBIDDEN", "Cần vai trò Quản trị hoặc Chủ sở hữu");
    db.org.fourEyes = enabled;
    return db.org;
  });

export const listMembers = () => query((db) => db.members);

export const inviteMember = (input: { email: string; role: Role }) =>
  mutate((db) => {
    const email = input.email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new ApiError("VALIDATION", "Email không hợp lệ");
    if (db.members.some((m) => m.email === email)) throw new ApiError("DUPLICATE", "Email này đã là thành viên");
    if (input.role === "OWNER") throw new ApiError("FORBIDDEN", "Không thể mời với vai trò Chủ sở hữu");
    const name = email.split("@")[0]!.replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    const m: Member = { id: newId("usr"), name, email, role: input.role, status: "INVITED" };
    db.members.push(m);
    return m;
  });

export const changeMemberRole = (id: string, role: Role) =>
  mutate((db) => {
    const m = db.members.find((x) => x.id === id);
    if (!m) throw new ApiError("NOT_FOUND", "Không tìm thấy thành viên");
    if (m.role === "OWNER") throw new ApiError("FORBIDDEN", "Muốn đổi Chủ sở hữu phải chuyển quyền sở hữu");
    if (role === "OWNER") throw new ApiError("FORBIDDEN", "Dùng chức năng chuyển quyền sở hữu");
    m.role = role;
    return m;
  });

export const setMemberDisabled = (id: string, disabled: boolean) =>
  mutate((db) => {
    const m = db.members.find((x) => x.id === id);
    if (!m) throw new ApiError("NOT_FOUND", "Không tìm thấy thành viên");
    if (m.id === db.currentUserId) throw new ApiError("FORBIDDEN", "Không thể tự khóa tài khoản của mình");
    if (m.role === "OWNER") throw new ApiError("FORBIDDEN", "Không thể khóa Chủ sở hữu");
    m.status = disabled ? "DISABLED" : "ACTIVE";
    return m;
  });

export const listIntegrations = () => query((db) => db.integrations);

/** Mô phỏng gọi thử: hscodepro/AI luôn OK; Customs Hub lỗi khi chứng thư mặc định còn < 30 ngày; HĐĐT chưa cấu hình. */
export const testIntegration = (id: Integration["id"]) =>
  mutate((db) => {
    const it = db.integrations.find((x) => x.id === id);
    if (!it) throw new ApiError("NOT_FOUND", "Không tìm thấy kết nối");
    it.lastCheckedAt = nowIso();
    if (id === "CUSTOMS_HUB") {
      const def = db.certificates.find((c) => c.isDefault);
      const days = def ? (new Date(def.validTo).getTime() - Date.now()) / 86_400_000 : -1;
      if (days >= 30 && !db.vnaccsAccount) {
        it.status = "ERROR";
        it.detail = "Chưa nhập tài khoản VNACCS – bấm \"Nhập tài khoản VNACCS\" trên thẻ này.";
      } else if (days >= 30) {
        it.status = "CONNECTED";
        it.detail = `Ký thử thành công bằng chứng thư ${def!.issuer} · môi trường sandbox`;
      } else {
        it.status = "ERROR";
        it.detail = def ? "Chứng thư số mặc định sắp hết hạn – Customs Hub từ chối ký thử (mã E-CERT-EXPIRING)." : "Chưa chọn chứng thư số mặc định.";
      }
    } else if (it.status === "NOT_CONFIGURED") {
      throw new ApiError("NOT_CONFIGURED", "Kết nối chưa được cấu hình – liên hệ quản trị KhaiBáo AI để bật");
    } else {
      it.status = "CONNECTED";
    }
    return it;
  });

/** Tài khoản VNACCS: mock chỉ giữ User ID/Terminal ID – mật khẩu và terminal key không lưu ở trình duyệt. */
const NO_VNACCS: VnaccsAccount = { configured: false, userId: null, terminalId: null, updatedAt: null };
const requireManager = (db: { members: Member[]; currentUserId: string }) => {
  const role = db.members.find((m) => m.id === db.currentUserId)?.role;
  if (role !== "OWNER" && role !== "ADMIN") throw new ApiError("FORBIDDEN", "Cần vai trò Quản trị hoặc Chủ sở hữu");
};
export const getVnaccsAccount = () => query((db): VnaccsAccount => (db.vnaccsAccount ? { configured: true, ...db.vnaccsAccount } : NO_VNACCS));
export const saveVnaccsAccount = (input: VnaccsAccountInput) =>
  mutate((db): VnaccsAccount => {
    requireManager(db);
    const parsed = VnaccsAccountInputSchema.safeParse(input);
    if (!parsed.success) throw new ApiError("VALIDATION", parsed.error.issues.map((i) => i.message).join("; "));
    db.vnaccsAccount = { userId: parsed.data.userId, terminalId: parsed.data.terminalId, updatedAt: nowIso() };
    return { configured: true, ...db.vnaccsAccount };
  });
export const removeVnaccsAccount = () =>
  mutate((db): VnaccsAccount => {
    requireManager(db);
    db.vnaccsAccount = null;
    return NO_VNACCS;
  });

/** Mặc định khai báo (mock): kiểm như máy chủ ở mức cơ bản (quyền, mã cho phép, độ dài mã kho, chỉ tiêu khóa). */
export const getDeclarationProfile = (direction: DeclarationDirection) =>
  query((db): DeclarationProfile => db.declarationProfiles[direction] ?? { direction, values: {}, overrides: {}, updatedAt: null });
export const saveDeclarationProfile = (direction: DeclarationDirection, input: DeclarationProfileInput) =>
  mutate((db): DeclarationProfile => {
    requireManager(db);
    const parsed = DeclarationProfileInputSchema.safeParse(input);
    if (!parsed.success) throw new ApiError("VALIDATION", parsed.error.issues.map((i) => i.message).join("; "));
    for (const code of Object.keys(parsed.data.values)) if (!(PROFILE_FIELD_CODES as readonly string[]).includes(code)) throw new ApiError("VALIDATION", `Không đặt mặc định cho chỉ tiêu ${code}`);
    const kho = parsed.data.values["KHO"]?.split(/\s+[–-]\s+/)[0];
    if (kho && kho.length > 7) throw new ApiError("VALIDATION", "KHO: mã tối đa 7 ký tự");
    const rules = mockRules(direction);
    for (const [code, o] of Object.entries(parsed.data.overrides)) {
      const r = rules.find((x) => x.code === code);
      if (!r || r.locked) throw new ApiError("FORBIDDEN", `Chỉ tiêu ${code} không cho phép doanh nghiệp đổi nguồn`);
      if ("fixed" in o && !r.allowFixed) throw new ApiError("VALIDATION", `${r.label}: không cho phép giá trị cố định`);
      if ("sources" in o && o.sources.some((id) => !r.sources.some((s) => s.id === id))) throw new ApiError("VALIDATION", `${r.label}: nguồn không được phép`);
    }
    const values = Object.fromEntries(Object.entries(parsed.data.values).filter(([, v]) => v.trim()));
    db.declarationProfiles[direction] = { direction, values, overrides: parsed.data.overrides, updatedAt: nowIso() };
    return db.declarationProfiles[direction]!;
  });
export const listDeclarationRules = (direction: DeclarationDirection) => query((): RuleOptionView[] => mockRules(direction));

export const listCertificates = () => query((db) => db.certificates);

export const setDefaultCertificate = (id: string) =>
  mutate((db) => {
    if (!db.certificates.some((c) => c.id === id)) throw new ApiError("NOT_FOUND", "Không tìm thấy chứng thư");
    db.certificates.forEach((c) => (c.isDefault = c.id === id));
  });

export const addCertificate = (input: { issuer: string; serial: string; validTo: string }) =>
  mutate((db) => {
    if (!input.serial.trim()) throw new ApiError("VALIDATION", "Nhập số serial chứng thư");
    if (!input.validTo) throw new ApiError("VALIDATION", "Chọn ngày hết hạn");
    const c: DigitalCertificate = {
      id: newId("cert"),
      subject: db.org.name,
      issuer: input.issuer,
      serial: input.serial.trim().toUpperCase(),
      validTo: input.validTo,
      isDefault: db.certificates.length === 0,
    };
    db.certificates.push(c);
    return c;
  });

export const removeCertificate = (id: string) =>
  mutate((db) => {
    const c = db.certificates.find((x) => x.id === id);
    if (!c) throw new ApiError("NOT_FOUND", "Không tìm thấy chứng thư");
    if (c.isDefault) throw new ApiError("FORBIDDEN", "Chọn chứng thư mặc định khác trước khi xóa");
    db.certificates = db.certificates.filter((x) => x.id !== id);
  });
