# Trạng thái tiến độ hồ sơ (dựa trên 3 nhóm Khai báo · Luồng · Thông quan của tờ khai) + mở lại khi chưa có số + xác nhận hủy tờ khai

Ngày: 2026-11-16 · Trạng thái: đã duyệt (chủ sản phẩm, 2026-11-16)

## 1. Vì sao

Hồ sơ hiện có **một** trạng thái (`dossiers.status`: DRAFT, PROCESSING, NEEDS_REVIEW, APPROVED, SUBMITTED, CLEARED, CANCELLED) trộn tiến độ làm hồ sơ trong
phần mềm với tiến độ khai Hải quan, và chuyển "Đã truyền" (SUBMITTED) **ngay lúc bấm gửi** – kể cả khi Hải quan chưa cấp số. Hệ quả:

- Truyền lỗi / bị trả lỗi khi chưa có số: hồ sơ hiện "Đã truyền", nút "Mở lại để sửa" không hiện (giao diện chỉ hiện khi tờ khai còn APPROVED –
  `review-step.tsx:455`) dù backend đã cho mở lại; đang gửi lại do lỗi mạng thì báo sai "Hải quan đã ghi nhận tờ khai".
- Người dùng không theo dõi được giai đoạn khai (khai tạm, khai chính thức, sửa đổi…), luồng và thông quan theo cách nghiệp vụ quen dùng.

Mục tiêu: người khai nhìn danh sách / đầu trang là biết hồ sơ đang ở đâu theo **đúng 3 nhóm trạng thái nghiệp vụ** (chủ sản phẩm chốt 2026-11-16).

## 2. Mô hình trạng thái (chủ sản phẩm chốt)

**Nhóm 1 – Trạng thái khai báo** (theo từng tờ khai; hồ sơ lấy theo §4):

| # | Nhãn | Khi nào | Nguồn dữ liệu (đã có) |
|---|---|---|---|
| 1 | Chưa khai báo | Chưa có số tờ khai | stage `NOT_SENT` (hồ sơ chưa duyệt cũng thuộc nhóm này) |
| 2 | Đã khai tạm | IDA/EDA thành công, có số | `PRE_DECLARED`; `RECALLED` (IDB/EDB) → dòng phụ "đang gọi sửa" |
| 3 | Đã khai chính thức | IDC/EDC thành công, đã phân luồng | `DECLARED` và `raw.amendments = 0` |
| 4 | Gọi sửa đổi | IDD/EDD thành công | `AMEND_RECALLED` |
| 5 | Khai tạm sửa đổi | IDA01/EDA01 thành công | `AMEND_PRE_DECLARED` |
| 6 | Đã khai chính thức sửa đổi | IDE/EDE thành công | `DECLARED` và `raw.amendments > 0` (sau thông quan: giữ nhãn 6 nếu đã sửa) |
| 7 | Đã khai sửa đổi sau thông quan | AMC thành công | `raw.postAmendments > 0` |
| – | Đã hủy | Người khai xác nhận hủy (§6) | stage mới `CANCELLED` |
| – | Bị từ chối | Hải quan từ chối | stage `REJECTED` |

Dòng phụ (không phải trạng thái riêng): "Đang gọi sửa" (IDB), "Đang khai sửa sau thông quan" (AMA/AMB xong, chưa AMC – giữ nhãn trước đó), và với nhóm 1
tiến độ trong phần mềm: "Đang xử lý chứng từ" / "Cần kiểm tra" / "Đã duyệt, chờ truyền" / "Đang gửi…" / "Truyền lỗi".

Thứ tự ưu tiên khi đã thông quan: 7 nếu có AMC, không thì 6 nếu có IDE, không thì 3. Nhãn khai báo không đổi thành "Đã thông quan" – thông quan là nhóm 3.

**Nhóm 2 – Phân luồng:** Xanh / Vàng / Đỏ (`customs_results.channel`); chưa phân luồng → "—".

**Nhóm 3 – Thông quan:** Chưa thông quan / Đã thông quan (`clearance_status = CLEARED` hoặc stage thuộc nhóm đã thông quan như `dossierCustomsSummary`).

**Cờ "Cần chú ý"** (tách khỏi trạng thái, hiện cạnh nhãn, lọc được): truyền lỗi (`SEND_FAILED`), bị từ chối, sắp/đã quá hạn khai.

## 3. Phương án đã chọn

Ba nhóm §2 là **mô hình dữ liệu theo tờ khai** (hàm thuần trả đủ 3 nhóm) – dùng nguyên cho **báo cáo theo tờ khai** sau này (lọc/thống kê độc lập,
vd tỷ lệ luồng đỏ). **Màn hồ sơ** (chủ sản phẩm chốt 2026-11-16) chỉ hiện **một trạng thái tiến độ** gộp nhóm Khai báo + Thông quan, không có cột Luồng;
luồng chỉ hiện kèm khi cần hành động (§3.1). Kèm tab "việc cần làm" trên danh sách.

