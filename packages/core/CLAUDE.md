# packages/core – nghiệp vụ

Mỗi module: `domain/` (thuần) → `application/` (use case + `ports.ts`) → `infrastructure/` (hiện thực port) → `index.ts` (public API).

## Quy tắc tầng

- `domain/`: chỉ kiểu + hàm thuần. Không DB, HTTP, SDK AI, `Date.now()`, `Math.random()` (nhận `clock`/`idGen` qua tham số).
- `application/`: mỗi use case 1 file, nhận `(deps, orgId, input)`, trả `Result<T, DomainError>`. Kiểm quyền ở đây. Không import `infrastructure`.
- `infrastructure/`: chỉ hiện thực interface trong `ports.ts`. Repo luôn lọc theo `orgId`.
- `index.ts`: export use case + kiểu công khai. Không export repo/adapter.

## Mẫu use case

```ts
// application/confirm-field.ts
export async function confirmField(
  deps: { dossiers: DossierRepo; audit: FieldAuditRepo; clock: Clock },
  ctx: { orgId: OrgId; userId: UserId },
  input: ConfirmFieldInput,            // đã parse Zod ở biên
): Promise<Result<FieldState, DomainError>> {
  const dossier = await deps.dossiers.get(ctx.orgId, input.dossierId);
  if (!dossier) return err({ code: "DOSSIER_NOT_FOUND" });
  if (dossier.status === "SUBMITTED") return err({ code: "DOSSIER_LOCKED" });
  const next = applyFieldEdit(dossier.shipment, input);          // domain thuần
  await deps.audit.append(ctx.orgId, toAuditEntry(input, ctx, deps.clock.now()));
  return ok(next);
}
```

## Test bắt buộc

- Hàm `domain`: unit test, không mock.
- Use case: test với fake repo in-memory; có ít nhất 1 test **org khác không đọc/ghi được**.
- Repo: integration test với Testcontainers Postgres.

## DB (Drizzle + Postgres, RLS)

- Schema ở `src/db/schema/<module>.ts` (tên file = tên module); `shared.ts` có helper `id()`, `orgId()`, `timestamps()`, `money()`, `orgPolicyUsing`. Bảng nghiệp vụ: `orgId()` + index `(org_id, …)` + `pgPolicy(... to: appRole, using: orgPolicyUsing, withCheck: orgPolicyUsing)` + `.enableRLS()`.
- `modules/<m>/infrastructure` chỉ import `db/schema/<m>.ts` và `shared.ts` (depcruise `module-infra-own-schema`).
- Mọi truy vấn nghiệp vụ chạy trong `withCtx(db, { orgId, userId }, tx => …)`; đăng nhập/đăng ký dùng `withUser`. App kết nối bằng role `kb_app` (chịu RLS); migration/seed dùng `DATABASE_ADMIN_URL`.
- Đổi schema: sửa file → `pnpm --filter @kb/core db:generate` → đổi tên file SQL cho dễ đọc (và sửa `drizzle/meta/_journal.json`) → đọc SQL kiểm tra policy → `pnpm db:migrate`.
- Test repo: `*.int.test.ts` dùng `startTestDb()` (`src/db/test-db.ts`, Testcontainers) – Postgres thật, có RLS. Mỗi repo ≥ 1 test org khác không thấy dữ liệu.
- Shared kernel `src/shared`: `Result/ok/err`, `DomainError/domainError`, id có brand (`OrgId`…), `Ctx + requireRole`, `Clock`, `Decimal/dec/toDecimalString/sumDec`, port `JobQueue`.
- Cấu hình: `loadEnv()` (`src/config/env.ts`) parse Zod, ném lỗi liệt kê biến thiếu; biến rỗng coi như không đặt.
