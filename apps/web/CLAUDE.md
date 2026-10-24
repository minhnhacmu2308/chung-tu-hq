# apps/web – Next.js (App Router)

## Nguồn dữ liệu: mock hoặc backend thật

Chọn bằng `NEXT_PUBLIC_DATA_SOURCE` trong `.env` gốc: `mock` (mặc định – dữ liệu giả trong trình duyệt, dùng cho demo Vercel và PM) hoặc `http` (gọi backend qua route handler). Màn hình không biết đang dùng nguồn nào.

```
src/app/            routing + page mỏng (chỉ render component của feature)
src/app/api/**      route handler MỎNG: session → parse Zod (@kb/contracts) → use case (@kb/core/modules/*) → map DomainError
src/container.ts    composition root – nơi DUY NHẤT nối @kb/core infrastructure (DB, Redis, queue); depcruise chặn chỗ khác
src/features/<f>/   màn hình + logic giao diện của từng chức năng
src/api/*.ts        hàm lấy/ghi dữ liệu + queryKeys; chọn mock|http bằng pick() (src/lib/data-source.ts)
src/api/http/*.ts   hiện thực gọi backend qua src/lib/http.ts (đã có: session, settings, dossiers, ocr, skills, declaration, customs)
src/lib/server/     route() wrapper (map lỗi → HTTP), requireSession() (cookie kb_session → Ctx), cookies
src/proxy.ts        chặn trang chưa đăng nhập khi NEXT_PUBLIC_DATA_SOURCE=http (chuyển về /login?next=)
src/mocks/api/*.ts  hiện thực mock (giữ nguyên chữ ký với http)
src/mocks/types.ts  re-export kiểu từ @kb/contracts + nhãn tiếng Việt
src/mocks/seed/*    dữ liệu mẫu – sửa ở đây để đổi nội dung demo
src/lib/format.ts   MỌI định dạng số/tiền/ngày
src/components/common/  thành phần riêng của app, chỉ ghép từ @kb/ui
```