Đã cân nhắc và bỏ: ba cột riêng trên màn hồ sơ (chiếm chỗ, người theo dõi hồ sơ cần tiến độ chứ không cần phân tích); một nhãn gộp không có luồng nào
(mất tín hiệu luồng vàng/đỏ đang chờ kiểm tra).

### 3.1 Trạng thái tiến độ của hồ sơ (màn hồ sơ)

```
Chưa khai báo → Đã khai tạm → Đã khai chính thức → Gọi sửa đổi → Khai tạm sửa đổi → Đã khai chính thức sửa đổi
→ Đã thông quan → Đã khai sửa đổi sau thông quan          (+ Đã hủy · Bị từ chối – nhãn đỏ)
```

- Đã thông quan → "Đã thông quan" (sửa đổi trước thông quan không còn hiện ở danh sách – xem trong hồ sơ / báo cáo); AMC thành công → "Đã khai sửa đổi sau
  thông quan".
- Dòng phụ như §2 (đang gọi sửa, đang khai sửa sau thông quan, tiến độ trong phần mềm, đang gửi, truyền lỗi).
- **Luồng:** chỉ khi tờ **đã phân luồng và chưa thông quan** (khai chính thức / gọi sửa đổi / khai tạm sửa đổi / khai chính thức sửa đổi) nhãn kèm luồng,
  vd `Đã khai chính thức · Luồng đỏ`. Đã thông quan → không hiện luồng.

## 4. Thiết kế

### 4.1 Tính trạng thái lúc đọc – không đổi bảng `dossiers`

- Hàm thuần mới trong `@kb/contracts` (dùng chung backend + mock):
  - `sheetStatusOf(branch)` → `{ declaration, channel, clearance, flags, sub? }` – đủ 3 nhóm §2 cho **một tờ** (báo cáo theo tờ khai dùng lại).
  - `dossierProgressOf(dossier, branches)` → `{ progress, sub?, channel?, flags, done, of }` – trạng thái tiến độ §3.1 cho **hồ sơ**.
- `CustomsSummary` (đang gắn vào DTO hồ sơ qua `withCustoms`, `dossierCustomsSummaries`) mở rộng thêm kết quả `dossierProgressOf`. Danh sách hồ sơ đã lấy hết rồi
  lọc ở trình duyệt (`dossier-list-page.tsx:108`) → lọc theo tiến độ + tab làm ở trình duyệt, **không cần migration / cột mới**.
- `dossiers.status` **giữ nguyên ý nghĩa nội bộ** (khóa sửa khi đang/đã gửi, chặn lặp, lô nhiều tờ, tính lượt). Giao diện **không hiển thị** nhãn
  "Đã duyệt / Đã truyền / Đã thông quan" của nó nữa mà hiển thị 3 nhóm. Lý do: đổi thời điểm ghi SUBMITTED đụng 3 đường gửi, chặn gửi trùng nội dung, lô nhiều
  tờ và lượt khai (rủi ro cao) mà người dùng không cần – họ cần **thấy** đúng và **mở lại được** (§5).

### 4.2 Lô nhiều tờ khai

- Tiến độ: theo **tờ đi chậm nhất** (thứ tự §3.1). Khi các tờ không cùng mức, thêm mức xa nhất + "k/N" = số tờ ở mức xa nhất (vd "Đã khai chính thức · Đã thông quan 2/3"); mọi tờ cùng mức thì không hiện "k/N". Tờ Đã hủy không tính vào N
  (tất cả đã hủy → "Đã hủy").
- Luồng (khi hiện theo §3.1): một luồng → luồng đó; nhiều luồng → luồng nặng nhất (Đỏ > Vàng > Xanh) kèm số tờ, vd "Luồng đỏ (1/3)".
- Cờ: có tờ nào lỗi/từ chối → cờ, như `problems` hiện nay.

### 4.3 Giao diện

- **Danh sách hồ sơ:** cột "Trạng thái" hiện **trạng thái tiến độ** §3.1 (nhãn + luồng khi có + dòng phụ + cờ), bộ lọc theo tiến độ (`meta.filter` của
  `DataTable`); bỏ cột/nhãn luồng riêng. Tab việc cần làm, đặt cạnh phạm vi NK/XK hiện có:
  `Tất cả` · `Cần xử lý` (chưa khai báo) · `Chờ khai chính thức` (đã khai tạm / khai tạm sửa đổi) · `Đã phân luồng, chưa thông quan` (lọc thêm theo luồng) ·
  `Đã thông quan` · `Cần chú ý` (cờ). Tab lưu trên URL (`?viec=`), có số đếm.
