# Tỷ giá tính thuế tự động theo tuần (BACKEND-TODO D2)

Ngày: 2026-10-15 · Trạng thái: chờ duyệt

## 1. Mục tiêu

Mọi tờ khai dùng đúng tỷ giá tính thuế theo quy định, không cần ai nhập tay hằng tuần. Khi không lấy được tỷ giá, đội vận hành biết ngay và nhập tay được; người khai thấy rõ tỷ giá đang dùng lấy từ đâu.

## 2. Quy định (đã đối chiếu nguyên văn)

Điều 21 khoản 5 Nghị định 08/2015/NĐ-CP, sửa đổi bởi khoản 9 Điều 1 Nghị định 167/2025/NĐ-CP (hiệu lực 15/08/2025):

- Tỷ giá = tỷ giá **mua vào chuyển khoản** của **Hội sở chính Vietcombank**, **cuối ngày thứ Năm tuần trước liền kề**.
- Thứ Năm là ngày nghỉ/lễ → tỷ giá cuối ngày của ngày làm việc liền trước.
- Dùng cho **mọi tờ khai đăng ký trong tuần** (thứ Hai → Chủ nhật).
- Ngoại tệ Vietcombank không công bố → tỷ giá chéo do Ngân hàng Nhà nước công bố.

## 3. Nguồn dữ liệu

`https://portal.vietcombank.com.vn/Usercontrols/TVPortal.TyGia/pXML.aspx?b=10` (XML công khai, đã gọi thử 2026-10-15):

```xml
<ExrateList>
  <DateTime>10/15/2026 8:47:51 AM</DateTime>
  <Exrate CurrencyCode="USD" CurrencyName="US DOLLAR" Buy="…" Transfer="26,1xx.00" Sell="…" />
  …  <!-- Transfer="-" khi không công bố -->
</ExrateList>
```

Ràng buộc: chỉ có **bảng hiện tại** (không có lịch sử) và giới hạn **1 lần gọi / 5 phút**. Vì vậy phải chụp bảng đúng tối thứ Năm.

Ngày lễ không cần lịch nghỉ: tối thứ Năm nghỉ lễ, bảng vẫn là bảng của ngày làm việc gần nhất, đúng quy định. Lưu lại `DateTime` của bảng để đối chiếu.

## 4. Quyết định

| # | Quyết định | Lý do |
|---|---|---|
| R1 | Cột `date` của `exchange_rates` mang nghĩa **ngày bắt đầu hiệu lực** (thứ Hai của tuần áp dụng). Hàm tra hiện có "bản ghi mới nhất có `date` ≤ ngày khai" giữ nguyên | Không phải sửa phần dựng tờ khai; dữ liệu seed cũ vẫn tra được |
| R2 | Thêm cột: `snapshot_at` (giờ của bảng Vietcombank), `source` (`VCB` \| `MANUAL`), `updated_by`, `note` | Truy nguồn; phân biệt tự động/nhập tay |
| R3 | Job `exchange-rate-weekly` chạy **thứ Năm 23:30 giờ VN** (16:30 UTC). Lỗi → thử lại mỗi 30 phút tới **thứ Sáu 07:30 giờ VN** (trước khi Vietcombank đổi bảng sáng thứ Sáu) | "Cuối ngày" + tôn trọng giới hạn 5 phút + không bao giờ lấy nhầm bảng thứ Sáu |
| R4 | Job ghi tỷ giá với `date` = thứ Hai kế tiếp, `source = VCB`. **Không ghi đè bản ghi `MANUAL`** cùng tiền tệ + ngày | Đội vận hành sửa tay là quyết định cuối |
| R5 | Lấy cột `Transfer`; bỏ dòng có giá trị `-`. Số `26,123.45` → chuỗi thập phân `"26123.45"` (Decimal, không `number`) | Bất biến 3 |
| R6 | Hết khung thử lại mà vẫn lỗi → **thông báo cho nhân viên nền tảng** (quyền `PLATFORM`) + ghi nhật ký; tuần đó tờ khai dùng tỷ giá tuần trước kèm cảnh báo (hành vi "gần nhất ≤ ngày" hiện có) cho tới khi nhập tay | Không chặn khai báo; lỗi hiện rõ |
| R7 | Ngoại tệ Vietcombank không công bố (tỷ giá chéo NHNN): **nhập tay** ở khu Quản trị. Chưa có → giữ hành vi hiện tại (chỉ tiêu tỷ giá nghi ngờ, log agent cảnh báo) | NHNN chưa có nguồn máy đọc ổn định |
| R8 | **Chặn truyền** tờ khai nếu ngày truyền thuộc tuần khác tuần của tỷ giá đã dùng: "Tỷ giá đã sang tuần mới – mở lại tờ khai để cập nhật". Cùng kiểu với các luật chặn truyền hiện có | Tờ khai duyệt tuần này, truyền tuần sau sẽ sai thuế |
| R9 | Màn Review hiện: "Tỷ giá USD 26.123 – áp dụng tuần 13/10–19/10, Vietcombank chốt 20:00 09/10" (hoặc "nhập tay bởi …") | Người khai và người duyệt biết nguồn |

