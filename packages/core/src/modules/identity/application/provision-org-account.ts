// Phục vụ khu Quản trị hệ thống (module admin gọi qua container): tạo hộ doanh nghiệp ký hợp đồng trực tiếp + tài khoản Chủ sở hữu.
// Việc ghi users/organizations/memberships vẫn thuộc identity.
import { randomBytes } from "node:crypto";
import { createLogger } from "../../../shared/log.js";
import { domainError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { generateTempPassword } from "../domain/password.js";
import type { IdentityDeps } from "./ports.js";

const log = createLogger({ name: "core" });

export type ProvisionOrgInput = {
  taxCode: string;
  name: string;
  address: string;
  planCode: string;
  owner: { email: string; name: string };
};

/**
 * Tạo doanh nghiệp (gói chọn sẵn, không qua dùng thử) + Chủ sở hữu đã xác thực email, đăng nhập bằng mật khẩu tạm và bị bắt đổi
 * ở lần đầu. Mật khẩu tạm chỉ trả về đây một lần – không lưu dạng đọc được. MST hoặc email đã có → lỗi (không gộp vào tài khoản cũ).
 */
export async function provisionOrgAccount(deps: IdentityDeps, input: ProvisionOrgInput): Promise<Result<{ orgId: string; userId: string; tempPassword: string }>> {
  const now = deps.clock.now();
  const tempPassword = generateTempPassword(deps.random ?? randomBytes);
  const passwordHash = await deps.hasher.hash(tempPassword);
  const created = await deps.uow.system(async (r) => {
    if (await r.orgs.findByTaxCode(input.taxCode)) return err(domainError("TAX_CODE_EXISTS", "Doanh nghiệp có MST này đã có trên hệ thống"));
    if (await r.users.findByEmail(input.owner.email)) return err(domainError("EMAIL_TAKEN", "Email này đã có tài khoản – dùng email khác cho Chủ sở hữu"));
    const userId = deps.idGen.next("usr");
    const orgId = deps.idGen.next("org");
    await r.users.insert({ id: userId, email: input.owner.email, passwordHash, name: input.owner.name, emailVerifiedAt: now, createdAt: now, mustChangePassword: true });
    await r.orgs.insert({
      id: orgId, taxCode: input.taxCode, name: input.name, address: input.address, phone: "", planCode: input.planCode,
      suspectThreshold: "BALANCED", fourEyes: false, createdAt: now, planStartedAt: now,
    });
    await r.memberships.insert({ id: deps.idGen.next("mem"), orgId, userId, role: "OWNER", status: "ACTIVE", invitedBy: null });
    return ok({ orgId, userId });
  });
  if (!created.ok) return created;
  if (deps.onOrgCreated) {
    try {
      await deps.onOrgCreated(created.value);
    } catch (e) {
      log.error("onOrgCreated lỗi – doanh nghiệp vẫn tạo xong, skill mẫu sẽ thiếu", { orgId: created.value.orgId, err: e });
    }
  }
  return ok({ ...created.value, tempPassword });
}
