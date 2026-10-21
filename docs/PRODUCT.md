# KhaiBáo AI – Tài liệu sản phẩm

> Phiên bản 0.1 · 2026-10-12 · Nguồn: prototype `khaibao-ai-v2.html`, POC `ocr-engine/poc`, các quyết định trong `docs/adr/`.
> Sơ đồ kiến trúc: `docs/architecture.html` (mở bằng trình duyệt).
> **Quy trình nghiệp vụ theo hệ thống hiện tại** (gồm luồng 12 nghiệp vụ Hải quan ở bước 6, thay cho mô tả bước 6 bên dưới): `docs/QUY-TRINH-NGHIEP-VU.md`.

## 1. Sản phẩm là gì

**KhaiBáo AI** là nền tảng SaaS giúp nhân viên khai báo của doanh nghiệp xuất nhập khẩu đi **từ bộ chứng từ đến tờ khai hải quan trong một luồng**:

> Upload Invoice, Packing List, B/L, C/O… → AI đọc chứng từ → hệ thống đối chiếu chéo và đánh dấu chỗ nghi ngờ → tra mã HS → dựng tờ khai → người duyệt → truyền Hải quan qua Customs Hub.

### Vấn đề
- Nhân viên chứng từ nhập tay từ 4–10 file PDF mỗi lô (15–30 phút/lô), dễ sai số liệu, sai mã, sót khoản cộng trị giá.
- Chứng từ của mỗi nhà cung cấp một kiểu (layout, ngôn ngữ, quy ước số EU/VN), nhiều bản là scan.
- Sai trên tờ khai dẫn đến bị phạt, truy thu thuế, hàng bị phân luồng đỏ.

### Giá trị khác biệt (so với tự upload lên ChatGPT/Gemini)
| Chat bot tổng quát | KhaiBáo AI |
|---|---|
| Đọc từng file, mỗi lần một định dạng | Đọc cả bộ chứng từ, luôn ra **một JSON chuẩn** |
| Không kiểm tra | **Đối chiếu chéo** giữa các chứng từ (trọng lượng, số lượng, số invoice, REX, cước khi EXW/FCA…) |
| Không biết nghiệp vụ | Biết chỉ tiêu tờ khai, khoản cộng trị giá, cảng chuyển tải, HS 8 số, xuất xứ ưu đãi |
| Không truy vết | Mỗi trường biết lấy từ chứng từ nào, trang nào; ai sửa, lúc nào |
| Dừng ở "ra chữ" | Đi tiếp tới tờ khai và truyền Hải quan |

### Khách hàng mục tiêu
Doanh nghiệp xuất nhập khẩu **tự khai báo**. Người dùng là nhân viên khai báo/chứng từ của chính doanh nghiệp (ADR 0004). Chưa phục vụ đại lý khai hộ nhiều doanh nghiệp.

## 2. Người dùng và vai trò

Mỗi doanh nghiệp (1 MST) là một **organization**. Đăng nhập bằng **email**.

| Vai trò | Làm được |
|---|---|
| Owner | Toàn quyền; gói dịch vụ & thanh toán; chuyển quyền sở hữu |
| Admin | Mời/khóa thành viên; cấu hình Skill AI; kết nối tích hợp, chứng thư số |
| Nhân viên khai báo | Tạo hồ sơ, upload, kiểm tra/sửa kết quả, chạy AI Agent, dựng tờ khai |
| Người duyệt | Phê duyệt tờ khai, truyền Hải quan |
| Xem | Chỉ xem |

**Đăng ký:** email + mật khẩu → xác thực email → nhập MST (điền sẵn tên/địa chỉ từ thông tin đăng ký thuế). MST mới → tạo organization, người đăng ký là Owner, gói dùng thử. MST đã có → gửi yêu cầu tham gia cho Owner duyệt.

## 3. Khái niệm

