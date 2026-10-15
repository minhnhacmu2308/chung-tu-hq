# Tích hợp HSCodePro – phân loại mã HS (BACKEND-TODO T2, D1)

Ngày: 2026-10-15 · Trạng thái: người dùng yêu cầu làm ("bạn cứ tích hợp"); test thật khi HSCodePro deploy xong.
Tài liệu nguồn: "Hướng dẫn tích hợp API phân loại mã HS (HSCodePro) v1, 2026-10-15". Lưu bản sao tại `docs/integrations/hscodepro-api-v1.md`.

## 1. Mục tiêu

Bước "Tra cứu mã HS" của AI Agent dùng HSCodePro thật. Màn "Xác nhận mã HS" phải:
- hiện mã gợi ý, độ tin cậy, thuế NK theo C/O, VAT, lý do và cảnh báo;
- hiện các mã thay thế;
- cho người khai trả lời câu hỏi của AI ngay trên màn đó.

Người khai vẫn luôn là người xác nhận mã cuối cùng (bất biến 5, 7).

Chưa có server/khóa thật nên phải có **máy giả lập HSCodePro qua HTTP** (theo JSON mẫu mục 4 của tài liệu). Như vậy, ngày HSCodePro deploy chỉ cần đổi URL + khóa.

## 2. Khác biệt so với hiện tại

| Hiện tại | Sau tích hợp |
|---|---|
| Port `HsClassifier.classify()` đồng bộ, từng dòng | Port `HsClassificationService`: tạo lượt (≤ 50 dòng) → hỏi trạng thái → trả lời câu hỏi → hủy |
| Thuế lấy từ `catalog_hs` nội bộ (15 dòng mẫu) | Thuế lấy từ kết quả HSCodePro (`tax`). `catalog_hs` chỉ còn dùng cho chế độ giả và tra cứu thủ công |
| Xác nhận chỉ chấp nhận mã có trong `catalog_hs` | Xác nhận chấp nhận: mã gợi ý/thay thế của HSCodePro (kèm thuế), mã trong `catalog_hs`, hoặc mã 8 số nhập tay (không có thuế → chỉ tiêu thuế nghi ngờ) |

## 3. Quyết định

| # | Quyết định | Lý do |
|---|---|---|
| H1 | Port mới `HsClassificationService` với `create/get/answer/cancel`, kiểu dữ liệu đúng tài liệu (Zod parse mọi phản hồi). Có hai hiện thực: `HscodeproHttpService` và `FakeHsClassificationService` (dựa trên `catalog_hs`, trả `completed` ngay, giữ hành vi e2e hiện tại). Bỏ `HsClassifier` cũ | Một port cho cả thật và giả |
| H2 | Máy giả lập HTTP trong `apps/fpt-mock`, đường dẫn `/internal/v1/hs-classifications/*`, khóa `X-Internal-Api-Key`. Có đủ trạng thái `queued → processing → completed`, kịch bản `need_info` (mô tả chứa "thanh trượt"/"guide"), `failed` (mô tả chứa "FAIL-TEST"), lỗi 400/401/404/409/429 | Code đường HTTP thật được test trước ngày deploy |
| H3 | Lưu lượt: bảng `hs_jobs` (org_id, dossier_id, external_id, status, created_at, RLS theo org). Trên `line_items` thêm: `hs_job_id`, `hs_item_id`, `hs_status`, `hs_question` (jsonb), `hs_error` (jsonb), `hs_detail` (jsonb: reasoning, legal_basis, warnings). `hs_suggestions` thêm `tax` (jsonb) và `why_not` | Màn hình mở lại vẫn thấy câu hỏi/kết quả; người khai trả lời bất đồng bộ (tài liệu §7) |
| H4 | Gọi ngoài chỉ qua worker (quy tắc web: "Gọi ngoài luôn qua job"). Route web chỉ ghi DB + đẩy job | Đúng kiến trúc |
| H5 | Bước HS_LOOKUP của agent: tạo lượt cho các dòng chưa xác nhận (chia lô 50), rồi job `hs-poll` tự hẹn lại sau **3 giây** cho tới khi lượt hết `processing`. Hết `processing` thì agent đi tiếp (ánh xạ, dựng tờ khai). Dòng `need_info`/`failed` **không chặn** agent; người khai xử lý ở màn xác nhận HS. Giới hạn poll 15 phút, quá thì đánh dấu lỗi dòng `TIMEOUT` | Agent không treo chờ người trả lời |
| H6 | Trả lời câu hỏi: `POST /api/line-items/:id/hs/answer` (Zod: mỗi câu con một phần tử, có `selected` hoặc `custom`) → lưu "đang gửi", đẩy job `hs-answer` → gọi API → bật poll lại. Lỗi 409 → gọi `GET` cập nhật trạng thái | Theo §3.3, §8 |
| H7 | "Phân loại lại" một dòng (sau `failed`/`cancelled`, hoặc người khai bổ sung mô tả): tạo **lượt mới 1 dòng** (tài liệu: không có endpoint chạy lại). Chạy lại agent → `cancel` lượt cũ còn dở | Theo §3.4 |
| H8 | Tham số gửi đi: `description` (mô tả dòng hàng, cắt 1000 ký tự; dưới 3 ký tự → không gửi, báo "mô tả quá ngắn"), `origin_country` (ISO-2 của dòng hàng → xuất xứ trên C/O → nước người bán; không có → không gửi dòng đó, báo "thiếu xuất xứ"), `quantity`, `unit`, `value_usd` (chỉ khi tiền tệ hóa đơn là USD), `invoice_hs`, `co_form` (map từ mẫu C/O của lô; ngoài bảng §9 → `null`), `import_date` = ngày dự kiến khai (giờ VN), `external_ref` = mã hồ sơ | Theo §3.1, §9 |
| H9 | Thuế: lấy `tax.import.rate` và `tax.vat.rate`; `basis = FTA` thì ghi hiệp định vào ghi chú chính sách. **Giữ quy tắc phía mình**: hàng XK và loại hình miễn thuế (E21/E31…) vẫn áp `ratesFor` như hiện tại. Giảm VAT theo nghị định: không áp tự động (tài liệu §5 nói API không áp); ghi chú cho người khai | Không làm sai thuế khi đổi nguồn |
| H10 | Tin cậy: API trả 0–100 → lưu 0–1 như hiện tại. `confidence < 60` hoặc có `warnings` → tô cảnh báo, hiện warnings cạnh mã | §5 |
| H11 | 429: chờ theo `Retry-After` rồi thử lại (tối đa 3 lần trong client); 5xx/mạng → ném lỗi để BullMQ thử lại; 400/401/503 → lỗi rõ trên log agent, không thử lại vô ích | §8 |
| H12 | Cấu hình: `HS_CLASSIFIER=hscodepro`, `HSCODEPRO_URL`, `HSCODEPRO_INTERNAL_KEY`; thiếu khóa khi bật thì `loadEnv` báo lỗi. Khóa không bao giờ ra trình duyệt hay log | §1 |

