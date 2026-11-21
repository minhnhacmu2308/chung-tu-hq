# Thiết lập chữ ký số – đại lý khai thay / doanh nghiệp XNK (thiết kế)

- Ngày: 2026-11-21 · Trạng thái: đã chốt nghiệp vụ, chưa code
- Nguồn: chủ sản phẩm chốt trong phiên 21/11/2026 (khi thử màn Nghiệp vụ khác).

## 1. Mục tiêu và lý do

Doanh nghiệp XNK có thể **tự ký** hoặc **thuê đại lý hải quan khai thay** (đại lý dùng chữ ký số và tài khoản VNACCS của đại lý).
Hiện thông tin đại lý (`MA_DAI_LY`, `TEN_DAI_LY`) và `USER_ID` nằm trong hộp thoại đăng ký định danh, người dùng gõ lại mỗi lần, dễ sai,
và tờ khai không tự điền Mã đại lý. Chuyển thành **một thiết lập của doanh nghiệp** ở *Tài khoản & tích hợp › Chứng thư số*, áp cho
**mọi nghiệp vụ gửi Hải quan**.

Không phải "đại lý phục vụ nhiều doanh nghiệp" (ADR 0004 giữ nguyên: một org = một doanh nghiệp XNK). Đại lý ở đây chỉ là cách
doanh nghiệp đó khai báo.

## 2. Nghiệp vụ đã chốt

| Chủ đề | Quyết định |
|---|---|
| Người ký | **Đại lý khai thay** hoặc **Doanh nghiệp XNK** |
| Cách ký (cả hai người ký) | **Ký trực tiếp** (token trên máy người khai) hoặc **Ký từ xa** (chữ ký số trên máy chủ nhà cung cấp) |
| Ký thật | **Chưa làm** – bước này chỉ lưu lựa chọn. Làm khi có API ký của FPT / nhà cung cấp |
| Tài khoản VNACCS | Vẫn **một bộ** mỗi doanh nghiệp. Người ký = Đại lý → bộ đó **là của đại lý**. Không có tổ hợp "tài khoản DN + chữ ký số đại lý" |
| Phạm vi | **Mọi nghiệp vụ**: IDA/EDA, AMA, HYS, danh sách container, KVGS, định danh, tách vận đơn sau này |
| Mã đại lý trên tờ khai | Người ký = Đại lý → **5 ký tự đầu của User ID VNACCS** vào 1.25 (IDA `TK_ICC`), 2.23 (EDA `TK_ECC`), AMA `TK_A12`. Đúng luồng thực tế, không cần ánh xạ gì thêm |
| Thấy / sửa trên tờ khai | Điền **lúc dựng tờ khai** để người dùng thấy; **khóa, không cho sửa** – đi theo cấu hình để tránh sai |
| Nhãn tài khoản VNACCS | Theo người ký, vd "Tài khoản VNACCS của đại lý {tên}" / "Tài khoản VNACCS của doanh nghiệp" |
| Số lượng định danh mỗi lần | Tối đa **50**; ô nhập không cho gõ quá 50 (backend đã chặn sẵn) |
| Form đăng ký định danh | **Bỏ** ô Mã/Tên đại lý và User ID – lấy từ thiết lập + tài khoản VNACCS lúc gửi |

## 3. Cách làm (đã chọn)

**Lưu thiết lập – 1A:** bảng riêng `org_signing_settings`, mỗi org một dòng (không bí mật, RLS theo `org_id`).
Bỏ phương án gộp vào bộ VNACCS mã hóa ở `org_secrets` (phải giải mã mới hiển thị được thông tin không bí mật).

**Mã đại lý trên tờ khai – 2B (khóa):** ánh xạ điền lúc dựng tờ khai từ thiết lập, ô khóa. Bỏ phương án ghi đè lúc gửi (2A)
vì người dùng không thấy giá trị trên tờ khai.

## 4. Thiết kế

### 4.1 Dữ liệu
`org_signing_settings`: `org_id` (PK, FK organizations), `signer` (`AGENT` | `COMPANY`), `agent_tax_code` text null,
`agent_name` text null, `sign_mode` (`DIRECT` | `REMOTE`), `updated_by`, `updated_at`. RLS như bảng org khác.
Chưa có dòng = `COMPANY` + `DIRECT` (đúng hành vi hiện nay).

