# Thiết kế lại giao diện Sửa sau thông quan (AMA)

Ngày: 2026-10-20 · Trạng thái: đã duyệt hướng, chờ duyệt spec · Liên quan: `2026-10-19-ama-khai-bo-sung-sau-thong-quan-design.md` (nghiệp vụ, giữ nguyên)

## 1. Mục tiêu

AMA chỉ dùng khi tờ khai **đã thông quan** và người dùng **có nhu cầu sửa**. Giao diện phải gọn: người dùng đi hết Chọn dòng → Sửa → Duyệt → Khai AMA/AMC mà không phải tự đoán bước tiếp theo, không bị ngợp bởi chỉ tiêu bị khóa.

Thành công khi:
- Mọi thao tác AMA nằm ở **một chỗ** (bước 7), không nhảy qua lại bước 5 ↔ bước 6.
- Mỗi màn chỉ có **một nút chính** cho việc tiếp theo.
- Mặc định chỉ hiện thứ người dùng phải làm; chỉ tiêu khóa/ít dùng ẩn sau khối thu gọn.

Ngoài phạm vi: nghiệp vụ, API, DB, mock, luật khóa ô, công thức tính thuế (`@kb/contracts` post-amendment) – giữ nguyên.

## 2. Vấn đề của giao diện hiện tại

1. Bắt đầu ở bước 6 → sửa ở bước 5 (tab "Khai bổ sung AMA") → duyệt xong về bước 6 khai AMA → AMB lại về bước 5.
2. Tab lồng tab: 5 tab tờ khai gốc + 3 tab AMA; khung "Đã phê duyệt" của tờ khai gốc nằm trên, không liên quan.
3. Mở ra là tab Thông tin tờ khai ~30 chỉ tiêu, đa số khóa "Theo tờ khai gốc"; ô bắt buộc duy nhất (Mã lý do) chìm ở khối thứ 3; việc chính (chọn dòng) ở tab thứ hai.
4. Panel dòng hàng: lưới Trước và lưới Sau xếp chồng cho từng khối thuế – khó thấy ô nào đổi.

## 3. Thiết kế

### 3.1 Bước 7 "Sửa sau thông quan" trên thanh bước hồ sơ

- Thanh bước hồ sơ thêm bước 7 (`?step=post`), **chỉ hiện** khi giai đoạn Hải quan là `CLEARED` hoặc `POST_*`.
- Bước 7 là **khung nhìn giao diện**: `dossier.step` vẫn là `submit`, `StepIdSchema` không đổi, không migration. Trang chi tiết hồ sơ cho phép xem `post` khi điều kiện trên đúng (ngoại lệ cho luật "chỉ xem bước ≤ bước đang dở").
- Đầu bước 7: một dòng tóm tắt tờ khai gốc (chỉ đọc) + trạng thái bản khai + hạn:
  `TK 107621548840 · A11 · 03CE · thông quan 17/10/2026 · còn 54 ngày` · `Bản khai bổ sung lần 1 · Nháp`.
  Hạn = ngày cấp phép (`TK_IPD`) + 60 ngày (TT121 Điều 20). Quá hạn → huy hiệu cảnh báo, không chặn (Hải quan quyết định).
- Dưới là `Stepper` (`@kb/ui`) 4 bước nhỏ: **① Chọn dòng · ② Sửa nội dung · ③ Lý do & phê duyệt · ④ Khai Hải quan**. Bấm được vào bước đã qua; bước hiện tại suy ra từ trạng thái (§3.6).
- Chưa có bản khai (tờ khai `CLEARED`, chưa lập): bước 7 hiện `EmptyState` "Cần sửa sau thông quan?" + giải thích ngắn (tờ khai gốc giữ nguyên, hạn 60 ngày) + nút **Lập bản khai bổ sung** (gọi `startPostAmendment` – không cần hộp xác nhận riêng vì đã giải thích ngay trên màn).

### 3.2 ① Chọn dòng

- Danh sách checkbox các dòng tờ khai gốc (dòng · HS · mô tả), có "Chọn tất cả" khi > 1 dòng. Dòng đã có trong bản khai hiện đã tick và khóa (bỏ dòng làm ở ②).
- Nút chính: **Tiếp: sửa nội dung (n dòng)** → thêm dòng mới (`addPostAmendmentLines`) rồi sang ②. Không chọn dòng nào → nút tắt.

### 3.3 ② Sửa nội dung – bảng so sánh Trước | Sau

Mỗi dòng đã chọn là một thẻ thu gọn/mở được, xếp liền nhau trên cùng một trang (dòng đầu mở sẵn). Trong thẻ:

| Chỉ tiêu | Trước (gốc, chỉ đọc) | Sau (sửa được) |
|---|---|---|
| Mã số hàng hóa | `HAG_MKT` | `HAG_AKT` |
| Trị giá tính thuế | `HAG_MKB` | `HAG_AKB` |
| Số lượng · ĐVT | `HAG_MKQ` · `HAG_MKC` | `HAG_AKQ` · `HAG_AKC` |
| Thuế suất | `HAG_MKR` | `HAG_AKR` |
| Tiền thuế NK/XK | `HAG_MKA` | `HAG_AKA` (tự tính) + mức tăng/giảm |

- Ô Sau khác Trước được đánh dấu "đã đổi". Tiền thuế tự tính bằng `applyAmaLineEdit`; sửa tay thì hiện nút "Tự tính lại" ngay ô đó (giữ hành vi hiện tại).
- Khối thu gọn trong thẻ (`Disclosure`, đóng sẵn):
  - **Mô tả, xuất xứ, mã hàng** (`AMA_LINE_LAYOUT`) – tự mở nếu đã có ô đổi.
  - **Thuế và thu khác** – chỉ hiện loại đang có giá trị (slot 1–5), cùng dạng bảng so sánh; nút "Thêm thuế và thu khác".
- Đầu thẻ: `Dòng 1 · <mô tả ngắn>` + số ô đã đổi + nút phụ **Bỏ dòng**.
- Cuối trang: tổng thuế Trước → Sau (tăng/giảm). Có thay đổi chưa lưu → thanh dưới hiện **Lưu n thay đổi** / Hoàn tác; nút chính **Tiếp: lý do & phê duyệt** tắt khi còn thay đổi chưa lưu.
- Mobile (~390px): mỗi chỉ tiêu thành một thẻ nhỏ – nhãn, "Trước: …", rồi ô Sau.
- Dựng bằng `Grid` + `Field` (không `<table>` thô vì có ô nhập trong hàng).

### 3.4 ③ Lý do & phê duyệt

- Hiện sẵn: **Mã lý do khai bổ sung \*** (`TK_REC`), **Ghi chú sau khai bổ sung** (`TK_NTA`), dòng tóm tắt `2 dòng · 3 chỉ tiêu đổi · Thuế −2.400.000 VND`.
- `Disclosure` **Thông tin khác (không bắt buộc)**, đóng sẵn: các khối còn lại của `AMA_HEADER_LAYOUT` có ô sửa được (nộp thuế, ngân hàng trả thay, bảo lãnh, tỷ giá sau, người khai, hợp đồng gia công). Ô bắt buộc đã điền sẵn (`TK_TTC`, `TK_CHB`…) cũng ở đây. Có ô bắt buộc trống hoặc lỗi → tự mở và báo.
- Chỉ tiêu khóa theo tờ khai gốc (khối "Tờ khai cần bổ sung", ghi chú trước…) **không hiện ở đây** – đã có ở dòng tóm tắt đầu bước 7.
- Nút chính **Phê duyệt** (giữ hộp xác nhận hiện tại, nguyên tắc 4 mắt). Tắt khi: chưa có dòng, thiếu `TK_REC`, còn thay đổi chưa lưu, bị chặn 4 mắt (kèm lý do).
- Đã duyệt → sang ④.

### 3.5 ④ Khai Hải quan

- Dãy trạng thái gọn: `Khai tạm AMA ─ Khai chính thức AMC`.
- **Một nút chính** theo việc tiếp theo: `Ký số & khai tạm AMA` (Đã duyệt / sau gọi về đã duyệt lại) hoặc `Khai chính thức AMC` (đã khai tạm). Đang gửi → trạng thái chờ, nút tắt.
- Kết quả Hải quan (số tờ khai bổ sung `TK_SYN`, số thông báo, ngày đăng ký, tổng thuế tăng/giảm, cờ quá 60 ngày).
- Nút phụ **Gọi về sửa (AMB)** (chỉ khi đã khai tạm), có hộp xác nhận như hiện tại. Gọi về thành công → tự về ②.
- `Disclosure` **Thông điệp AMA/AMB/AMC (n)**, đóng sẵn.
- Sau AMC: bước 7 chỉ xem (mọi bước nhỏ khóa, xem được), huy hiệu "Đã khai chính thức", nút **Lập bản khai bổ sung lần 2**. `Disclosure` **Lịch sử bổ sung** liệt kê các lần trước (lần, ngày, số TK bổ sung, thuế tăng/giảm).
- Thao tác gửi dùng `performOperation` / `resendOperation` có sẵn (backend vẫn chặn sai thứ tự).

