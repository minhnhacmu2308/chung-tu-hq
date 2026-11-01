# ADR 0010 – Điền nhanh form Tạo hồ sơ: nhờ AI (model rẻ) hoặc sao chép hồ sơ cũ

- Trạng thái: Chấp nhận
- Ngày: 2026-10-31

## Bối cảnh
Người khai làm nhiều lô giống nhau (cùng đối tác, chi cục, loại hình, phương thức vận tải) nhưng mỗi lần tạo hồ sơ phải nhập lại từ đầu – tốn thời gian. Họ muốn gõ một câu như "giống hồ sơ HS-NK-2610-142 nhưng đi máy bay" hoặc chọn một hồ sơ cũ để chép. Bất biến 5 cũ chỉ cho AI đọc chứng từ, gợi ý HS và soạn nháp email quản trị (ADR 0008).

## Quyết định
- **Thẻ "Điền nhanh"** trên trang Tạo hồ sơ, hai cách:
  - **Sao chép từ hồ sơ cũ** (không AI): chọn hồ sơ → điền chiều, phương thức vận tải, loại hình, chi cục, đối tác, bộ skill, ghi chú. **Chỉ thông tin form** – không chép chứng từ, tờ khai, hạn xử lý.
  - **Nhờ AI điền**: người dùng gõ yêu cầu → `POST /api/dossiers/draft` → use case `draftDossierWithAi` (module dossier) → port `DossierDraftAi` → `ClaudeDossierDrafter` (extraction/infrastructure, model `AI_FAST_MODEL` – mặc định Haiku 4.5, rẻ nhất; việc chỉ là hiểu một câu, không cần suy luận).
- **Nới bất biến 5**: AI được hiểu câu yêu cầu để **gợi ý** giá trị form Tạo hồ sơ, với ràng buộc:
  - Prompt chỉ có câu người dùng gõ + tóm tắt 30 hồ sơ gần nhất **của chính doanh nghiệp đó** (mã, chiều, vận tải, loại hình, chi cục, đối tác, ngày tạo) – để nhận ra "giống lô HANSOL lần trước". Không chứng từ, không dữ liệu doanh nghiệp khác.
  - AI trả **ô thô**; code kiểm từng ô (`dossier/domain/draft.ts`): chiều/vận tải theo enum, loại hình phải có trong `TYPE_CODE` đúng chiều, chi cục phải khớp **đúng một** mã đang dùng trong `A038` (theo mã hoặc tên không dấu), hạn xử lý 0–90 ngày. Ô sai bị bỏ – không đoán.
  - Mã hồ sơ gõ thẳng trong câu được code nhận (regex), không phụ thuộc AI; hồ sơ gốc chỉ tìm trong doanh nghiệp đang đăng nhập (RLS).
  - **Không tạo hồ sơ**: trả gợi ý, người dùng xem, sửa rồi bấm Tạo. Ô đã điền nhanh không bị Mặc định khai báo ghi đè.
  - Giới hạn 30 lần / người / giờ; ghi `usage_events` (`kind = AI_DOSSIER_DRAFT`, theo doanh nghiệp) – bất biến 8. Lỗi có mã lý do `DOSSIER_AI_*` (3 ngôn ngữ).
- Mã gọi SDK vẫn chỉ ở `extraction/infrastructure` (depcruise `ai-sdk-only-in-extraction-infra`). Chưa cấu hình AI (`AI_PROVIDER=fake`) → báo "Chưa bật AI điền hồ sơ", sao chép hồ sơ cũ vẫn dùng được. Chế độ mock của web nhận mã hồ sơ + vài từ khóa vận tải/chiều, không gọi AI.

## Hệ quả
- Tạo lô lặp lại còn vài giây; chi phí mỗi lần ~vài trăm token Haiku.
- Chưa có: điền từ file chứng từ thả vào (AI đọc invoice/B/L ngay ở bước tạo), nhớ "mẫu hồ sơ" đặt tên riêng.