## 4. Giao diện (màn Agent → bảng "Xác nhận mã HS")

- Mỗi dòng theo trạng thái:
  - "Đang chờ…" / "Đang phân loại…" (spinner);
  - **"Cần bổ sung"** + nút **"Trả lời AI"**;
  - kết quả;
  - lỗi + nút **"Phân loại lại"**;
  - "Đã hủy" + "Phân loại lại".
- Cột gợi ý: mã `xxxx.xx.xx` + thanh tin cậy; thuế `5% · 10%`, FTA ghi `0% (ACFTA) · 10%`, không có thuế thì `—`; warnings hiện ngay dưới mã.
- "Chọn mã khác" (đã có): thêm các mã thay thế (tin cậy, thuế, "vì sao không chọn") + ô nhập tay.
- Chi tiết dòng: lý do, căn cứ pháp lý.
- Hộp thoại "Trả lời AI" (Dialog có icon):
  - mỗi câu con: tiêu đề, giải thích;
  - radio (một lựa chọn) hoặc checkbox (`multiSelect`);
  - luôn có ô "Trả lời khác".
- Màn tự làm mới theo SSE/poll khi còn dòng đang chạy.
- Bản mock (NEXT_PUBLIC_DATA_SOURCE=mock) mô phỏng đủ các trạng thái.

## 5. Test

- contracts: schema phản hồi theo JSON mẫu §4 (4.1–4.4), schema trả lời.
- core domain: map dòng hàng → item gửi đi (H8), map kết quả → gợi ý + thuế (H9, H10), `co_form` map.
- core use case (fake service):
  - agent tạo lượt, dừng chờ, đi tiếp khi hết `processing`;
  - `need_info` không chặn;
  - trả lời → job;
  - phân loại lại 1 dòng;
  - xác nhận mã thay thế dùng thuế của nó;
  - nhập tay mã ngoài biểu → thuế nghi ngờ;
  - org khác không thấy.
- `HscodeproHttpService` gọi máy giả lập (HTTP thật): 202, poll, need_info, answer, cancel, 400 có `details`, 401, 404, 409, 429 + Retry-After.
- e2e: agent chạy với HSCodePro giả lập → một dòng "Cần bổ sung" → trả lời → có mã → xác nhận → review.
- Khi có khóa thật: chạy checklist §10 của tài liệu (6 bước) bằng script `pnpm hscodepro:smoke`.

## 6. Ngoài phạm vi

- Lưu "mã đã xác nhận" để tự gợi ý cho lần sau cùng mặt hàng (để sau).
- Giảm VAT theo nghị định tự động.
- Chính sách quản lý chuyên ngành (API v1 chưa trả).