- Màn hình KHÔNG import `src/mocks/db`, `src/mocks/seed`, `src/mocks/api`; chỉ gọi `src/api/*` qua `useQuery`/`useMutation` (depcruise chặn).
- Kiểu dữ liệu: dùng `@kb/contracts` (Zod). Không khai báo lại kiểu trong `apps/web`.
- Mock mô phỏng tiến trình bằng thời gian; backend thật đẩy tiến trình qua SSE `/api/dossiers/:id/events` (màn upload hiện poll 1s). Upload nhận `File[]` ở cả mock lẫn http.
- Route đã có: `auth/*`, `org/*`, `notifications`, `dossiers/**` (hồ sơ, chứng từ, SSE, trường, luật, hoàn tất đọc), `documents/:id/*`, `fields/:id/*`, `skills/**` (danh sách, POST tạo skill mới, trường → phiên bản mới, mẫu, xác nhận, đánh giá), `dossiers/:id/agent-run` (GET/POST), `dossiers/:id/line-items`, `hs-catalog?q=`, `line-items/:id/hs/confirm` (POST/DELETE), `line-items/:id/hs/answer` (trả lời câu hỏi AI phân loại HS), `line-items/:id/hs/reclassify`, `dossiers/:id/declaration` (+ `fields/:code` PATCH, `approve` POST), `dossiers/:id/move-to-review`, `dossiers/:id/submission` (GET/POST truyền, `resend` POST), `dossiers/:id/declaration/reopen` (mở lại tờ khai đã duyệt/bị FPT từ chối), `dossiers/:id/post-amendment` (GET bản khai bổ sung AMA + `fields` PATCH, `lines` POST, `lines/:lineId` DELETE, `approve` POST), `customs/declarations`, `org/vnaccs-account` (GET/PUT/DELETE – tài khoản VNACCS, không trả mật khẩu), `org/declaration-profile/:dir` (GET/PUT Mặc định khai báo + ghi đè), `org/declaration-rules/:dir`, `dossiers/:id/document-sheets` + `dossiers/:id/export.xlsx` (bảng đọc chứng từ), `org/products` (danh mục hàng hóa: GET/POST, `[id]` PUT/DELETE, `import` POST, `delete` POST xóa nhiều), `org/mailbox` (GET tổng quan hộp thư đã kết nối, `connect` POST → URL OAuth, `connections/:id` DELETE gỡ / PUT lưu bộ lọc, `sync` POST lấy thư), `mailbox/oauth/callback` (callback Google/Microsoft → về Cài đặt › Tích hợp), `org/inbox` (GET hộp thư chứng từ, `add` POST xếp file vào hồ sơ, `:id/status` PUT bỏ qua/khôi phục, `attachments/:id/file` GET xem file – ADR 0007), `admin/**` (khu Quản trị hệ thống, gồm `admin/exchange-rates` GET/PUT tỷ giá tính thuế). Chưa có: dashboard (GĐ 6).
- Dữ liệu mock lưu localStorage; menu người dùng → "Khôi phục dữ liệu mẫu". Đổi cấu trúc seed → tăng `DB_VERSION` trong `src/mocks/db.ts`.
- E2E: `pnpm test:e2e` (Playwright, `apps/web/e2e/`, cần server http + worker đang chạy; đăng nhập qua `global-setup` lưu cookie vào `e2e/.auth/`).
- Phân loại HS qua HTTP (HSCodePro giả lập trong fpt-mock): worker `HS_CLASSIFIER=hscodepro HSCODEPRO_URL=http://localhost:7070 HSCODEPRO_INTERNAL_KEY=dev-hs-key`; e2e `E2E_HS=hscodepro pnpm test:e2e hscodepro`.
- Truyền Hải quan qua HTTP thật (dev): `pnpm fpt-mock` + web/worker với `CUSTOMS_GATEWAY=fpt` (xem `apps/fpt-mock/README.md`); e2e `E2E_CUSTOMS_GATEWAY=fpt pnpm test:e2e vnaccs-fpt`.
- Chạy: `pnpm dev` ở gốc (compose + migrate + web + worker) hoặc `pnpm dev:web` (cổng 3100, chỉ web). Dùng webpack (`--webpack`) vì `@kb/ui` import kiểu `./x.js` mà Turbopack chưa hỗ trợ.
- `/api/health` = readiness (Postgres + Redis + kho lưu file, mỗi phép thử ≤ 3 s; kèm số worker để thông tin); `/api/health?probe=live` = liveness (không chạm hạ tầng).
- PWA (cài thành ứng dụng máy tính): `src/app/manifest.ts` + `public/icons/` (icon 192/512/maskable dựng từ `app/icon.svg`); `src/features/pwa/` bắt `beforeinstallprompt` ở cấp module (`useInstallApp`). Thêm file tĩnh mới ở gốc → thêm vào `matcher` của `src/proxy.ts` để không bị chặn khi chưa đăng nhập.
- Trang lỗi: `components/common/error-screen.tsx` (404 / 500 / 502 / lỗi màn hình; `errorKindOf(error)` phân loại theo `ApiError.status`, mất mạng → 502, lỗi dựng ở máy chủ có `digest` → 500 kèm mã tham chiếu) dùng trong `app/not-found.tsx`, `app/error.tsx`, `app/global-error.tsx`, `(app)/error.tsx`, `(admin)/error.tsx`. Khi web không chạy, reverse proxy trả trang tĩnh `public/errors/502.html` (tự đủ, tự thử lại sau 20 giây) – Caddy: `handle_errors 502 503 504 { root * /srv/errors; rewrite * /502.html; file_server }` với thư mục `public/errors` gắn vào `/srv/errors`.
- Bảng lọc từ ngoài (tab/nút nhóm, khoảng ngày): truyền `filtered` + `onClearFilters` cho `DataTable` để bảng rỗng hiện "Không có kết quả phù hợp" thay cho "chưa có dữ liệu".
- Đăng nhập thật (chế độ http): tài khoản seed `chau.le@anphat-demo.vn / demo1234`. Email dev in ra log (`MAIL=console`) hoặc Mailpit `localhost:8025` (`MAIL=smtp`).

## Khu Quản trị hệ thống (`/admin`)

Back-office của đội vận hành KhaiBáo AI – nhìn xuyên doanh nghiệp, **chỉ số liệu tổng hợp** (không nội dung hồ sơ/chứng từ). Thiết kế: `docs/superpowers/specs/2026-10-14-admin-backoffice-design.md`.

- Dùng chung trang `/login`; quyền quản trị gắn theo tài khoản (3 vai trò: `STAFF_PERMISSIONS` trong `@kb/contracts`), không phải vai trò trong doanh nghiệp.
- Mã nằm gọn ở `src/app/(admin)`, `src/features/admin`, `src/api/admin.ts` (+ `api/http/admin.ts`), `src/mocks/admin`. Backend: route `src/app/api/admin/**` → module `@kb/core/modules/admin` (role DB `kb_platform`, ADR 0006). Mọi API quản trị qua `requireStaff()` (`lib/server/admin-auth.ts`): phiên + quyền quản trị + đã qua 2FA (`MFA_REQUIRED` khi chưa). `AdminShell` hiện `MfaGate` (thiết lập / nhập mã) khi `session.mfa.verified` = false.
- Tài khoản quản trị seed (chế độ http, mật khẩu `demo1234`): `bao.hoang@`, `trang.mai@`, `viet.dinh@khaibao-demo.vn`. E2E: `global-setup` tự qua 2FA cho bao, lưu khóa ở `e2e/.auth/bao-totp.txt`.
- Thao tác ghi: dùng `ReasonDialog` (bắt nhập lý do) + `useAdminMutation`; ẩn nút bằng `useAdminSession().can(quyền)`; nghiệp vụ mock ở `mocks/admin/ops.ts` phải gọi `actor(db, quyền)` và `log(...)`, có test trong `ops.test.ts`.
- `features/admin` không import màn hình của khách và ngược lại (depcruise chặn).

