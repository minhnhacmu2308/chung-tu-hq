# Quy ước code

Quy tắc nào máy kiểm tra được thì đã cấu hình trong lint/depcruise/CI (cột **Ép bằng**). Phần còn lại review bằng mắt theo `.github/pull_request_template.md`.

## 1. Nghiệp vụ – không được vi phạm

| # | Quy tắc | Lý do | Ép bằng |
|---|---|---|---|
| B1 | Mọi truy vấn/ghi dữ liệu nghiệp vụ phải có `orgId`. Repo nhận `orgId` là tham số bắt buộc | Lộ dữ liệu giữa doanh nghiệp là lỗi nghiêm trọng nhất | Kiểu `OrgScoped<T>` + RLS Postgres + test cô lập org |
| B2 | Mã định danh (MST, MAWB, HAWB, số invoice, số C/O, số container, mã HS) luôn là `string` | Mất số 0 đầu, mất ký tự, tràn số | Zod schema trong `@kb/contracts` |
| B3 | Tiền và trị giá tính toán bằng `Decimal` (decimal.js), lưu Postgres `numeric`. Không cộng/nhân tiền bằng `number` | Sai số float khi tính thuế | Lint cấm `parseFloat` trong `declaration`, review |
| B4 | Ngày nghiệp vụ là chuỗi ISO `YYYY-MM-DD`; thời điểm là `timestamptz` UTC; chỉ format khi hiển thị | Lệch múi giờ, nhầm dd/MM và MM/dd | Zod + `lib/format` |
| B5 | AI chỉ được dùng trong module `extraction` (và gợi ý HS) qua port `AiProvider`. Đối chiếu, ánh xạ tờ khai, tính thuế, chặn truyền là code thuần | Phải deterministic, giải trình được với hải quan | depcruise cấm import SDK AI ngoài `extraction/infrastructure` |
| B6 | Giá trị người dùng sửa ghi vào `field_audit` (append-only), không ghi đè mất dấu vết | Truy vết + dữ liệu đo độ chính xác | Use case duy nhất `updateField` |
| B7 | Không truyền tờ khai khi còn validation `BLOCKER` = FAIL hoặc HS 8 số chưa xác nhận | Khai sai bị phạt | Guard trong `declaration.submit` + test |
| B8 | Mọi lần gọi AI ghi `usage_events` (org, model, input/output token, chi phí) | Tính gói, kiểm soát giá vốn | Wrapper `AiProvider` |
| B9 | Job queue phải idempotent: chạy lại cùng job không tạo dữ liệu trùng | Retry là bình thường | Khóa idempotency `(dossierId, documentHash, pipelineVersion)` |
| B10 | Prompt, schema trích xuất, model là có phiên bản; đổi phải chạy eval | Đổi 1 câu prompt có thể làm hỏng trường khác | Skill `changing-extraction-prompt-or-model` + CI eval offline |

## 2. Code TypeScript

- `strict: true`, cấm `any` (dùng `unknown` + Zod parse). Cấm `@ts-ignore`; nếu bắt buộc dùng `@ts-expect-error` kèm lý do.
- Dữ liệu từ ngoài (HTTP, form, AI, file, queue) **luôn** parse bằng Zod ở biên trước khi dùng.
- Lỗi nghiệp vụ dự kiến trả `Result<T, DomainError>` (không throw). Chỉ throw cho lỗi lập trình/hạ tầng. `DomainError` có `code` cố định để UI dịch sang tiếng Việt.
- Không import sâu: `import { x } from "@kb/core/modules/dossier"` (đúng), không `.../dossier/infrastructure/repo` (sai).
- Log phía server bằng `createLogger` (`@kb/core/shared`): JSON một dòng, kèm `requestId`/`jobId`/`orgId`/`dossierId`; không `console.*` trong route handler và worker; không bao giờ log khóa, token, mật khẩu (logger tự che theo tên khóa nhưng đừng dựa vào đó).
- Đặt tên: file `kebab-case.ts`, kiểu/Component `PascalCase`, hàm/biến `camelCase`, hằng `SCREAMING_SNAKE`. Use case đặt bằng động từ: `uploadDocuments`, `runValidation`.
- Thuật ngữ nghiệp vụ trong code dùng tiếng Anh thống nhất (xem bảng dưới); UI hiển thị tiếng Việt.

| Tiếng Việt | Trong code |
|---|---|
| Hồ sơ khai báo | `Dossier` |
| Chứng từ | `Document` |
| Lô hàng (dữ liệu gộp) | `Shipment` |
| Tờ khai | `Declaration` |
| Chỉ tiêu tờ khai | `DeclarationField` |
| Luật đối chiếu | `ValidationRule` |
| Doanh nghiệp | `Organization` (`orgId`) |
| Vận đơn (house nếu có, không thì vận đơn duy nhất) / master | `billNo` / `masterBillNo` (`houseBillNo` chỉ còn để đọc shipment cũ, không ghi) |

## 3. Frontend

- Component chỉ hiển thị; gọi dữ liệu qua `queries.ts` / `actions.ts` / hook của feature. Không `fetch` trực tiếp trong component.
- Mỗi màn bất đồng bộ có đủ: loading (khung tải đúng dáng: `PageLoading` / `Skeleton*`), empty (`EmptyState` + hành động tiếp theo), error (`LoadError` có nút thử lại).
- Mọi thao tác ghi (`useMutation`) có `onError` – không để thất bại trong im lặng. Thao tác dài báo bằng `toastPromise`.
- Trước khi viết JSX, tra bảng "Cần gì → dùng gì" trong skill `building-frontend-feature`; không tự dựng lại KPI, nhóm form, nhãn trạng thái, menu thao tác trên dòng.
- Số, tiền, ngày chỉ format qua `lib/format`. Không tự `toLocaleString` rải rác.
- Không nhân bản schema: form dùng schema Zod từ `@kb/contracts`.
- Chỉ dùng component `@kb/ui` + utility token (docs/DESIGN-SYSTEM.md). Thiếu thì thêm vào `@kb/ui`. Máy chặn bằng `pnpm lint` (`scripts/check-design-tokens.mjs` + depcruise).
- **3 ngôn ngữ (vi / en / zh) là bắt buộc** cho mọi chữ hiển thị mới – thiếu bản dịch là chưa xong. Nhãn trong `*.messages.ts` (`defineMessages` + `useMessages`). Xem `.claude/rules/ho-tro-3-ngon-ngu.md`.
- Test theo `docs/TESTING.md`.
- Truy cập bằng bàn phím được trên màn ocr-review và declaration-review.

## 4. Git & PR

- **Trước khi commit/push: chạy 2 agent `hq-review-backend` + `hq-review-frontend`**, cả hai PASS mới commit/push; mô tả commit/PR có khối `Review:` ghi kết quả 2 agent (`.claude/rules/review-truoc-commit.md`).
- Nhánh: `feat/…`, `fix/…`, `chore/…`. Commit theo Conventional Commits.
- PR nhỏ (< ~400 dòng thay đổi thực). Điền checklist trong PR template.
- Không merge khi CI đỏ. Không tắt rule lint để cho qua; nếu rule sai, sửa rule trong PR riêng có lý do.
