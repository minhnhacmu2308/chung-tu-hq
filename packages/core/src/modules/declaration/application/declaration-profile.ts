// Mặc định khai báo + ghi đè nguồn chỉ tiêu của doanh nghiệp (Cài đặt → Khai báo). Đọc: mọi thành viên; ghi: Quản trị / Chủ sở hữu.
import type { DeclarationDirection, DeclarationProfile, DeclarationProfileInput, RuleOptionView } from "@kb/contracts";
import { requireRole, type Ctx } from "../../../shared/ctx.js";
import { ok, type Result } from "../../../shared/result.js";
import { ruleOptionsView, validateOverrides } from "../domain/mapping/evaluate.js";
import { validateProfileValues } from "../domain/profile.js";
import type { DeclarationDeps, DeclarationRepos, ProfileRow } from "./ports.js";

const kindOf = (d: DeclarationDirection) => (d === "NK" ? "IDA" : "EDA");
const toDto = (direction: DeclarationDirection, row: ProfileRow | null): DeclarationProfile => ({
  direction, values: row?.values ?? {}, overrides: row?.overrides ?? {}, updatedAt: row ? row.updatedAt.toISOString() : null,
});

export async function getDeclarationProfile(deps: DeclarationDeps, ctx: Ctx, direction: DeclarationDirection): Promise<Result<DeclarationProfile>> {
  return ok(toDto(direction, await deps.uow.asOrg(ctx, (r) => r.profiles.get(ctx.orgId, direction))));
}

export async function saveDeclarationProfile(deps: DeclarationDeps, ctx: Ctx, direction: DeclarationDirection, input: DeclarationProfileInput): Promise<Result<DeclarationProfile>> {
  const allowed = requireRole(ctx, "ADMIN");
  if (!allowed.ok) return allowed;
  const values = Object.fromEntries(Object.entries(input.values).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v));
  const v1 = validateProfileValues(kindOf(direction), values);
  if (!v1.ok) return v1;
  // Ghi đè đã lưu từ trước mà nay không còn hợp lệ (quy tắc đổi: nguồn bị bỏ, chỉ tiêu bị khóa) → loại bỏ,
  // để không chặn mọi lần lưu sau. Ghi đè mới hoặc vừa sửa vẫn kiểm chặt.
  const stored = (await deps.uow.asOrg(ctx, (r) => r.profiles.get(ctx.orgId, direction)))?.overrides ?? {};
  const overrides = Object.fromEntries(Object.entries(input.overrides).filter(([code, o]) => {
    const unchanged = stored[code] !== undefined && JSON.stringify(stored[code]) === JSON.stringify(o);
    return !unchanged || validateOverrides(kindOf(direction), { [code]: o }).ok;
  }));
  const v2 = validateOverrides(kindOf(direction), overrides);
  if (!v2.ok) return v2;
  const row: ProfileRow = { id: deps.idGen.next("dec"), orgId: ctx.orgId, direction, values, overrides, updatedBy: ctx.userId, updatedAt: deps.clock.now() };
  await deps.uow.asOrg(ctx, (r) => r.profiles.upsert(row));
  return ok(toDto(direction, row));
}

/** Phạm vi cấu hình từng chỉ tiêu (thuần, không cần quyền đặc biệt). */
export function listRuleOptions(direction: DeclarationDirection): RuleOptionView[] {
  return ruleOptionsView(kindOf(direction));
}

/** Mặc định khai báo dùng khi dựng tờ khai (trong cùng transaction). */
export async function profileFor(r: DeclarationRepos, orgId: string, direction: DeclarationDirection): Promise<{ profile: Record<string, string>; overrides: ProfileRow["overrides"] }> {
  const row = await r.profiles.get(orgId, direction);
  return { profile: row?.values ?? {}, overrides: row?.overrides ?? {} };
}