### 3.6 Bước nhỏ hiện tại (logic thuần `ama-wizard.ts`)

| Trạng thái bản khai | Bước mặc định |
|---|---|
| chưa có bản khai | màn "Cần sửa sau thông quan?" |
| `DRAFT`, chưa có dòng | ① |
| `DRAFT` / `RECALLED`, có dòng | ② |
| `APPROVED`, `PRE_DECLARED` | ④ |
| `REGISTERED` | ④ chỉ xem |

`?sub=` trên URL cho phép xem bước nhỏ đã qua; bước ① ② ③ ở trạng thái không sửa được thì chỉ xem.
Cũng trong file này: `changedKeys(line)` (ô Sau ≠ Trước), `amaDeadline(ipd, today)` (ngày còn lại, quá hạn), tóm tắt thay đổi cho ③.

### 3.7 Dọn chỗ cũ

- Bước 5 Review: bỏ tab "Khai bổ sung AMA" và mọi nhánh `hasAma`/`postEditing` chọn tab.
- Bước 6 Khai báo: lọc AMA/AMB/AMC khỏi danh sách nghiệp vụ hiển thị (vẫn giữ trong `customs-flow.ts`); bỏ hộp xác nhận "Bắt đầu sửa sau thông quan". Thêm thẻ nhỏ khi `CLEARED`/`POST_*`:
  - chưa có bản khai: "Cần sửa sau thông quan? Lập bản khai bổ sung →"
  - đang có: "Đang khai bổ sung lần n – <trạng thái> · Tiếp tục →"
  Cả hai dẫn sang `?step=post`.
- Xóa `post-amendment-panel.tsx`, `ama-line-panel.tsx` sau khi chuyển phần dùng lại (AddLineForm, cột tóm tắt).

## 4. Cấu trúc file

```
apps/web/src/features/post-amendment/
  post-amendment-step.tsx   khung bước 7: tóm tắt, Stepper nhỏ, chọn bước con
  pick-lines.tsx            ①
  line-compare.tsx          ② (thẻ dòng + hàng so sánh)
  reason-approve.tsx        ③
  declare-ama.tsx           ④ (+ thông điệp, lịch sử)
  ama-wizard.ts (+ .test.ts) logic thuần
apps/web/src/features/dossier-detail/dossier-detail-page.tsx   bước 7 có điều kiện
apps/web/src/features/dossier-detail/steps/review-step.tsx     bỏ tab AMA
apps/web/src/features/dossier-detail/steps/submit-step.tsx     lọc hàng AMA, thẻ lối vào
packages/ui/src/components/disclosure.tsx (+ test, playground, DESIGN-SYSTEM.md)
```

`Disclosure` (`@kb/ui`): tiêu đề + phần đếm/huy hiệu tùy chọn + nội dung; dựa trên `<details>/<summary>` hoặc nút `aria-expanded`; prop `defaultOpen`, `open`/`onOpenChange`. Theo skill `adding-ui-component`.

## 5. Lỗi, tải, trống

- Mỗi bước nhỏ có loading (`SkeletonCard`), lỗi (`LoadError` + thử lại), trống (`EmptyState`).
- Lỗi lưu/gửi: `toastMutationError` như hiện tại; dữ liệu nháp trên màn giữ nguyên để thử lại.
- Hải quan từ chối AMA: ④ hiện `Alert` lỗi theo chỉ tiêu (dùng `fieldErrors` có sẵn) + nút "Sửa lại" về ②/③.

## 6. Kiểm thử

- Vitest `ama-wizard.test.ts`: bảng §3.6 đủ trạng thái; `changedKeys`; `amaDeadline` (còn hạn, đúng 60 ngày, quá hạn).
- Test component (+ axe): bước 7 chỉ hiện khi `CLEARED`/`POST_*`; ② đổi thuế suất → tiền thuế và mức tăng/giảm cập nhật, ô đánh dấu đã đổi; ③ nút Phê duyệt tắt khi thiếu `TK_REC`; ④ đúng một nút chính theo trạng thái; `Disclosure` (axe, bàn phím).
- Trình duyệt thật trên `dos_018`: ① → ② → ③ → ④ AMA → AMB → ② sửa → ③ duyệt lại → AMA → AMC → lập lần 2. Chụp sáng/tối × desktop 1366 / mobile 390; đo không tràn ngang, nút trợ lý AI không che thanh dưới.
- `pnpm typecheck && pnpm lint && pnpm test` xanh.
