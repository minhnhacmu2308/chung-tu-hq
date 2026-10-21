# KhaiBáo AI

SaaS đa doanh nghiệp: upload bộ chứng từ nhập/xuất khẩu → AI đọc → đối chiếu chéo → người duyệt → dựng tờ khai → truyền Hải quan.

Sản phẩm (luồng, màn hình, tích hợp): `docs/PRODUCT.md`. Quy trình nghiệp vụ toàn hệ thống theo code hiện tại: `docs/QUY-TRINH-NGHIEP-VU.md`. Kiến trúc chi tiết: `docs/ARCHITECTURE.md`. Quy ước đầy đủ: `docs/CONVENTIONS.md`. Quyết định: `docs/adr/`.

## Lệnh

```bash
pnpm dev            # web + worker + docker (postgres, redis, minio)
pnpm typecheck
pnpm lint           # design tokens + depcruise (ranh giới module, @kb/ui)
pnpm ui:playground  # xem toàn bộ component + bảng cấu hình giao diện
pnpm test           # vitest
pnpm eval           # golden set trích xuất, chế độ offline (fixtures)
pnpm eval --live    # gọi AI thật, tốn tiền – chỉ chạy khi đổi prompt/model
```

## Cấu trúc

- `apps/web` – Next.js, MỎNG. `apps/worker` – BullMQ, MỎNG. `apps/fpt-mock` – server giả lập FPT.VNACCS + HSCodePro (`pnpm fpt-mock`); dev/test KHÔNG gọi cổng FPT thật (production). Kiểm khói HSCodePro thật: `pnpm hscodepro:smoke`. Xem `apps/fpt-mock/README.md`.
- `packages/core/src/modules/<module>/{domain,application,infrastructure,index.ts}` – toàn bộ nghiệp vụ.
- `packages/contracts` – Zod schema dùng chung FE/BE.
- `packages/ui` – design system `@kb/ui`: token, component, theme. Xem `docs/DESIGN-SYSTEM.md`.
- Module chỉ được import qua `modules/<module>/index.ts`.

## Bất biến – không bao giờ vi phạm

1. Mọi truy vấn/ghi dữ liệu nghiệp vụ có `orgId`.
2. Mã định danh (MST, MAWB, HAWB, số invoice/C/O/container, HS) là `string`.
3. Tiền/trị giá tính bằng `Decimal`, không dùng `number`.
4. Ngày nghiệp vụ `YYYY-MM-DD`; thời điểm UTC.
5. AI chỉ đọc chứng từ và gợi ý HS, qua port `AiProvider`. Đối chiếu, ánh xạ tờ khai, thuế, chặn truyền là code thuần có test.
6. Người dùng sửa trường → ghi `field_audit` append-only.
7. Không truyền tờ khai khi còn BLOCKER FAIL hoặc HS chưa xác nhận.
8. Mọi lần gọi AI ghi `usage_events`.
9. Dữ liệu từ ngoài (HTTP, form, AI, file, queue) parse bằng Zod trước khi dùng.
10. Giao diện chỉ dùng component `@kb/ui` + utility token. Không mã màu, không màu Tailwind mặc định, không `dark:`, không giá trị tùy ý trong app. Thiếu gì thêm vào `@kb/ui`. Chi tiết và các lỗi hay gặp: `.claude/rules/dung-component-chung.md`.
11. Test theo `docs/TESTING.md`; component có test a11y (axe).
12. Giao diện 3 ngôn ngữ (vi/en/zh): không viết cứng chữ hiển thị – dùng `defineMessages` + `useMessages` (`apps/web/CLAUDE.md`).

## Skill dự án (`.claude/skills/`)

| Khi | Skill |
|---|---|
| Thêm loại chứng từ mới (Packing List, D/O, Seaway Bill…) | `adding-document-type` |
| Thêm/sửa luật đối chiếu | `adding-validation-rule` |
| Thêm use case / endpoint backend | `adding-backend-use-case` |
| Làm màn hình theo feature (ghép từ @kb/ui) | `building-frontend-feature` |
| Thiếu component/biến thể/token, sửa @kb/ui hoặc tùy chọn giao diện | `adding-ui-component` |
| Sửa prompt, schema trích xuất, đổi model AI | `changing-extraction-prompt-or-model` |
| Thêm/sửa ánh xạ sang chỉ tiêu tờ khai | `mapping-declaration-fields` |

## Trước khi báo "xong"

`pnpm typecheck && pnpm lint && pnpm test` phải xanh. Đổi gì liên quan trích xuất → chạy `pnpm eval` và ghi kết quả vào PR.

Đổi gì nhìn thấy được trên giao diện → mở bằng trình duyệt thật và đo/chụp (sáng + tối, desktop + mobile) trước khi báo xong; test jsdom không bắt được bố cục vỡ. Cách làm: skill `adding-ui-component`, mục "Kiểm tra bằng trình duyệt".