## 5. Thành phần

**contracts**
- `ExchangeRateSchema` (currency, effectiveFrom, rate, source, snapshotAt, updatedByName, note).
- `UpsertExchangeRateInputSchema` (currency ISO 4217 3 ký tự, effectiveFrom phải là thứ Hai, rate > 0, reason).
- `ExchangeRateJobStatusSchema`.

**core – module `declaration`**
- domain:
  - `vcb-xml.ts`: `parseVcbXml(xml)` → `{ boardAt, rates: { currency, transfer }[] }`, thuần; ném lỗi rõ ràng khi sai cấu trúc.
  - `rate-week.ts`: `weekStart(date)`, `nextMonday(date)`, `sameRateWeek(a, b)` theo giờ VN.
- application:
  - `captureWeeklyRates(deps)` (job, port `VcbRateSource` + repo).
  - `listExchangeRates`, `upsertExchangeRate` (khu Quản trị, quyền `PLATFORM`, kèm lý do, ghi nhật ký quản trị).
  - `exchangeRateJobStatus`.
- infrastructure:
  - `HttpVcbRateSource` (fetch, timeout 20s).
  - Repo ghi `exchange_rates` qua role nền tảng.
  - Migration thêm cột (R2) + quyền ghi cho role nền tảng.
- Luật chặn truyền R8 đặt chung chỗ với các guard truyền hiện có.

**worker**: job + lịch `upsertJobScheduler` (`30 16 * * 4` UTC) + thử lại (R3).

**web**
- Khu Quản trị → mục **"Tỷ giá tính thuế"**:
  - Bảng theo tuần × tiền tệ.
  - Thẻ trạng thái lần lấy gần nhất.
  - Nút "Thêm / sửa tỷ giá" (ReasonDialog, cần quyền `PLATFORM`).
- Màn Review: dòng nguồn tỷ giá (R9).
- Chế độ mock có dữ liệu tương ứng.

## 6. Lỗi & biên

- Vietcombank trả HTML, XML hỏng hoặc thiếu USD → coi là lỗi, thử lại, không ghi một phần.
- Ghi theo lô trong một transaction.
- Chạy lại cùng tuần (thử lại, khởi động lại worker) → upsert idempotent; không đụng `MANUAL`.
- Giờ VN: tính tuần theo `Asia/Ho_Chi_Minh`. Không dùng `Date.now()` trong domain (bất biến tầng).

## 7. Test

- Unit:
  - `parseVcbXml` với mẫu thật (lưu fixture), dòng `-`, số có dấu phẩy, XML hỏng.
  - `weekStart`/`nextMonday` qua ranh giới tuần và giờ VN ↔ UTC.
- Use case với fake:
  - Không ghi đè `MANUAL`.
  - Lỗi → không ghi gì.
  - Hết khung → thông báo nhân viên.
  - `upsertExchangeRate` cần `PLATFORM`.
  - Luật R8 chặn/không chặn.
- Repo integration (Testcontainers): upsert, quyền role.
- e2e: Quản trị thêm tỷ giá → dựng tờ khai dùng tỷ giá đó và hiện nguồn.

## 8. Ngoài phạm vi

- Tự lấy tỷ giá chéo từ Ngân hàng Nhà nước.
- Nhập lại lịch sử các tuần cũ (chỉ nhập tay nếu cần).
- Tỷ giá cho mục đích kế toán/hóa đơn.
