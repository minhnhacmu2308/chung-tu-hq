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

Đủ **35 API** của Postman FPT `API-VNACCS NEW` (21/04/2026). Nguồn lệch nhau thì ưu tiên: phản hồi thật > Excel đặc tả > Postman (có thể cũ). Tài liệu từng API (body, bảng trường, mã thông điệp, sơ đồ luồng):
`docs/vnaccs-api/index.html` (mở trực tiếp bằng trình duyệt) và `docs/vnaccs-api/README.md`. Body mẫu: `docs/vnaccs-api/samples/`.

Xác thực: `Authorization: Bearer <token>` (token từ `/api/auth/login`, tài khoản API `FPT_MOCK_API_USERS`) cho mọi API – FPT đã
bỏ HTTP Basic (Postman còn ghi Basic là bản cũ). Đường dẫn không phân biệt hoa thường (`/api/hys` = `/api/HYS`).

Trạng thái tờ khai (`tK_TRANGTHAI`, theo VN_IDA_TRANGTHAI): `T` lưu tạm · `A` khai tạm · `C` khai chính thức · `TE` lưu tạm sửa đổi ·
`A01` khai tạm sửa đổi · `E` khai chính thức sửa đổi · `R` hủy.

```
POST /api/auth/login {username,password}         → {token, expiration}
POST /api/IDA | /api/EDA                          → số tờ khai (tK_ICN/tK_ECN), A. Khai lại (cùng tK_ID hoặc head có số) khi còn T/A → giữ số
Tờ khai nhánh (lô > 50 dòng): head có tK_FIC/tK_BNO/tK_DNO; tờ 1 ghi tK_FIC "F" + tK_BNO 1 → số mới; tK_BNO ≥ 2 phải có tK_FIC = số tờ 1 mock đã cấp, nếu không lỗi MOCK-REQ (FIC).
POST /api/IDB | /api/EDB  {tK_ICN | tK_ECN}       → gọi lại tờ khai tạm: A → T (rồi IDA/EDA lại)
POST /api/IDC | /api/EDC                          → A → C, phân luồng tK_LUONG (1 xanh, 2 vàng, 3 đỏ) + thông điệp phân luồng (P) chờ VNACCSREP
POST /api/IDD | /api/EDD                          → C/E chưa thông quan → TE (gọi sửa đổi)
POST /api/IDA01 | /api/EDA01  (như IDA/EDA, head có số tờ khai) → TE → A01
POST /api/IDE | /api/EDE                          → A01 → E + thông điệp sửa đổi (P)
POST /api/IID | /api/IEX  {tK_ICN | tK_ECN}       → tham chiếu (nhận cả tK_SOTK cũ); mỗi lần hỏi là một lượt xử lý: sau 2 lượt từ đăng ký → tK_THONGQUAN "1" + thông điệp thông quan (P)
POST /api/VNACCSREP  {useR_ID, password, terminaL_ID, terminaL_ACCESS_KEY} → mọi thông điệp P đang chờ của user (lấy xong là xóa – giả định); cũng tính một lượt xử lý
POST /api/HYS  {objVNACCS_ACCOUNT, tK_CH, tK_TSB, …, lisT_FILE[]} (Excel) → tK_JNO (cấp ngoài + vaL0020); dạng Postman objVN_HYS.lisT_FILE_HYS vẫn nhận
POST /api/AMA → tK_SYN (VAL8000) · /api/AMB {tK_SYN} → gọi lại (VAL8010) · /api/AMC {tK_SYN} → đăng ký (VAL8020) + chấp nhận VAL8050 (P)
POST /api/V5Bill | V5Invoice | V5Permit | V5Contract | V5Co | V5Container | V5OtherDoc → reF_ID; /api/V5Response {reF_ID}
POST /api/V5IdentifierReq → reF_ID; /api/V5IdentifierRes {reF_ID} → sO_DD + codE_CONTENT (QR) khi tranG_THAI 15
POST /api/TachVanDonReq → reF_ID; /api/TachVanDonRes {reF_ID}
POST /api/V5ContainerReq (Excel v1.1 – bản dùng, seal bắt buộc) | ContainerReq (bản cũ) → reF_ID; /api/V5ContainerRes | ContainerRes {reF_ID}
   Hỏi kết quả: lần 1 tranG_THAI "11" (chưa phản hồi), lần 2 "12" chấp nhận (+ sO_TN) – dữ liệu gửi chứa "REJECT" → "10" từ chối
POST /api/KVGS {TK_SOTK, TK_NGAYDK, TK_MAHQ, MA_DV} → một lời gọi (không REF_ID): {errorList, serviceMessage} theo đặc tả API-KVGS – chữ số áp chót của TK_SOTK chẵn → hàng container (bangKeMaVachContainer + ảnh QR PNG Base64), lẻ → hàng lẻ; thiếu trường → errorList "000"
POST /api/PrintObjectRefIDA | PrintObjectRef | PrintEdiRef | PrintXPS → filE_BASE64 (PDF giả)
POST /api/KyFile {mA_DV, useR_ID, filE_TEN, filE_BASE64} → file "đã ký"
POST /api/SyncCategory {} → vN_A038, vN_A015, vN_A016_FOREIGN, vN_A202, vN_A501, vN_A527 (từ danh mục @kb/contracts)
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
| Đường dẫn + body của 35 API (IDA…IID, EDA…IEX, AMA/AMB/AMC, hys, VNACCSREP, V5…, định danh, tách vận đơn, container, KVGS, Print*, KyFile, SyncCategory) | Có mẫu (Postman 21/04/2026) |
| Phản hồi của mọi API trừ Login/EDA; mã thông điệp nhóm nhập khẩu (VAD…); VNACCSREP lấy một lần | **Giả định** – response có header `X-Mock-Assumed: 1` |
| Mã HTTP khi sai login/token (401), body sai JSON (400 ProblemDetails) | **Giả định** |
| Lỗi thiếu chỉ tiêu bắt buộc / sai định dạng ngày | Mock tự đặt mã `MOCK-REQ`, `MOCK-FMT` |
| Tỷ giá ngoài USD, tên chi cục/kho ngoài mẫu (`src/catalog.ts`) | Số giả |

Có thêm curl thật của FPT thì thêm fixture rồi sửa mock cho test khớp.

## Điều khiển (chỉ có ở mock)

| | |
|---|---|
| `GET /__mock/declarations` | Danh sách tờ khai mock đang giữ (trong bộ nhớ, mất khi tắt) |
| `POST /__mock/declarations/:so` `{channel: 1\|2\|3, cleared, rejected}` | Ép phân luồng / thông quan / từ chối (IEX trả `tK_TRANGTHAI: "R"`) |
| `GET /__mock/messages` | Thông điệp loại P đang chờ VNACCSREP, theo user |
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