| Thuật ngữ | Nghĩa | Trong code |
|---|---|---|
| Hồ sơ khai báo | Một lô hàng cần khai, chạy qua 6 bước | `Dossier` |
| Chứng từ | Một văn bản trong lô (1 file có thể chứa nhiều chứng từ) | `Document` |
| Dữ liệu lô hàng | Kết quả đọc + gộp + chuẩn hóa từ mọi chứng từ | `Shipment` |
| Luật đối chiếu | Kiểm tra chéo giữa chứng từ → PASS/WARN/FAIL/SKIPPED, mức BLOCKER/WARNING/INFO | `ValidationRule` |
| Skill AI | Cấu hình cách đọc 1 loại chứng từ: trường chuẩn theo danh mục (`DOC_CATALOG`) + **trường bổ sung riêng** của doanh nghiệp (AI đọc thật), alias nhãn, ví dụ đã duyệt | `Skill` |
| Mặc định khai báo | Giá trị mặc định (loại hình, chi cục, kho, PTTT…) và nguồn từng chỉ tiêu trong phạm vi quy tắc cho phép – Cài đặt → Khai báo | `DeclarationProfile` |
| Tờ khai | IDA/IDC (nhập), EDA/EDC (xuất) theo VNACCS | `Declaration` |
| Dữ liệu số hóa | Bản dữ liệu chuẩn hóa của chứng từ (JSON/XML) để lưu trữ và đính kèm HYS | `DigitizedDocument` |

**Nghiệp vụ VNACCS dùng trong sản phẩm** (gọi qua Customs Hub):

| Mã | Nghiệp vụ |
|---|---|
| IDA / EDA | Khai trước thông tin tờ khai nhập / xuất → nhận số tờ khai |
| IDC / EDC | Khai chính thức → nhận kết quả phân luồng (xanh/vàng/đỏ) |
| HYS | Gửi hồ sơ chứng từ điện tử đính kèm tờ khai |
| IEX | Tham chiếu trạng thái tờ khai (thông quan, kiểm tra…) |

## 4. Luồng nghiệp vụ: 6 bước của một hồ sơ

```
1 Tạo hồ sơ → 2 Upload chứng từ → 3 OCR & kiểm tra → 4 AI Agent xử lý → 5 Review tờ khai → 6 Khai báo Hải quan
```

### Bước 1 – Tạo hồ sơ
- Chọn **Nhập khẩu / Xuất khẩu**, **phương thức vận chuyển**, **nhóm loại hình** (Kinh doanh / SXXK / Gia công / Chế xuất – lọc mã loại hình), **mã loại hình** (vd A11), **hạn khai**, **bộ Skill AI** áp dụng (mặc định của doanh nghiệp), **đối tác nước ngoài**, **cơ quan Hải quan**, ghi chú nội bộ.
- Hệ thống gợi ý danh sách chứng từ cần có theo loại hồ sơ. **Danh sách này là gợi ý có thể cấu hình, không chặn cứng**: thực tế nhiều lô không có Packing List (vd lô hàng không nhỏ).
- Không hỏi **điều kiện giao hàng** và **phân loại cá nhân/tổ chức**: điều kiện giao hàng lấy từ invoice ở bước OCR (dùng cho ô điều kiện giá, cộng cước/bảo hiểm, luật thiếu cước); phân loại cá nhân/tổ chức lấy theo Mặc định khai báo, sửa ở bước Review.

### Bước 2 – Upload chứng từ
- Kéo thả nhiều PDF/ảnh hoặc 1 file zip. Giới hạn số trang/dung lượng mỗi hồ sơ theo gói.
- Hệ thống: lưu file, tách trang, bỏ bản trùng (Original/Duplicate/Triplicate) và trang điều khoản in sẵn, phân loại từng trang.
- Hiển thị "còn thiếu chứng từ" theo gợi ý ở bước 1 (cảnh báo, không chặn).