Zod (`@kb/contracts`): `SigningSettingsSchema` – `signer = AGENT` bắt buộc `agentTaxCode` (MST, `string`, 10 hoặc 13 số –
theo kiểm MST đang có) + `agentName` (≤ 200, như `TEN_DAI_LY` Text(200)); `COMPANY` thì hai ô này bỏ.

### 4.2 Use case + API (module `identity`, cạnh tài khoản VNACCS / chứng thư số)
- `getSigningSettings(ctx)` – mọi thành viên; `saveSigningSettings(ctx, input)` – Quản trị / Chủ sở hữu, ghi `org_audit`.
- Route `org/signing-settings` GET / PUT. Lỗi có `reason` để giao diện dịch.
- Lưu `AGENT` khi tài khoản VNACCS đã có User ID ngắn hơn 5 ký tự → lỗi có lý do (không suy ra được Mã đại lý).
  Chưa có tài khoản VNACCS thì vẫn cho lưu; tờ khai báo thiếu như hiện nay khi truyền.
- Port đọc thiết lập + User ID VNACCS cho module `declaration` (ánh xạ) và `integration` (dựng body gửi) – qua `index.ts` của module.

### 4.3 Tờ khai
- Giá trị: `AGENT` → `userId.slice(0, 5)`; `COMPANY` → trống. Hàm thuần dùng chung (contracts) để ánh xạ, kiểm lệch và AMA cùng tính một cách.
- IDA 1.25 (`TK_ICC`) / EDA 2.23 (`TK_ECC`) hiện là **ô bổ sung nhập tay** (`catalog-ida.ts:119`, `catalog-eda.ts:110` `manual: true`;
  `app-fields.ts:350`), không có trong ánh xạ `declaration/domain/mapping`. Phải mở rộng bước dựng tờ khai để ghi hai ô này kèm nguồn
  `ACCOUNT` (bỏ `manual`), không chỉ thêm một dòng ánh xạ.
- Khóa sửa (tờ khai IDA/EDA): nhóm khóa "theo thiết lập chữ ký số" trong `fieldEditBlock` (cùng cơ chế `AUTO_COMPUTED_KEYS`), lý do riêng:
  "Theo Thiết lập chữ ký số (Tài khoản & tích hợp › Chứng thư số)". Giao diện và backend cùng chặn. Ghi đè nguồn chỉ tiêu (Mặc định khai báo)
  không áp lên các ô này.
- **AMA** (chốt 21/11/2026): Mã đại lý `TK_A12` lấy **theo thiết lập hiện tại** (AMA gửi bằng tài khoản VNACCS hiện tại), không theo tờ khai gốc –
  ghi đè giá trị `amaHeaderFrom` chép từ tờ gốc (`post-amendment/rules.ts:148`). Khóa qua `HEADER_LOCKED` / `amaHeaderLocked`
  (`post-amendment/rules.ts:21,36`) với lý do riêng – AMA không đi qua `fieldEditBlock`. `TK_A13` (tên, Text 50 – `fpt/ama.ts:61`) **để trống**.
- Đổi thiết lập sau khi đã dựng tờ khai: lúc truyền, giá trị trên tờ khai khác giá trị tính từ thiết lập hiện tại → **chặn truyền**, lý do
  "Thiết lập chữ ký số đã đổi – cập nhật lại tờ khai", nút **Cập nhật theo thiết lập** (ghi lại các ô này, `field_audit` nguồn hệ thống).
  Không sửa ngầm: giá trị gửi đi luôn là giá trị người dùng đã thấy. AMA: kiểm bản nháp AMA với thiết lập hiện tại, cùng cách.
- Tờ khai **đã đăng ký** (khai sửa IDA/EDA trước thông quan – `amend.ts:24,35` khóa `TK_ICC`/`TK_ECC` theo luật): **không kiểm lệch**, giữ giá trị đã đăng ký.
- Dữ liệu cũ: **không chuyển đổi tự động**. Tờ khai nháp đang có Mã đại lý gõ tay → bị chặn khi truyền nếu lệch, bấm Cập nhật theo thiết lập một lần.

