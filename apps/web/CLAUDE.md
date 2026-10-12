# apps/web – Next.js (App Router)

## Giai đoạn hiện tại: PROTOTYPE chạy dữ liệu giả (mock)

Chưa có backend. Mọi dữ liệu đến từ `src/mocks/` qua lớp `src/api/*`. Khi có backend chỉ thay **thân hàm** trong `src/api/*.ts` – màn hình không phải sửa.

```
src/app/            routing + page mỏng (chỉ render component của feature)
src/features/<f>/   màn hình + logic giao diện của từng chức năng
src/api/*.ts        hàm lấy/ghi dữ liệu (mock) + queryKeys cho TanStack Query
src/mocks/types.ts  kiểu dữ liệu dùng chung (giữ khi lên backend thật)
src/mocks/seed/*    dữ liệu mẫu – sửa ở đây để đổi nội dung demo
src/lib/format.ts   MỌI định dạng số/tiền/ngày
src/components/common/  thành phần riêng của app, chỉ ghép từ @kb/ui
```

- Màn hình KHÔNG import `src/mocks/db` hay `src/mocks/seed`; chỉ gọi `src/api/*` qua `useQuery`/`useMutation`.
- Mô phỏng tiến trình (upload, AI đọc, agent, truyền Hải quan) bằng thời gian: lưu thời điểm bắt đầu, tính tiến độ khi đọc, màn hình `refetchInterval`.
- Dữ liệu mẫu lưu localStorage; menu người dùng → "Khôi phục dữ liệu mẫu". Đổi cấu trúc seed → tăng `DB_VERSION` trong `src/mocks/db.ts`.
- Chạy: `pnpm dev:web` (cổng 3100). Dùng webpack (`--webpack`) vì `@kb/ui` import kiểu `./x.js` mà Turbopack chưa hỗ trợ.

## Khi có backend (đích đến)

- Đọc dữ liệu: Server Component gọi `features/<f>/queries.ts` → use case qua `@kb/core/modules/<m>`.
- Ghi dữ liệu: Server Action trong `features/<f>/actions.ts`: lấy session → parse Zod (`@kb/contracts`) → gọi use case → map `DomainError.code` sang thông báo tiếng Việt.
- Dữ liệu thay đổi liên tục (tiến trình job): hook SSE / TanStack Query trong `features/<f>/hooks/`.
- Form: react-hook-form + `zodResolver(schema từ @kb/contracts)`.

## Luôn đúng (cả prototype)

- UI: CHỈ dùng `@kb/ui` (+ `components/common` ghép từ @kb/ui). Không mã màu, không màu Tailwind mặc định, không `dark:`, không giá trị tùy ý (`w-[123px]`), không `style={{}}`, không `<button>/<input>` thô – `pnpm lint` chặn. Thiếu component/biến thể → thêm vào `packages/ui` (skill `adding-ui-component`).
- Đổi màu/font/bo góc toàn hệ thống: KHÔNG sửa từng màn – sửa token (`packages/ui/src/styles/tokens.css`) hoặc mặc định giao diện (`packages/ui/src/theme/appearance.ts`).
- Số/tiền/ngày: chỉ qua `src/lib/format.ts`. Tiền là chuỗi thập phân, không cộng bằng `number`.
- Mỗi màn bất đồng bộ có loading, empty, error. Có giao diện mobile (~400px) và chế độ tối.
- `exactOptionalPropertyTypes` bật: truyền prop tùy chọn bằng spread có điều kiện, không truyền `undefined`.

Làm màn hình mới → dùng skill `building-frontend-feature`.