### Bước 3 – OCR & kiểm tra
- Đường đọc rẻ nhất trước: hóa đơn điện tử → XML; PDF có lớp chữ → text; scan → AI đọc ảnh.
- **Khối "AI đối chiếu chéo"** ở đầu màn hình: danh sách luật khớp / lưu ý (vd "Trọng lượng Packing List khớp B/L", "Tên người mua trên Invoice là tên tiếng Anh, tờ khai dùng tên theo MST").
- Tab theo loại chứng từ (Commercial Invoice, Packing List, B/L, Sales Contract, C/O…), số trên tab là số trường cần xem.
- Trái: **chứng từ gốc**, phóng to/thu nhỏ; rê vào trường → tô vị trí trên chứng từ. Phải: **kết quả** theo nhóm (Thông tin chung, Người bán/mua, Thương mại, Danh sách hàng hóa); sửa trực tiếp hoặc bấm **Đúng**.
- Mỗi trường có **trạng thái** theo ADR 0003: Đã đối chiếu khớp / Chỉ 1 nguồn / Mâu thuẫn / Sai định dạng / Model không chắc / Người dùng đã xác nhận. Ngưỡng hiển thị cấu hình được.
- Thanh dưới: "Còn N trường nghi ngờ trên M chứng từ" + **Xác nhận dữ liệu**. Cho phép đi tiếp khi còn trường nghi ngờ; các trường đó được đánh dấu trên tờ khai.
- Mỗi lần sửa ghi `field_audit` (giá trị gốc, giá trị mới, người sửa, nguồn).

### Bước 4 – AI Agent xử lý
Hộp thoại chọn việc: **Tạo tờ khai** / **Tạo dữ liệu số hóa chứng từ** / **Cả hai**. Màn "Điều phối agent" hiện tiến trình từng bước theo thời gian thực:

| Bước | Làm gì | Ai làm |
|---|---|---|
| Tra cứu mã HS | Gửi HSCodePro theo lượt (≤ 50 dòng, chạy nền, poll 3 giây) → mã HS 8 số, độ tin cậy, lý do + căn cứ, cảnh báo, thuế NK (MFN/FTA theo C/O), VAT, tối đa 3 mã thay thế. AI có thể **hỏi lại người khai** (bảng "Xác nhận mã HS" → "Trả lời AI"); dòng lỗi/thiếu xuất xứ → "Phân loại lại". Dòng cần hỏi không chặn agent | HSCodePro (gợi ý) – **người phải xác nhận** (mã gợi ý, mã thay thế, mã trong biểu, hoặc nhập tay 8 số) |
| Ánh xạ dữ liệu | Quy tắc chỉ tiêu (`declaration/domain/mapping`) + Mặc định khai báo + ghi đè nguồn của doanh nghiệp; mỗi chỉ tiêu ghi nguồn gốc (provenance) | **Code + cấu hình**, không dùng AI (ADR 0002) |
| Dựng tờ khai | Tạo tờ khai nháp, tính trị giá tính thuế, thuế dự kiến; đề xuất thuế suất ưu đãi nếu C/O/REX hợp lệ | Code |
| Số hóa chứng từ | Tạo bản dữ liệu số cho từng chứng từ để lưu và đính kèm HYS | Code |

> Tên "Agent" giữ trên UI cho dễ hiểu, nhưng chỉ bước đọc chứng từ và gợi ý HS dùng AI.

### Bước 5 – Review tờ khai
- Tờ khai IDA/EDA dạng form, trạng thái "Bản nháp, chờ duyệt". Tab: **Thông tin chung · Danh sách hàng · Thuế & chính sách · Chứng từ đính kèm**.
- Mỗi chỉ tiêu có **nhãn nguồn**: Invoice / B/L / Packing List / Contract / C/O / Hồ sơ / Tài khoản / Mặc định / Hệ thống.
- Thanh dưới: **Tổng thuế phải nộp dự kiến** · Quay lại OCR · **Phê duyệt tờ khai** (vai trò Người duyệt).
- **Ô bắt buộc còn trống → khóa Phê duyệt**: khung "Còn N chỉ tiêu bắt buộc chưa nhập" liệt kê ô, nút **Đến ô cần xử lý** mở panel sửa ô. Bắt buộc = Phụ lục II (M, hoặc C khi tình huống áp dụng) + ô FPT.VNACCS bắt buộc người khai nhập (ô phần mềm tự điền và ô APP_* không tính). Một quy tắc (`@kb/contracts` requiredGaps) cho giao diện, mock và backend.
- Tỷ giá tính thuế: tỷ giá mua chuyển khoản Vietcombank cuối ngày thứ Năm tuần trước, áp cho tờ khai đăng ký trong tuần (tự lấy tối thứ Năm; đội vận hành sửa/nhập tay ở khu Quản trị → Tỷ giá tính thuế). Không dùng tỷ giá trên chứng từ forwarder. Màn Review hiện tuần + nguồn tỷ giá; tờ khai dựng tuần trước bị chặn truyền khi sang tuần mới (mở lại để dựng lại).
- Incoterm EXW/FCA/FAS/FOB: hiển thị rõ cước, bảo hiểm, phí nước ngoài được cộng vào trị giá tính thuế và nguồn của từng khoản (hóa đơn cước, Arrival Notice).

