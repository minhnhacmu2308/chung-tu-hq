# ADR 0005 – Tích hợp hệ thống bên thứ 3 (hscodepro, Customs Hub, AI)

- Trạng thái: Chấp nhận
- Ngày: 2026-10-12

## Bối cảnh
Sản phẩm gọi các hệ thống bên ngoài: hscodepro (gợi ý HS), Customs Hub (truyền VNACCS: IDA/IDC/EDA/EDC/HYS/IEX), nhà cung cấp AI, tra cứu hóa đơn điện tử. Truyền tờ khai có hậu quả pháp lý; gửi trùng hoặc mất thông điệp là lỗi nghiêm trọng.

## Quyết định

**Port + adapter.** Module `integration` khai báo port; adapter chuyển đổi giữa mô hình của ta và DTO của bên ngoài (anti-corruption layer). Nghiệp vụ không import DTO bên ngoài.

```ts
interface HsClassifier {
  classify(orgId: OrgId, item: { description: string; origin: CountryCode }): Promise<HsSuggestion[]>;
}
interface CustomsGateway {
  send(orgId: OrgId, msg: CustomsMessage, idempotencyKey: string): Promise<CustomsAck>;   // IDA, IDC, EDA, EDC, HYS
  status(orgId: OrgId, declarationNo: string): Promise<DeclarationStatus>;               // IEX
}
```

Adapter: `HscodeproClassifier`, `CustomsHubGateway`, và `Fake*` cho dev/test. Chọn adapter bằng cấu hình môi trường; dev/test **không bao giờ** dùng adapter thật của Customs Hub.

**Chạy bằng job nền.** Mọi lời gọi ra ngoài đi qua BullMQ, không trong request web. Timeout + retry backoff cho lỗi tạm thời (429, 5xx, timeout).

**Không gửi trùng tờ khai.** Mỗi thông điệp có `idempotencyKey = (dossierId, messageType, declarationVersion)`. Trước khi gửi lại một thông điệp có thể đã tới Hải quan (timeout sau khi gửi), job phải **tra trạng thái (IEX) trước**, chỉ gửi lại khi chắc chắn chưa được ghi nhận.
  - **Ngoại lệ (2026-11-15, người dùng chốt):** khai tạm IDA/EDA lỗi mà FPT **chưa cấp mã giao dịch và Hải quan chưa trả số tờ khai** → "Gửi lại" gửi ngay, không tra (không có gì để tra). Chưa có số tờ khai = coi như Hải quan chưa nhận. Chấp nhận rủi ro trùng khi FPT timeout/5xx sau khi Hải quan đã nhận – người khai tra trên VNACCS trước khi gửi lại trong trường hợp đó (`resend-operation.ts` `failedBeforeNumber`). Áp dụng cả khi outbox còn PENDING chưa hết lượt thử. Gửi lại nội dung tờ khai (IDA/IDA01/EDA/EDA01) **dựng lại request từ tờ khai hiện tại** (giống màn Xem trước), không phát lại body chốt lúc truyền – body cũ có thể thiếu ô điền sau (vd 1.58 `TK_ENC` → E1028).
  - **Lỗi môi trường ký (2026-11-17):** FPT trả `errorList` mã `000` "…chưa khởi động cổng ký…" → mã `SIGNING_PORT_CLOSED` (`kvgs-mapper.ts` `fptErrorCode`, dùng cho mọi nghiệp vụ + định danh + KVGS). Không phải lỗi dữ liệu: tờ khai giữ nguyên, giao diện báo mở cổng ký rồi "Gửi lại", không bảo mở lại/sửa. Thời gian chờ mỗi lời gọi FPT `FPT_API_TIMEOUT_MS` mặc định 240 s (FPT có lúc mất 40 s+); route web gọi FPT đồng bộ (tra cứu/gửi lại/poll định danh, KVGS) có thể bị proxy cắt ở 60 s – cần tăng `proxy_read_timeout` hoặc chuyển sang job.

**Outbox.** Đổi trạng thái tờ khai và tạo bản ghi "cần gửi" trong cùng transaction DB; worker đọc outbox để gửi. Không mất thông điệp khi worker chết giữa chừng.

**Nhật ký thông điệp.** Bảng `customs_messages`: org, dossier, loại nghiệp vụ, khóa idempotency, request/response (đã che dữ liệu nhạy cảm), mã kết quả, số tờ khai, phân luồng, thời điểm. Append-only. Đây là nguồn của màn "Nhật ký thông điệp".

**Máy trạng thái tờ khai** (rút gọn):

```
DRAFT → APPROVED → PRE_DECLARED (IDA/EDA, có số TK) → DECLARED (IDC/EDC, có phân luồng)
      → DOCS_SENT (HYS) → CLEARED | INSPECTION | REJECTED
Bất kỳ bước gửi nào lỗi → SEND_FAILED (giữ nguyên bước, cho phép "Gửi lại")
```

**Khóa và bí mật.** Khóa API lưu trong secret store / mã hóa trong DB (envelope encryption), không gửi xuống trình duyệt, không ghi log.

**Chi phí.** Lời gọi bên thứ 3 có tính phí ghi `usage_events` như lời gọi AI.

## Chưa quyết (xem PRODUCT.md §12)
- Cách ký số tờ khai (Customs Hub ký thay / ký số từ xa / USB token trên máy người dùng).
- Customs Hub đồng bộ hay bất đồng bộ, có webhook không.
- Khóa API theo bên vận hành hay theo từng doanh nghiệp.

## Hệ quả
- (+) Đổi hoặc thêm nhà cung cấp chỉ cần adapter mới; test được toàn bộ luồng với adapter giả.
- (+) Truy vết đầy đủ, an toàn trước timeout và retry.
- (−) Thêm bảng outbox, nhật ký và máy trạng thái phải bảo trì.