## Route handler (backend)

- Mỗi route trong `src/app/api/**/route.ts`: `requireSession()` → parse input bằng schema `@kb/contracts` → gọi use case qua `@kb/core/modules/<m>` → trả JSON; `DomainError.code` map sang HTTP (`NOT_FOUND` 404, `FORBIDDEN` 403, `RATE_LIMITED` 429, còn lại 409/422); trả `{code, message, reason?, params?}` (`reason` = mã lý do để giao diện dịch); lỗi Zod → 400 `{code:"VALIDATION", issues}`.
- `route()` tự gắn `x-request-id` cho mọi phản hồi (lỗi 500 trả `requestId`), chặn request ghi có `Origin` khác host (403 `CSRF`) và ghi log JSON qua `createLogger` – không `console.*` trong route. Header bảo mật đặt ở `next.config.ts`; `src/instrumentation.ts` kiểm env lúc khởi động (chế độ http).
- Không nghiệp vụ trong route. Gọi ngoài (AI, FPT) luôn qua job (`container.queue`).
- Form: react-hook-form + `zodResolver(schema từ @kb/contracts)`.

## Luôn đúng (cả prototype)

- UI: CHỈ dùng `@kb/ui` (+ `components/common` ghép từ @kb/ui). Không mã màu, không màu Tailwind mặc định, không `dark:`, không giá trị tùy ý (`w-[123px]`), không `style={{}}`, không `<button>/<input>` thô – `pnpm lint` chặn. Thiếu component/biến thể → thêm vào `packages/ui` (skill `adding-ui-component`).
- Đổi màu/font/bo góc toàn hệ thống: KHÔNG sửa từng màn – sửa token (`packages/ui/src/styles/tokens.css`) hoặc mặc định giao diện (`packages/ui/src/theme/appearance.ts`).
- Số/tiền/ngày: chỉ qua `src/lib/format.ts`. Tiền là chuỗi thập phân, không cộng bằng `number`.
- **3 ngôn ngữ (vi / en / zh – giản thể)**: không viết cứng chữ hiển thị. Nhãn đặt trong `*.messages.ts` cạnh component bằng `defineMessages({ vi, en, zh })` (thiếu khóa ở một ngôn ngữ là lỗi TypeScript), dùng `const t = useMessages(M)` + `fill(t.x, { n })`; hàm thuần nhận `locale` và dùng `pickMessages(M, locale)`. Bản `vi` là chuẩn – test tìm theo chữ tiếng Việt. Nội dung pháp lý chỉ có tiếng Việt (bản in tờ khai VNACCS) đặt trong `*.vi.ts`. Không dịch dữ liệu nghiệp vụ, tên chỉ tiêu từ `@kb/contracts`. Lý do khóa/chặn và lỗi backend: server KHÔNG dịch mà gửi kèm mã ổn định (`reasonCode`/`reasonParams` trên dòng nghiệp vụ, `reason`/`params` trên lỗi – `@kb/contracts` reason-codes); giao diện hiển thị qua `rowReason`/`reasonText`/`errorText` (`lib/reason-codes.ts`, bộ nhãn `lib/reason-codes.messages.ts`), mã lạ thì giữ câu tiếng Việt của server. Thêm mã mới: thêm vào `REASON_TEXT_VI` + bộ nhãn (TypeScript báo thiếu), lỗi backend tạo bằng `reasonError(...)`. Lint `apps-hardcoded-text` chặn chữ tiếng Việt có dấu ngoài các file trên. Ngôn ngữ lưu trong cấu hình giao diện (`appearance.locale`); đổi ngôn ngữ thì cả cây dựng lại, `lib/format.ts` định dạng số/ngày theo ngôn ngữ đó.
- Mỗi màn bất đồng bộ có loading, empty, error. Có giao diện mobile (~400px) và chế độ tối.
- `exactOptionalPropertyTypes` bật: truyền prop tùy chọn bằng spread có điều kiện, không truyền `undefined`.

Làm màn hình mới → dùng skill `building-frontend-feature`.