### Bước 6 – Khai báo Hải quan
- Chọn **chứng thư số** dùng để ký (vd "CÔNG TY TNHH … – VNPT-CA, hết hạn 12/2027").
- Danh sách nghiệp vụ truyền nhận với trạng thái và nút **Gửi lại**: IDA/EDA → IDC/EDC → HYS → IEX.
- **Kết quả từ Hải quan**: số tờ khai, phân luồng (xanh/vàng/đỏ + diễn giải), trạng thái (vd Đã thông quan), thuế HQ tính, thời điểm cập nhật.
- **Nhật ký thông điệp**: mỗi lần gửi/nhận một dòng (nghiệp vụ, kết quả, thời điểm), mở rộng xem chi tiết.
- **Chặn truyền** khi còn luật BLOCKER = FAIL, HS chưa xác nhận, chưa được phê duyệt, còn ô bắt buộc trống (kiểm lại lúc Ký số & khai tạm) hoặc thông điệp sai đặc tả FPT – chặn trước khi đánh dấu đã khai.

## 5. Màn hình

| Màn | Nội dung chính |
|---|---|
| Đăng nhập / Đăng ký | Email + mật khẩu; đăng ký doanh nghiệp theo MST; quên mật khẩu |
| Tổng quan | KPI: hồ sơ đang mở (nhập/xuất), sắp/quá hạn khai, tỷ lệ trường cần sửa, tờ khai đã truyền. "Cần xử lý" sắp theo hạn khai. "Kết quả khai báo gần đây" kèm phân luồng |
| Hồ sơ khai báo | Danh sách, lọc theo trạng thái/bước/hạn; mở hồ sơ vào đúng bước đang dở |
| Tạo hồ sơ | Bước 1 |
| Chi tiết hồ sơ | Thanh 6 bước + màn của bước hiện tại (bước 2–6) |
| Khai báo Hải quan | Danh sách tờ khai đã/đang truyền: hồ sơ, nghiệp vụ, số tờ khai, phân luồng, trạng thái, cập nhật |
| Cấu hình Skill AI | Danh sách skill (theo chứng từ, theo nhà cung cấp) kèm **độ chính xác đo trên mẫu đã gắn nhãn**. Chi tiết skill: tên, loại chứng từ, ngôn ngữ; bảng trường (mã, tên hiển thị, kiểu, bắt buộc, ánh xạ chỉ tiêu tờ khai); chứng từ mẫu đã gắn nhãn; nút **Đánh giá lại** |
| Tài khoản & tích hợp | Thông tin doanh nghiệp (MST khóa), gói dịch vụ, thành viên & vai trò, kết nối hệ thống (hscodepro, Customs Hub, dịch vụ AI) kèm trạng thái, chứng thư số, ngưỡng hiển thị trường nghi ngờ |

## 6. Tích hợp hệ thống bên thứ 3

