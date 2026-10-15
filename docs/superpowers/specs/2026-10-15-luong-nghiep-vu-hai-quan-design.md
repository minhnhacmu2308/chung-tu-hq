# Luồng nghiệp vụ tại bước Khai báo Hải quan

Ngày: 2026-10-15. Bố cục và phạm vi đã chốt với người dùng: **dòng đời theo giai đoạn**, **đủ luồng + mô phỏng**.

## 1. Mục tiêu

Bước 6 ("Khai báo Hải quan") hiện chạy một chuỗi tự động IDA → IDC → HYS → IEX. Thay bằng luồng có người điều khiển, đủ 12 nghiệp vụ, xếp theo giai đoạn của vòng đời tờ khai:

| Giai đoạn | Nghiệp vụ (nhập / xuất) | Ý nghĩa |
|---|---|---|
| ① Khai báo tờ khai | IDA/EDA → IDB/EDB → IDC/EDC | Khai tạm (nhận số tờ khai, thuế dự kiến) → gọi sửa khai tạm (nếu cần) → khai chính thức (phân luồng) |
| ② Sửa đổi bổ sung (trước thông quan) | IDD/EDD → IDA01/EDA01 → IDE/EDE | Gọi tờ khai đã phân luồng → khai tạm sửa đổi → khai chính thức sửa đổi |
| ③ Sửa đổi sau thông quan | AMA → AMB → AMC | Khai tạm sửa đổi → gọi sửa bản khai tạm → khai chính thức |
| ④ Chứng từ & cảng | HYS · CONT · PORT_FEE | Số hóa chứng từ · container qua khu vực giám sát · lệ phí cảng biển |
| (đầu trang) | IID / IEX | Tra cứu trạng thái tờ khai, dùng mọi lúc khi đã có số tờ khai |

## 2. Quy tắc dùng chung – `@kb/contracts/customs-flow.ts`

Hàm thuần, dùng cho cả backend (`modules/integration`) và mock FE, để hai bên cùng một quy tắc:

- `CustomsStage`: NOT_SENT, PRE_DECLARED, RECALLED, DECLARED, AMEND_RECALLED, AMEND_PRE_DECLARED, CLEARED, POST_EDITING, POST_PRE_DECLARED, POST_RECALLED, REJECTED.
- `stageAfter(stage, op)`: giai đoạn sau khi nghiệp vụ **thành công**; null = không hợp lệ.
- `operationAvailability(input)`: mỗi nghiệp vụ `{ enabled, action, reason }`.
  - `action`: `SEND` gửi thông điệp; `EDIT` phải sửa và duyệt lại tờ khai ở Review trước; `START_POST_EDIT` mở sửa sau thông quan.
- `nextCustomsOperation(input)`: việc tiếp theo nên làm (nổi bật trên màn).
- Mã theo chiều tờ khai: `opFor`, `baseOp`, `queryOpFor`, `operationsFor`.

Chuyển giai đoạn:

```
NOT_SENT ─IDA→ PRE_DECLARED ─IDC→ DECLARED ──(IID: thông quan)──→ CLEARED ─(mở sửa)→ POST_EDITING ─AMA→ POST_PRE_DECLARED ─AMC→ CLEARED
              │  ▲                 │  ▲                                                                   ▲          │
             IDB IDA              IDD IDE                                                                AMA        AMB
              ▼  │                 ▼  │                                                                   │          ▼
             RECALLED          AMEND_RECALLED ─IDA01→ AMEND_PRE_DECLARED (IDD lần nữa → AMEND_RECALLED)   POST_RECALLED
```

- Nghiệp vụ gọi về (IDB, IDD, AMB) và "mở sửa sau thông quan" → **mở lại tờ khai** (bước Review, DRAFT). Người khai sửa chỉ tiêu và Người duyệt phê duyệt lại; khi đó nghiệp vụ gửi nội dung tiếp theo (IDA, IDA01, AMA) mới bấm được.
- Nghiệp vụ gửi nội dung (IDA, IDA01, AMA và mã E… tương ứng) giữ bất biến 7: tờ khai đã duyệt, không còn BLOCKER FAIL, HS đủ, không có lỗi chặn khi dựng payload FPT.
- Đang chờ phản hồi một nghiệp vụ → khóa mọi nút khác.

## 3. Backend (`modules/integration`)

- **Thay đổi hành vi:**
  - `submitDeclaration` chỉ gửi **IDA** (không tự gửi IDC/HYS). IDC do người khai bấm sau khi xem số tờ khai và thuế dự kiến.
  - Hỏi trạng thái tự động (poll) bắt đầu sau IDC/IDE thành công.
- **Use case mới:**
  - `performOperation(op)`: tạo outbox cho nghiệp vụ gửi; tra cứu (IID/IEX) trả lời ngay.
  - `startPostAmendment()`: CLEARED → POST_EDITING, mở lại tờ khai.
- `processOutbox` xử lý mọi nghiệp vụ. Giai đoạn lưu ở `results.raw.stage`; cột `state` giữ nghĩa cũ cho màn danh sách. Không cần migration vì `raw` là jsonb.
- **Gateway:**
  - Thêm `send(op, …)` cho các nghiệp vụ mới.
  - `FakeCustomsGateway` (dev/demo/test) mô phỏng đủ các nghiệp vụ.
  - `FptVnaccsGateway` trả lỗi rõ "chưa kết nối FPT" cho nghiệp vụ chưa có đặc tả API: IDB, IDD, IDA01, IDE, AMB, AMC, CONT, PORT_FEE. AMA đã có đặc tả (VNACCS_AMA v1.3) nhưng chưa ánh xạ – làm ở bước sau.

## 4. Giao diện (bước 6)

```
┌ Tờ khai 107… · Luồng vàng ───────────── [⟳ IID Tra cứu] ┐
│ ▶ Việc tiếp theo: IDC – Khai chính thức      [Ký & gửi]  │
├──────────────────────────────────────────────────────────┤
│ ① Khai báo tờ khai                         ✓ Hoàn tất   │
│   IDA  Khai tạm thông tin             ✓     [Gửi lại]   │
│   IDB  Gọi sửa đổi tờ khai tạm              [Gọi về sửa]│
│   IDC  Khai chính thức                ✓                 │
│ ② Sửa đổi bổ sung (trước thông quan)       Đang mở      │
│ ③ Sửa đổi sau thông quan                   Chưa tới     │
│ ④ Chứng từ & cảng                                       │
└──────────────────────────────────────────────────────────┘
+ Kết quả từ Hải quan (cột phải) + Nhật ký thông điệp (dưới)
```

- Mỗi giai đoạn hiển thị trạng thái: Hoàn tất / Đang mở / Chưa tới (dẫn từ các dòng).
- Nút khóa có `reason` hiện ngay dưới tên nghiệp vụ.
- `action = EDIT` → nút "Sửa tờ khai" đưa sang bước Review.

## 5. Ngoài phạm vi lần này

- Ánh xạ payload FPT thật cho AMA (đặc tả đã có).
- Đặc tả FPT cho IDB/IDD/IDA01/IDE/AMB/AMC/container/lệ phí cảng: cần tài liệu.
- Server giả lập `apps/fpt-mock` không thêm endpoint: không có đặc tả để mô phỏng. Phần mô phỏng backend nằm ở `FakeCustomsGateway`.
