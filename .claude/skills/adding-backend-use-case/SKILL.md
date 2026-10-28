---
name: adding-backend-use-case
description: Use when adding a backend capability, API endpoint, server action, background job handler, or database table in this repo
---

# Thêm use case backend

## Nguyên tắc
Mọi hành vi nghiệp vụ là một **use case** trong `packages/core/src/modules/<module>/application/`. `apps/web` và `apps/worker` chỉ gọi use case – không chứa nghiệp vụ.

## Các bước
1. **Chọn module** theo bảng trong `docs/ARCHITECTURE.md`. Nghiệp vụ trải 2 module → use case nằm ở module sở hữu dữ liệu được GHI, gọi module kia qua `index.ts`.
2. **Contract** – input/output Zod trong `packages/contracts`.
3. **Domain** – logic thuần trong `domain/`, test trước.
4. **Port** – cần DB/AI/storage/queue mới → khai báo interface trong `application/ports.ts`.
5. **Use case** – `application/<verb-noun>.ts`, chữ ký `(deps, ctx: { orgId, userId }, input) → Result<T, DomainError>`. Kiểm quyền ở đây.
6. **Infrastructure** – hiện thực port. Repo: tham số `orgId` bắt buộc, mọi query `where org_id = $orgId`.
7. **DB** – bảng mới có `org_id not null`, index `(org_id, …)`, policy RLS; migration Drizzle trong cùng PR.
8. **Export** qua `index.ts`; nối dependency ở `apps/*/src/container.ts`.
9. **Entry point** – Server Action/route handler: session → parse Zod → gọi use case → map `DomainError.code` → HTTP/thông báo. Job: xem `apps/worker/CLAUDE.md`.
10. **Test** – domain (unit), use case (fake repo) gồm **1 test org khác bị từ chối**, repo (Testcontainers).

## Chọn kiểu lỗi

| Tình huống | Làm gì |
|---|---|
| Lỗi nghiệp vụ dự kiến (không tìm thấy, sai trạng thái, hết hạn mức) | `return err({ code: "..." })` |
| Input sai định dạng | Zod ở biên trả 400, không vào use case |
| Lỗi hạ tầng/lập trình | `throw` – để log + retry |

## Lỗi hay gặp
- Query thiếu `orgId` → rò dữ liệu giữa doanh nghiệp.
- Logic nghiệp vụ trong route handler/server action.
- Import `infrastructure` từ `apps/*` (ngoài `container.ts`) – depcruise sẽ chặn.
- Gọi AI/HTTP ngoài đồng bộ trong request web dài > vài giây → đưa vào job.
- Bảng mới thiếu RLS.
- Gọi port module khác / storage / HTTP **bên trong** `uow.asOrg(...)` → transaction giữ kết nối + khóa rồi chờ kết nối pool khác; nhiều request song song là treo cả web. Đọc trong transaction, gọi port sau khi đóng; ghi dòng nóng trong transaction ngắn riêng.