- **Đầu trang hồ sơ:** một nhãn tiến độ (kèm luồng theo §3.1) thay `DossierStatusBadge` + `ChannelBadge`; hồ sơ hủy (dossier CANCELLED) giữ hiển thị như nay.
- **Trang tổng quan:** số đếm theo tab việc cần làm thay cho "đang mở / đã truyền".
- **Bước Khai báo Hải quan:** mỗi tờ hiện đủ 3 nhóm của tờ (khai báo · luồng · thông quan – `sheetStatusOf`) + dòng phụ; nút "Xác nhận tờ khai đã hủy" (§6).
- **Báo cáo theo tờ khai:** ngoài phạm vi lần này; dùng `sheetStatusOf` (3 nhóm) khi làm.
- Nhãn mới qua `StatusBadge` (`@kb/ui` – thêm vào `STATUS_META` nếu thiếu), đủ vi/en/zh; không tự dựng bảng `{label, tone}`.

## 5. Mở lại khi chưa có số tờ khai (mục 1 – đã đồng ý)

- Backend `reopenDeclaration`: cho mở lại khi **mọi tờ chưa có số** (`declarationNo` rỗng, stage `NOT_SENT`) **và không còn lệnh nội dung đang gửi**
  (outbox PENDING của IDA/EDA cho hồ sơ). Hiện chỉ xét tờ 1 + `SEND_FAILED`.
- Đang gửi → lỗi mới `DECLARATION_SENDING` ("Đang gửi tờ khai, chờ kết quả rồi mới mở lại được") thay cho "Hải quan đã ghi nhận" (đủ 3 ngôn ngữ). Lý do khóa:
  Hải quan có thể đã nhận và cấp số trong lúc chờ – mở sửa lúc đó làm lệch nội dung.
- Giao diện: hiện nút "Mở lại để sửa" ở bước Review **và** ở bước Khai báo Hải quan khi điều kiện trên đúng (lấy từ submission view), không chỉ khi tờ khai APPROVED.
- Sau mở lại: như hiện nay (tờ khai về nháp, kết quả lỗi được xóa cờ, ghi `DECLARATION_REOPENED`).

## 6. Xác nhận tờ khai đã hủy (mới)

VNACCS không có nghiệp vụ truyền hủy – Hải quan hủy theo đề nghị (văn bản) của doanh nghiệp. Phần mềm cho người khai **ghi nhận** việc đã hủy.

- Ai: ADMIN, APPROVER (như quyền duyệt). Khi nào: tờ **đã có số** và **chưa thông quan**, chưa hủy.
- Hộp `ConfirmDialog` (tone danger, `irreversible`): lý do (danh mục `CANCEL_REASON` đã có trong `code-lists`), ngày hủy (`YYYY-MM-DD`, mặc định hôm nay),
  số/ngày văn bản của Hải quan (tùy chọn), ghi chú. Xác nhận → tờ đó stage `CANCELLED` (terminal), lưu `raw.cancellation {reason, date, docNo, note, by, at}`,
  ghi `org_audit` (`DECLARATION_CANCEL_CONFIRMED`) + nhật ký thông điệp (dòng "Đã xác nhận hủy"), thông báo cho người tạo hồ sơ.
- Use case mới `confirmDeclarationCancelled` (integration), route `POST /api/dossiers/[id]/declaration/cancel` (Zod, idempotent: đã hủy → trả OK).
  Mock tương ứng.
- Sau hủy: không còn nghiệp vụ nào trên tờ đó (như REJECTED). Mọi tờ đã hủy → nhóm khai báo "Đã hủy".

## 7. Ngoài phạm vi

- Khai lại hồ sơ đã hủy thành tờ khai mới (số mới).
- Hoàn lượt khai khi hủy tờ đã khai chính thức (ghi chú cho đội billing).
- Đổi thời điểm ghi `dossiers.status = SUBMITTED` / thêm cột trạng thái vào bảng `dossiers` (lọc phía server) – làm khi danh sách cần phân trang server.
- Xuất JSON (hiện chỉ là toast).

## 8. Kiểm thử

- Hàm thuần: `sheetStatusOf` bảng §2 đủ 7 + hủy + từ chối + dòng phụ, ưu tiên 7 > 6 > 3; `dossierProgressOf` chuỗi §3.1 (thông quan, AMC, luồng chỉ khi
  đã phân luồng chưa thông quan), lô nhiều tờ (chậm nhất, k/N, luồng nặng nhất, tờ hủy không tính).
- Use case: mở lại (không số + không đang gửi → OK; đang gửi → `DECLARATION_SENDING`; có số → `DOSSIER_LOCKED`), hủy (quyền, điều kiện, idempotent, audit).
- Giao diện: danh sách (3 cột, lọc, tab + số đếm), đầu trang, bước Khai báo (nút mở lại, hộp hủy) – test + axe; trình duyệt sáng/tối, 1366/390, vi/en/zh.
- e2e: truyền lỗi chưa có số → mở lại sửa → truyền lại; xác nhận hủy.

## 9. Để người làm tự quyết

Vị trí chính xác của tab trên màn danh sách, chữ dòng phụ, màu/biểu tượng nhãn (theo token `@kb/ui`), cách gom luồng hỗn hợp trên mobile.
