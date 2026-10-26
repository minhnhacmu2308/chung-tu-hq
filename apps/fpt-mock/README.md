# fpt-mock – server giả lập FPT.VNACCS

Cổng FPT thật là **production** (khai thật với Hải quan), nên dev/test chỉ gọi server này.

```bash
pnpm fpt-mock                       # http://localhost:7070
```

Cho app gọi qua HTTP thật (client `FptRestClient` trong `@kb/core`), đặt trong `.env`:

```
CUSTOMS_GATEWAY=fpt
FPT_API_BASE_URL=http://localhost:7070
FPT_API_USERNAME=test
FPT_API_PASSWORD=test
FPT_VNACCS_USER_ID=BI820001
FPT_VNACCS_PASSWORD=12345678
FPT_VNACCS_TERMINAL_ID=Z0000M
FPT_VNACCS_TERMINAL_ACCESS_KEY=MOCKTERMINALKEY0
```

Tài khoản VNACCS của từng doanh nghiệp nhập ở web: **Tài khoản & tích hợp → Kết nối hệ thống → Customs Hub →
Nhập tài khoản VNACCS** (mật khẩu mock `12345678`), rồi bấm **Kiểm tra kết nối** (đăng nhập API FPT thật). `FPT_VNACCS_*`
trong `.env` chỉ là dự phòng khi doanh nghiệp chưa nhập.

Thử cả luồng bằng e2e (web + worker + fpt-mock đang chạy với cấu hình trên):
`E2E_CUSTOMS_GATEWAY=fpt pnpm --filter @kb/web test:e2e vnaccs-fpt` – IDA → IDC → HYS → IEX → Đã thông quan.

Khi có cổng test của FPT: đổi `FPT_API_BASE_URL` và tài khoản. Nếu đường dẫn khác, sửa `FPT_PATHS` trong
`packages/core/src/modules/integration/infrastructure/fpt-rest-client.ts`.

## Luồng

```
POST /api/auth/login {username,password}         → {token, expiration}
POST /api/EDA | /api/IDA  (Bearer)               → objEDA[0] / objIDA[0]: số tờ khai (tK_ECN/tK_ICN), TRANGTHAI A
Tờ khai nhánh (lô > 50 dòng): head có tK_FIC/tK_BNO/tK_DNO; tờ 1 ghi tK_FIC "F" + tK_BNO 1 → số mới; tK_BNO ≥ 2 phải có tK_FIC = số tờ 1 mock đã cấp, nếu không lỗi MOCK-REQ (FIC); mỗi tờ một số riêng.
POST /api/EDC | /api/IDC  {tK_ECN | tK_ICN}      → TRANGTHAI C + tK_LUONG (1 xanh, 2 vàng, 3 đỏ)
POST /api/HYS  {tK_CH, tK_TSB, lisT_FILE[]}      → tK_JNO (số tiếp nhận); đuôi file ngoài danh sách → MOCK-FMT; tK_KJJ chứa "REJECT" → MOCK-REJ (có cách khắc phục)
POST /api/IEX  {tK_SOTK}                         → TRANGTHAI; sau 2 lần hỏi kể từ EDC/IDC → tK_THONGQUAN "1"
```

Mọi body nghiệp vụ có `objVNACCS_ACCOUNT` {useR_ID, password, terminaL_ID, terminaL_ACCESS_KEY}; client tự thêm vào.
Lỗi nghiệp vụ trả **HTTP 200** + `errorList` (mã lỗi, chỉ tiêu, nội dung, cách khắc phục).

## Đã xác nhận / còn giả định

Mẫu thật nằm ở `src/fixtures/` (tách từ curl trong `docdungapivnacss/`, đã che terminal key). Test so khớp
**từng key, từng giá trị** với các mẫu này.

| Nội dung | Trạng thái |
|---|---|
| Login: đường dẫn, body, `{token, expiration}`, JWT HS256 | Có mẫu thật |
| EDA: đường dẫn, request, response thành công (`objEDA[0]`, các trường VNACCS tự tính) | Có mẫu thật |
| Lỗi A0004 (sai mật khẩu VNACCS, FPT trả trùng 2 lần), S1139 (ngày đi < ngày khai) | Có mẫu thật |
| IDA, EDC/IDC, HYS, IEX: đường dẫn, body, response | **Giả định** – response có header `X-Mock-Assumed: 1` |
| Mã HTTP khi sai login/token (401), body sai JSON (400 ProblemDetails) | **Giả định** |
| Lỗi thiếu chỉ tiêu bắt buộc / sai định dạng ngày | Mock tự đặt mã `MOCK-REQ`, `MOCK-FMT` |
| Tỷ giá ngoài USD, tên chi cục/kho ngoài mẫu (`src/catalog.ts`) | Số giả |

Có thêm curl thật của FPT thì thêm fixture rồi sửa mock cho test khớp.

## Điều khiển (chỉ có ở mock)

| | |
|---|---|
| `GET /__mock/declarations` | Danh sách tờ khai mock đang giữ (trong bộ nhớ, mất khi tắt) |
| `POST /__mock/declarations/:so` `{channel: 1\|2\|3, cleared, rejected}` | Ép phân luồng / thông quan / từ chối (IEX trả `tK_TRANGTHAI: "R"`) |
| `POST /__mock/reset` | Xóa hết |
| Header `X-Mock-Fail: 500\|502\|503\|429\|timeout` | Giả lập sự cố để thử retry |

Phân luồng mặc định theo chữ số cuối của số tờ khai: 0–5 xanh, 6–8 vàng, 9 đỏ. Biến môi trường: `FPT_MOCK_PORT`,
`FPT_MOCK_API_USERS` (`user:pass,…`), `FPT_MOCK_VNACCS_PASSWORD`, `FPT_MOCK_TOKEN_TTL_SECONDS`, `FPT_MOCK_POLLS_TO_CLEAR`.

## HSCodePro giả lập (phân loại mã HS)

Cùng cổng với FPT mock, theo `docs/integrations/hscodepro-api-v1.md`. Header `X-Internal-Api-Key` = `FPT_MOCK_HSCODEPRO_KEY`
(mặc định `dev-hs-key`). Worker dùng: `HS_CLASSIFIER=hscodepro HSCODEPRO_URL=http://localhost:7070 HSCODEPRO_INTERNAL_KEY=dev-hs-key`.

Hành vi (không ngẫu nhiên):
- Mỗi lần `GET` lượt, mỗi dòng tiến một bậc: `queued → processing → kết quả`.
- Mô tả có "thanh trượt"/"guide" → `need_info` (hỏi công dụng). Trả lời xong → `completed`.
- Mô tả có `FAIL-TEST` → `failed` (`AGENT_FAILED`).
- `co_form` E/D/AK/VK → thuế FTA 0%; còn lại → MFN.

Lỗi giả lập:
- 401: thiếu/sai khóa.
- 404: id lạ.
- 400: có `details[].field`.
- 409: trả lời lại.
- 429: quá 20 lượt tạo/phút, kèm `Retry-After`.
- Header `X-Mock-Fail: 500|503`.

```bash
curl -s -X POST localhost:7070/internal/v1/hs-classifications -H 'X-Internal-Api-Key: dev-hs-key' -H 'Content-Type: application/json' \
  -d '{"items":[{"line_no":1,"description":"Vít me bi SFU1605, dài 600 mm","origin_country":"TW","invoice_hs":"8483.40"}]}'
curl -s localhost:7070/internal/v1/hs-classifications/JOB_ID -H 'X-Internal-Api-Key: dev-hs-key'
```
