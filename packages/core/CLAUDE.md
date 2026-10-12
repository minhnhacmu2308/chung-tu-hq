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
