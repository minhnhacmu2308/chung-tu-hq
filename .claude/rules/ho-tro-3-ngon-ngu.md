---
paths:
  - "apps/web/**/*.ts"
  - "apps/web/**/*.tsx"
  - "packages/ui/**/*.tsx"
  - "packages/contracts/src/reason-codes.ts"
---

# Rule: mọi tính năng phải có đủ 3 ngôn ngữ (vi / en / zh)

Giao diện KhaiBáo AI có 3 ngôn ngữ: **tiếng Việt (chuẩn), tiếng Anh, tiếng Trung giản thể**. Người dùng đổi ngôn ngữ ở menu người dùng → cả app phải đổi theo, không còn sót chữ nào.

**Tính năng mới, màn mới, popup, toast, thông báo lỗi, email trong app… chưa có đủ 3 bản = chưa xong.** Không có ngoại lệ "làm tiếng Việt trước, dịch sau". Reviewer từ chối PR thiếu bản dịch.

## 1. Bắt buộc

1. **Không viết cứng chữ hiển thị** – kể cả tiếng Anh, viết tắt ("MST", "Email"), nhãn nút, placeholder, `aria-label`, `title`, tooltip, nội dung toast, câu báo lỗi.
2. **Nhãn đặt trong file `*.messages.ts` cạnh component**, khai báo bằng `defineMessages({ vi, en, zh })` (thiếu khóa ở một ngôn ngữ là lỗi TypeScript):
   ```ts
   // features/x/x.messages.ts
   export const X_MESSAGES = defineMessages({
     vi: { title: "Hồ sơ khai báo", count: "{n} hồ sơ" },
     en: { title: "Declaration dossiers", count: "{n} dossiers" },
     zh: { title: "申报档案", count: "{n} 份档案" },
   });
   // x.tsx
   const t = useMessages(X_MESSAGES);
   <PageHeader title={t.title} />  ·  fill(t.count, { n })
   ```
   Hàm thuần (không phải component) nhận `locale` và dùng `pickMessages(X_MESSAGES, locale)`.
3. **Dịch thật, đủ cả 3 bản.** Bản `en`/`zh` không được rỗng, không được chép nguyên câu tiếng Việt. Biến `{n}`, `{name}`… phải giống nhau ở cả 3 bản.
4. **Số, tiền, ngày** chỉ qua `src/lib/format.ts` (tự định dạng theo ngôn ngữ đang chọn). Không tự `toLocaleString("vi-VN")`.
5. **Lỗi và lý do khóa từ backend**: server không dịch mà gửi mã ổn định (`reason`/`params` trên lỗi, `reasonCode`/`reasonParams` trên dòng nghiệp vụ – `@kb/contracts` reason-codes). Giao diện hiển thị qua `errorText` / `reasonText` / `rowReason` (`lib/reason-codes.ts`). Thêm mã mới: thêm vào `REASON_TEXT_VI` và bộ nhãn `lib/reason-codes.messages.ts` (đủ 3 ngôn ngữ).
6. **Component dùng chung trong `@kb/ui`** có nhãn mặc định 3 ngôn ngữ ngay trong component (bộ `MESSAGES` + `useMessages(MESSAGES, labels)`), cho phép app ghi đè qua prop `labels`.
7. **Kiểm tra trên trình duyệt** cả 3 ngôn ngữ trước khi báo xong: chữ Anh dài hơn và chữ Trung ngắn hơn tiếng Việt → nút, bảng, thẻ không được vỡ hay tràn (desktop + mobile ~400px).

## 2. Không dịch

- **Dữ liệu nghiệp vụ** do người dùng nhập hoặc lấy từ chứng từ: tên công ty, hàng hóa, mã HS, số tờ khai…
- **Tên chỉ tiêu tờ khai** và danh mục mã của Hải quan trong `@kb/contracts` (giữ đúng tên pháp lý).
- **Nội dung pháp lý chỉ có tiếng Việt** (bản in tờ khai VNACCS): đặt trong file `*.vi.ts`.
- **Mã / ví dụ định dạng** (vd placeholder `BI820001`, `lc_no`, tên chứng từ in trên bản gốc): giữ nguyên, ghi rõ lý do bằng comment `kb-allow-raw: <lý do>` trên dòng hoặc dòng ngay trên.
- **Tên riêng** như `KhaiBáo AI`.

## 3. Máy chặn gì (CI đỏ là không merge)

| Kiểm tra | Bắt lỗi gì | Ở đâu |
|---|---|---|
| TypeScript | Bộ nhãn thiếu khóa ở một ngôn ngữ | `defineMessages` |
| `pnpm lint` – `apps-hardcoded-text` | Chữ tiếng Việt có dấu viết cứng ngoài `*.messages.ts` / `*.vi.ts` | `scripts/check-design-tokens.mjs` |
| `pnpm lint` – `apps-hardcoded-latin-text` | Chữ không dấu (tiếng Anh, viết tắt) viết cứng trong JSX hoặc prop hiển thị (`label`, `title`, `placeholder`, `aria-label`, `description`, `hint`, `alt`…) | `scripts/check-design-tokens.mjs` |
| `pnpm test` – bộ nhãn 3 ngôn ngữ | Bản `en`/`zh` rỗng, còn chữ tiếng Việt (chưa dịch), biến `{x}` lệch, khóa lệch | `apps/web/src/lib/i18n-catalogs.test.ts` |

Máy không bắt được hết (vd chuỗi trong biến rồi mới đưa vào JSX, bản dịch sai nghĩa) – người review vẫn phải đọc bản `en`/`zh`.

Tên riêng có dấu cần giữ nguyên trong bản `en`/`zh` → thêm vào `PROPER_NOUNS` của test (có lý do trong PR), không tắt test.

## 4. Checklist trước khi báo xong / mở PR

- [ ] Mọi chữ mới nằm trong `*.messages.ts`, có đủ `vi` / `en` / `zh`, đã dịch thật.
- [ ] Không thêm `kb-allow-raw` cho chữ hiển thị thật (chỉ dùng cho mã/ví dụ định dạng, có lý do).
- [ ] Lỗi/lý do mới từ backend có mã `reason` + nhãn 3 ngôn ngữ.
- [ ] Đã đổi ngôn ngữ sang English và 中文 trên trình duyệt, xem màn mới: không còn chữ Việt sót, không vỡ bố cục.
- [ ] `pnpm typecheck && pnpm lint && pnpm test` xanh.