### 4.4 Nghiệp vụ V5 / HYS / KVGS / định danh
- Body có `MA_DAI_LY` / `TEN_DAI_LY` (định danh, danh sách container…): lấy từ thiết lập **lúc gửi** (`AGENT` → MST + tên đại lý,
  `COMPANY` → rỗng). `USER_ID` luôn lấy từ tài khoản VNACCS.
- `IdentifierRequestSchema`: giữ `agentTaxCode`, `agentName`, `userId` **tùy chọn** để đọc được bản ghi cũ; form không gửi nữa.
  Hiện code **đang đọc** chúng (`integration/application/identifier.ts:128` `row.request.userId`; `fpt-vnaccs-gateway.ts:383,392`
  `req.agentTaxCode/agentName`) → đổi `gatewayRequest` lấy đại lý từ thiết lập + `USER_ID` từ tài khoản VNACCS, bỏ qua giá trị trong `request`.
- Danh sách container: port đã có `agent?: { taxCode, name }` (`customs-ports.ts:238`) nhưng chưa ai điền → điền từ thiết lập.
- HYS / KVGS: builder kiểm đặc tả FPT xem body có ô đại lý không; có thì điền như trên, không có thì chỉ đổi tài khoản (đã đúng sẵn).

### 4.5 Giao diện
- *Tài khoản & tích hợp › Chứng thư số*: thêm thẻ **Thiết lập chữ ký số** phía trên danh sách chứng thư:
  ```
  Người ký     (•) Doanh nghiệp XNK   ( ) Đại lý khai thay
               └ MST đại lý [..........]  Tên đại lý [..................]   (chỉ khi chọn Đại lý)
  Cách ký      (•) Ký trực tiếp       ( ) Ký từ xa
  Gợi ý: Đại lý → tài khoản VNACCS phải là của đại lý; Mã đại lý trên tờ khai = 5 ký tự đầu User ID.
  [Lưu]
  ```
  Thành viên không phải Quản trị thấy chỉ đọc. `@kb/ui` (`RadioGroup`/`SegmentedControl` sẵn có), đủ vi/en/zh.
- Thẻ tài khoản VNACCS (tab Tích hợp): tiêu đề theo người ký.
- Hộp thoại đăng ký định danh: bỏ ô đại lý + User ID; hiện một dòng chỉ đọc "Khai thay bởi đại lý {tên} ({MST})" khi `AGENT`.
  Ô số lượng chặn > 50.
- Tờ khai (Review / bản in): ô 1.25 / 2.23 hiện giá trị, khóa, tooltip lý do.

### 4.6 Tài liệu
- ADR 0021 ngắn: thiết lập chữ ký số là cấu hình của doanh nghiệp, không mở rộng ADR 0004 sang đại lý nhiều doanh nghiệp.
- `docs/QUY-TRINH-NGHIEP-VU.md`: mục cấu hình khai báo; `apps/web/CLAUDE.md`: route mới.

### 4.7 Quyết định của Claude (chủ sản phẩm kiểm khi duyệt)
- Chưa có thiết lập = `COMPANY` + `DIRECT`; không chuyển dữ liệu cũ, dùng nút Cập nhật theo thiết lập khi lệch.
- Chặn truyền khi lệch thay vì sửa ngầm; tờ khai đã đăng ký thì không kiểm lệch.
- `TK_A13` để trống.
- Lưu `AGENT` khi User ID VNACCS < 5 ký tự → lỗi.

## 5. Không làm

- Ký số thật (trực tiếp / từ xa), chọn nhà cung cấp ký từ xa.
- Đại lý quản lý nhiều doanh nghiệp, nhiều bộ tài khoản VNACCS cho một doanh nghiệp.
- Sửa tay Mã đại lý trên tờ khai.

## 6. Kiểm thử

- Contracts: schema thiết lập (AGENT thiếu MST/tên → lỗi); `fieldEditBlock` khóa các ô đại lý.
- Core: lưu / đọc + quyền + `org_audit`; ánh xạ 1.25/2.23/`TK_A12` theo hai người ký; chặn truyền khi lệch; body V5 có / không có đại lý.
- Int: RLS bảng mới.
- Web: thẻ thiết lập (a11y, chỉ đọc khi không phải Quản trị), form định danh không còn ô đại lý, ô số lượng chặn 50; trình duyệt sáng/tối 1366/390, en/zh.
