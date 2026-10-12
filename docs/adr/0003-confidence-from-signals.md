# ADR 0003 – Độ tin cậy từng trường tính từ tín hiệu, không lấy từ model

- Trạng thái: Chấp nhận
- Ngày: 2026-10-12

## Bối cảnh
UI cần đánh dấu trường nghi ngờ. LLM không trả về độ tin cậy đã hiệu chỉnh cho từng trường; con số "92%" model tự nói là không đáng tin.

## Quyết định
Trạng thái mỗi trường tính từ tín hiệu quan sát được:

| Trạng thái | Điều kiện |
|---|---|
| `CROSS_CHECKED` | ≥ 2 chứng từ cho cùng giá trị sau chuẩn hóa |
| `SINGLE_SOURCE` | Chỉ 1 nguồn, đúng định dạng |
| `CONFLICT` | Các nguồn khác nhau |
| `INVALID_FORMAT` | Sai định dạng (MST, ngày, mã HS, tổng ≠ Σ dòng…) |
| `MODEL_UNSURE` | Model ghi trường này vào `uncertainties` |
| `USER_CONFIRMED` | Người dùng đã xác nhận/sửa |

Chỉ hiển thị % khi đã có đủ dữ liệu `field_audit` để tính tỷ lệ đúng thực tế theo (skill, trường).

## Hệ quả
- (+) Trung thực, giải thích được vì sao trường bị đánh dấu.
- (−) Không có "con số đẹp" ở giai đoạn đầu; UI dùng nhãn trạng thái.