| Hệ thống | Dùng cho | Gọi từ | Ghi chú |
|---|---|---|---|
| **HSCodePro** (`/internal/v1/hs-classifications`, tài liệu `docs/integrations/hscodepro-api-v1.md`) | Gợi ý HS 8 số + thuế NK/VAT theo C/O + mã thay thế; hỏi lại khi mô tả chưa đủ | Job nền: `run-agent` tạo lượt, `hs-poll` 3 giây, `hs-answer` gửi câu trả lời, `hs-reclassify` | Kết quả là gợi ý; người xác nhận mới dùng; khóa chỉ ở máy chủ (`HSCODEPRO_INTERNAL_KEY`) |
| **Customs Hub** (`/customs-hub/v1/vnaccs/{IDA,IDC,EDA,EDC,HYS,IEX}`) | Truyền tờ khai, gửi hồ sơ điện tử, tra trạng thái | Job nền ở bước 6 | Có ký số; lưu toàn bộ thông điệp; xem nguyên tắc dưới |
| **Nhà cung cấp AI** (Claude mặc định) | Đọc chứng từ | Worker bước 3 | Qua port `AiProvider`; đổi hãng không ảnh hưởng nghiệp vụ |
| Tra cứu hóa đơn điện tử | Đọc XML hóa đơn GTGT cước | Worker bước 3 | Rẻ và chính xác hơn đọc PDF |

Nguyên tắc tích hợp (chi tiết ở ADR 0005):
1. Mỗi hệ thống là một **port + adapter** trong module `integration`. Nghiệp vụ không biết định dạng API bên ngoài.
2. Gọi ngoài **luôn chạy bằng job nền**, không trong request web; UI nhận tiến trình qua SSE.
3. Truyền tờ khai **không được gửi trùng**: trước khi gửi lại phải tra trạng thái; mỗi thông điệp có khóa idempotency.
4. Lưu **mọi thông điệp** gửi/nhận (đã che thông tin nhạy cảm) làm hồ sơ pháp lý → màn "Nhật ký thông điệp".
5. Có **adapter giả lập (sandbox)** cho môi trường dev/test; không bao giờ gọi Hải quan thật khi phát triển.

## 7. Quy tắc nghiệp vụ cốt lõi

1. Mã định danh (MST, số vận đơn, số invoice, C/O, container, HS) giữ nguyên dạng chuỗi.
2. HS 8 số theo biểu Việt Nam luôn cần người xác nhận; mã 8 số trên invoice nước ngoài chỉ dùng 6 số đầu làm tham khảo.
3. Incoterm EXW/FCA/FAS/FOB bắt buộc có cước vận chuyển quốc tế để cộng trị giá; thiếu → BLOCKER.
4. Người nhập/xuất khẩu trên tờ khai lấy theo MST của organization, không theo tên tiếng Anh trên chứng từ.
5. Cảng dỡ hàng: nếu cảng trên B/L là cảng chuyển tải ở nước ngoài, dùng điểm đến cuối tại Việt Nam.
6. Xuất xứ ưu đãi: C/O (form E, D, AK, VK…) hoặc tự chứng nhận REX (EVFTA) phải khớp invoice; bản tra cứu REX cũ cần tra lại.
7. Không truyền tờ khai khi còn BLOCKER hoặc chưa phê duyệt.

## 8. Gói dịch vụ & chi phí

- Bên vận hành dùng API key của mình; khách mua theo gói (ADR liên quan: quyết định ngày 2026-10-12).
- Đơn vị tính: **số hồ sơ/tháng**, mỗi hồ sơ tối đa N trang; vượt thì tính thêm.
- Mọi lần gọi AI và API trả phí bên thứ 3 ghi `usage_events` theo organization để tính giá vốn và hạn mức.
- Gói gợi ý: Cơ bản / Chuyên nghiệp (skill theo nhà cung cấp, lịch sử) / Doanh nghiệp (API, truyền Hải quan, SLA).

## 9. Yêu cầu phi chức năng

| Mảng | Yêu cầu |
|---|---|
| Tách dữ liệu | `org_id` mọi bảng + Postgres RLS; file theo `orgs/{orgId}/`; test cô lập org bắt buộc |
| Truy vết | `field_audit` append-only; nhật ký thông điệp Hải quan; ghi lại phiên bản skill/prompt/model đã dùng cho mỗi hồ sơ |
| Bảo mật | Khóa API bên thứ 3 lưu trong secret store, không bao giờ gửi xuống trình duyệt; chứng thư số theo mục câu hỏi mở |
| Hiệu năng | Đọc 1 hồ sơ ~8 trang < 2–3 phút; UI không chặn, có tiến trình realtime |
| Chi phí AI | Mục tiêu sau tối ưu ~1.000–3.000đ/hồ sơ (đo lại bằng số thật) |
| Độ chính xác | Đo trên golden set theo từng trường; đổi prompt/model phải so trước/sau (skill `changing-extraction-prompt-or-model`) |

## 10. Phạm vi

| Giai đoạn | Có gì |
|---|---|
| **MVP** | Đăng ký/đăng nhập theo MST, tạo hồ sơ, upload, đọc chứng từ, đối chiếu chéo, màn OCR & kiểm tra, xuất JSON/Excel |
| **V1** | Skill + Đánh giá lại; gợi ý HS (hscodepro); dựng tờ khai IDA/EDA + review; đo chi phí & gói |
| **V2** | Truyền Hải quan qua Customs Hub (IDA/IDC/EDA/EDC/HYS/IEX), chứng thư số, nhật ký thông điệp |
| Chưa làm | Đại lý khai hộ nhiều doanh nghiệp; sửa/hủy tờ khai sau thông quan; app mobile |

## 11. Điều chỉnh so với prototype

| Prototype | Điều chỉnh | Lý do |
|---|---|---|
| Đăng nhập bằng "Email hoặc MST" | Chỉ email | MST là của doanh nghiệp, nhiều người dùng chung |
| % độ tin cậy từng trường | Trạng thái theo tín hiệu (ADR 0003); % chỉ khi đủ dữ liệu duyệt | LLM không trả độ tin cậy đáng tin |
| "Huấn luyện lại" skill | "Đánh giá lại" trên mẫu đã gắn nhãn | Không có huấn luyện model; mẫu dùng làm ví dụ + bộ đo |
| Agent ánh xạ dữ liệu | Quy tắc cấu hình + code | Tờ khai phải deterministic, kiểm thử được |
| CI/PL/B/L "bắt buộc" khi tạo hồ sơ | Gợi ý cấu hình được, cảnh báo thay vì chặn | Lô thật thường thiếu Packing List |
| (chưa có) | Khoản cộng trị giá khi EXW/FCA; bảng kê invoice; REX; hóa đơn GTGT cước | Gặp ở các lô thật đã chạy POC |

## 12. Câu hỏi mở (cần chốt trước V2)

1. **Customs Hub**: ký số do ai thực hiện – Customs Hub ký thay (giữ chứng thư), ký số từ xa qua nhà cung cấp CA, hay ký bằng USB token trên máy người dùng (cần phần mềm ký cài trên máy)? Lựa chọn này quyết định kiến trúc bước 6.
2. **Customs Hub**: API đồng bộ hay bất đồng bộ? Có webhook báo trạng thái hay phải gọi IEX định kỳ? Có môi trường sandbox không? Mã lỗi trả về dạng nào?
3. **Khóa API** hscodepro và Customs Hub: một khóa của bên vận hành dùng cho mọi doanh nghiệp, hay mỗi doanh nghiệp một khóa riêng (prototype đang hiện khóa trong trang tài khoản của doanh nghiệp)?
4. Chính sách lưu trữ chứng từ và dữ liệu: lưu bao lâu, xóa khi nào, khách tự xóa được không.
5. Phân quyền "Người duyệt" có bắt buộc khác người tạo tờ khai (nguyên tắc 4 mắt) hay không.

**Trạng thái khi dựng backend (2026-10-14):** (1) chưa chốt – backend chỉ kiểm chứng thư tồn tại khi truyền, giả định FPT ký bằng tài khoản VNACCS (BACKEND-TODO T5); (2) đặc tả FPT không có endpoint/xác thực/webhook – dùng outbox + hỏi IEX định kỳ, gateway giả cho demo (T1); (3) khóa theo doanh nghiệp lưu `org_secrets` (AES-GCM), chưa có màn nhập tài khoản VNACCS; (4) chưa chốt (N4); (5) code có tham số `fourEyes`, mặc định tắt, chưa có cấu hình org (N3).
