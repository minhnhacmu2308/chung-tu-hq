# API FPT.VNACCS (Customs Hub) – tài liệu tích hợp

> Sinh tự động bởi `scripts/vnaccs-api-docs/build.py` từ Postman `API-VNACCS NEW.postman_collection_21042026.json` + 11 file Excel đặc tả + mẫu phản hồi thật. **Đừng sửa tay** – sửa `ops.py`/`build.py` rồi chạy lại. Bản xem có sơ đồ, bấm vào từng nghiệp vụ: `docs/vnaccs-api/index.html`.

> **Nguồn ưu tiên khi lệch nhau**: Phản hồi thật của FPT (docdungapivnacss) > Excel đặc tả (TAI LIEU TICH HOP VNACCS) > Postman (có thể là bản cũ). Xác thực: Bearer token (đã xác nhận).

## 1. Quy ước chung

- **Giao thức**: `POST` JSON tới `{FPT_BASE_URL}/api/<NGHIỆP VỤ>` (Postman dùng host test `http://tsst.fcs.vn`; production chỉ đổi URL).
- **Xác thực**: **Bearer token** cho mọi API nghiệp vụ – `POST {FPT_BASE_URL}/api/auth/login` `{username, password}` (tài khoản API FPT cấp) → `{token, expiration}`, rồi gửi `Authorization: Bearer <token>`; hết hạn/sai → 401, đăng nhập lại. (Postman 21/04/2026 còn ghi HTTP Basic – đã cũ, FPT đã chuyển hết sang Bearer.)
- **Tài khoản VNACCS của doanh nghiệp** gửi trong body: `objVNACCS_ACCOUNT` = `{useR_ID, password, terminaL_ID, terminaL_ACCESS_KEY}` (các API VNACCS: IDx/EDx/AMx/HYS/VNACCSREP). Các API V5/định danh/tách vận đơn/container chỉ gửi `useR_ID` + mã doanh nghiệp.
- **Tên key**: tên chỉ tiêu Excel đổi kiểu camelCase của .NET – `TK_ECN` → `tK_ECN`, `USER_ID` → `useR_ID`, `LIST_FILE_HYS` → `lisT_FILE_HYS`. Riêng V5Bill/KVGS trong Postman viết HOA nguyên tên (`VD_SO`, `TK_SOTK`).
- **Kiểu dữ liệu**: ngày `dd/MM/yyyy` (chuỗi); số tờ khai `tK_ICN`/`tK_ECN`/`tK_SYN` là **number** 12 chữ số; tiền/lượng là number; file là base64 (HYS < 2MB/file).
- **Lỗi nghiệp vụ**: HTTP 200 + `errorList[]` `{errorCode, indexCode, nameCode, errorContent, proposedSolution, rowPosition}` (rowPosition = dòng hàng, "0000" = phần chung). Lỗi tài khoản/token: HTTP 401; body sai: 400.
- **Envelope phản hồi VNACCS**: `{objVNACCS_ACCOUNT, errorList, objIDA, objEDA, objAMA, vaF8030, vaF8010, vaE8000, vaE4740, vaL0020, vaD8000, vaD4870}` – chỉ khối của nghiệp vụ vừa gọi có dữ liệu. Mỗi phần tử objIDA/objEDA/objAMA có `objMsgResult {function, code, name, decNumber, time, type, ediBase64}` + các object tờ khai.
- **Thông điệp loại C / P** (REP_VNACCS): C = trả ngay cho lệnh vừa gửi; P = Hải quan trả sau (phân luồng, thuế, kiểm tra thực tế, thông quan…) → lấy bằng **VNACCSREP**.

## 2. Luồng nghiệp vụ

### Nhập khẩu – khai báo đến thông quan

`IDA → IDB → IDC → VNACCSREP / IID`

IDA khai tạm → (IDB gọi lại để sửa, rồi IDA lần nữa) → IDC khai chính thức, Hải quan phân luồng → nhận thông điệp phân luồng/thuế/thông quan qua VNACCSREP hoặc tra IID.

### Nhập khẩu – sửa đổi bổ sung trước thông quan

`IDD → IDA01 → IDE → VNACCSREP / IID`

Tờ khai đã IDC: IDD gọi thông tin về → IDA01 khai sửa đổi (tạm) → IDE đăng ký sửa đổi chính thức.

### Xuất khẩu – khai báo đến thông quan

`EDA → EDB → EDC → VNACCSREP / IEX`

Giống nhập khẩu: EDA khai tạm → (EDB gọi lại sửa) → EDC khai chính thức → phân luồng/thông quan.

### Xuất khẩu – sửa đổi bổ sung trước thông quan

`EDD → EDA01 → EDE → VNACCSREP / IEX`

EDD gọi thông tin sửa đổi → EDA01 khai sửa đổi → EDE đăng ký sửa đổi chính thức.

### Sửa đổi sau thông quan (tờ khai bổ sung)

`AMA → AMB → AMC → VNACCSREP`

AMA khai tạm tờ khai bổ sung (nhận số tK_SYN) → (AMB gọi lại sửa) → AMC đăng ký chính thức → Hải quan chấp nhận/không chấp nhận (VAL803–VAL806).

### Hồ sơ đính kèm điện tử (HYS)

`KyFile → hys`

Ký số file (nếu cần) → gửi HYS nhận số tiếp nhận tK_JNO để ghi vào ô đính kèm của tờ khai (khai trước IDA/EDA).

### Chứng từ đính kèm bổ sung V5 (sau khi có số tờ khai)

`V5Bill / V5Invoice / V5Permit / V5Contract / V5Co / V5Container / V5OtherDoc → V5Response`

Gửi từng loại chứng từ kèm file → nhận REF_ID → hỏi kết quả V5Response tới khi có số tiếp nhận / bị từ chối.

### Vận đơn & định danh hàng hóa

`V5IdentifierReq → V5IdentifierRes → TachVanDonReq → TachVanDonRes`

Khai định danh nhận REF_ID → hỏi kết quả lấy số định danh + QR. Tách vận đơn (nhập khẩu) → hỏi kết quả lấy số tiếp nhận.

### Container

`ContainerReq / V5ContainerReq → ContainerRes / V5ContainerRes → KVGS`

Khai danh sách container cho tờ khai → hỏi kết quả. KVGS: lấy thông tin đưa hàng qua khu vực giám sát (mã vạch).

## 3. Từng nghiệp vụ

### Xác thực & phản hồi chung

#### login – Đăng nhập API (lấy token)

- **Endpoint**: `POST {{FPT_BASE_URL}}/api/auth/login` · xác thực: Không
- **Mục đích**: Lấy JWT để gọi các API nghiệp vụ (mọi API dùng `Authorization: Bearer <token>`). Tài khoản API (username/password do FPT cấp cho phần mềm) khác tài khoản VNACCS của từng doanh nghiệp.
- **Khi nào gọi**: Trước mọi lời gọi; giữ token tới gần `expiration` rồi đăng nhập lại. Hết hạn / sai token → HTTP 401.
- **Ghi chú phản hồi**: `{ token, expiration }` – JWT HS256, `expiration` dạng ISO có múi giờ. Mẫu thật: apps/fpt-mock/src/fixtures/login-response.json.

<details><summary>Body mẫu (Postman, đã che mật khẩu, cắt base64) – đầy đủ: samples/login.request.json</summary>

```json
{
  "username": "***",
  "password": "***"
}
```
</details>

<details><summary>Phản hồi thật</summary>

```json
{
  "token": "***",
  "expiration": "2026-10-14T18:02:22Z"
}
```
</details>


#### VNACCSREP – Lấy thông điệp phản hồi từ VNACCS

- **Endpoint**: `POST {{FPT_BASE_URL}}/api/VNACCSREP` · xác thực: Bearer token (từ /api/auth/login)
- **Mục đích**: Lấy các thông điệp Hải quan trả về sau (loại P trong REP_VNACCS): kết quả phân luồng (VAE1LD0…/VAD…), thông quan (VAE1LF0), chứng từ ghi số thuế (VAF8010), lệ phí (VAF8030), yêu cầu/hủy kiểm tra thực tế (VAE4740/VAD4870), chỉ thị sửa đổi (VAE8000/VAD8000), kết quả tờ khai bổ sung (VAL803–806).
- **Khi nào gọi**: Định kỳ sau IDC/EDC/IDE/EDE/AMC (và khi cần làm mới trạng thái). Body chỉ có tài khoản VNACCS của doanh nghiệp.
- **Ghi chú phản hồi**: Chưa có mẫu phản hồi. Theo cấu trúc chung, phản hồi là envelope có các mảng objIDA/objEDA/objAMA (mỗi phần tử có objMsgResult.code = mã thông điệp) và các khối vaF8010/vaF8030/vaE4740/vaE8000/vaD8000/vaD4870/vaL0020. Cần FPT xác nhận: thông điệp đã lấy có bị xóa khỏi hàng đợi không (lấy một lần) hay lấy lại được.

<details><summary>Body mẫu (Postman, đã che mật khẩu, cắt base64) – đầy đủ: samples/VNACCSREP.request.json</summary>

```json
{
  "useR_ID": "***",
  "password": "***",
  "terminaL_ID": "***",
  "terminaL_ACCESS_KEY": "***"
}
```
</details>


### Tờ khai nhập khẩu (IDA…IID)

#### IDA – Khai tạm tờ khai nhập khẩu

- **Endpoint**: `POST {{FPT_BASE_URL}}/api/IDA` · xác thực: Bearer token (từ /api/auth/login)
- **Mục đích**: Gửi toàn bộ thông tin tờ khai nhập (chung, vận đơn, khai trị giá, hàng). Hải quan cấp số tờ khai (tK_ICN), tự tính thuế dự kiến; tờ khai ở trạng thái khai tạm, chưa đăng ký.
- **Khi nào gọi**: Lần khai đầu; hoặc sau IDB (gọi lại) để gửi bản đã sửa. Lô > 50 dòng: tách tờ khai nhánh (tK_FIC/tK_BNO/tK_DNO).
- **Bước tiếp theo**: IDB, IDC
- **Phản hồi**: envelope, dữ liệu ở `objIDA`

<details><summary>Body mẫu (Postman, đã che mật khẩu, cắt base64) – đầy đủ: samples/IDA.request.json</summary>

```json
{
  "objVNACCS_ACCOUNT": {
    "useR_ID": "***",
    "password": "***",
    "terminaL_ID": "***",
    "terminaL_ACCESS_KEY": "***"
  },
  "objVN_IDA": {
    "tK_ICB": "A12",
    "tK_CCC": "",
    "tK_MTC": "2",
    "tK_SKB": "4",
    "tK_ICN": null,
    "tK_FIC": "",
    "tK_BNO": "",
    "tK_DNO": "",
    "tK_TDN": null,
    "tK_RED": "",
    "tK_IMC": "4100811111001",
    "tK_IMN": "Công Ty TNHH Daekwang Vina",
    "tK_IMY": "(+084)",
    "tK_IMA": "THON XUAN LONG, XA GIA SON, HUYEN NHO QUAN, TINH NINH BINH, VIET NAM",
    "tK_IMT": "0909090909",
    "tK_NMC": "",
    "tK_NMN": "",
    "tK_EPC": "",
    "tK_EPN": "DAEKWANG VINA CO.,LTD",
    "tK_EPY": "",
    "tK_EPA": "#25. DAESEONG-RO 181BEON-GIL",
    "tK_EP2": "HANAM-SI,",
    "tK_EP3": "GYEONGGI-DO,",
    "tK_EP4": "KOREA",
    "tK_EPO": "KR",
    "tK_ENM": "",
    "tK_OL1": "MO",
    "tK_OL2": "",
    "tK_OL3": "",
    "tK_OL4": "",
    "tK_OL5": "",
    "tK_IV1": "A",
    "tK_IV2": null,
    "tK_IV3": "YJ-181015-01",
    "tK_IVD": "30/09/2025",
    "tK_IVP": "KC",
    "tK_IP1": "A",
    "tK_IP2": "FOB",
    "tK_IP3": "USD",
    "tK_IP4": 29820,
    "tK_TP": null,
    "tK_N4": "",
    "tK_SS1": "",
    "tK_SN1": "",
    "tK_SS2": "",
    "tK_SN2": "",
    "tK_SS3": "",
    "tK_SN3": "",
    "tK_SS4": "",
    "tK_SN4": "",
    "tK_SS5": "",
    "tK_SN5": "",
    "tK_ENC": "D",
    "tK_TPM": "1",
    "tK_BP": "",
    "tK_EA1": "",
    "tK_EB1": null,
    "tK_EA2": "",
    "tK_EB2": null,
    "tK_EA3": "",
    "tK_EB3": null,
    "tK_NT2": "HD: YJC-180629-01, ngay 29/06/2018;",
    "tK_REF": "",
    "tK_DPD": "",
    "tK_ST1": "",
    "tK_AD1": "",
    "tK_SD1": "",
    "tK_ST2": "",
    "tK_AD2": "",
    "tK_SD2": "",
    "tK_ST3": "",
    "tK_AD3": "",
    "tK_SD3": "",
    "tK_ARP": "",
    "tK_ADT": "",
    "tK_RYA": "",
    "tK_SBC": "",
    "tK_BCN": "",
    "tK_SCN": "",
    "tK_SCM": "",
    "tK_ICC": "",
    "tK_ICD": "",
    "tK_CH": "88AB",
    "tK_BCM": "",
    "tK_BYA": "",
    "tK_BRC": ""
  },
  "objVN_IDA_VANDON": {
    "vD_BL1": "300925VPNBEF1810058",
    "vD_BL2": "",
    "vD_BL3": "",
    "vD_BL4": "",
    "vD_BL5": "",
    "vD_NO": "208",
    "vD_NOT": "CT",
    "vD_GW": 7553.3,
    "vD_GWT": "KGM",
    "vD_COC": "1",
    "vD_ST": "03CCS04",
    "vD_DST": "PTS",
    "vD_DSN": "PTSC DINH VU",
    "vD_PSC": "CNNGB",
    "vD_PSN": "NINGBO",
    "vD_VSC": "9999",
    "vD_VSN": "KUO LUNG 1841S",
    "vD_ARR": "30/09/2025",
    "vD_MRK": "",
    "vD_ISD": ""
  },
  "objVN_IDA_KTG": {
    "ktG_VD1": "6",
    "ktG_VD2": "",
    "ktG_VCC": "",
    "ktG_VPC": null,
    "ktG_FR1": "A",
    "ktG_FR2": "USD",
    "ktG_FR3": 300,
    "ktG_IN1": "D",
    "ktG_IN2": "",
    "ktG_IN3": null,
    "ktG_IN4": "",
    "ktG_VR1": "",
    "ktG_VI1": "",
    "ktG_VC1": "",
    "ktG_VP1": null,
    "ktG_VT1": null,
    "ktG_VR2": "",
    "ktG_VI2": "",
    "ktG_VC2": "",
    "ktG_VP2": null,
    "ktG_VT2": null,
    "ktG_VR3": "",
    "ktG_VI3": "",
    "ktG_VC3": "",
    "ktG_VP3": null,
    "ktG_VT3": null,
    "ktG_VR4": "",
    "ktG_VI4": "",
    "ktG_VC4": "",
    "ktG_VP4": null,
    "ktG_VT4": null,
    "ktG_VR5": "",
    "ktG_VI5": "",
    "ktG_VC5": "",
    "ktG_VP5": null,
    "ktG_VT5": null,
    "ktG_VLD": "30092025#&PHUONG THUC THANH TOAN: TT"
  },
  "objVN_IDA_HANG": [
    {
      "haG_CMD": "84522900",
      "haG_GZC": "",
      "haG_CMN": "Máy may Công nghiệp. Hiệu JACK. Model A5-W. Hàng đồng bộ gồm đầu máy, chân bàn. Máy may 1 kim điện tử trong xưởng may mặc. Điện 220V, 550W. Mới 100%",
      "haG_QN1": 71,
      "haG_QT1": "SET",
      "haG_VN1": "",
      "haG_VN2": "",
      "haG_VN3": "",
      "haG_VN4": "",
      "haG_VN5": "",
      "haG_QN2": 71,
      "haG_QT2": "SET",
      "haG_BPR": 29820,
      "haG_UPR": 420,
      "haG_UPC": "USD",
      "haG_TSC": "SET",
      "haG_SPD": "",
      "haG_OR": "CN",
      "haG_ORS": "B01",
      "haG_KWS": "",
      "haG_TDL": "",
      "haG_TXN": null,
      "haG_TXR": "",
      "haG_RE": "",
      "haG_TX1": "VB901",
      "haG_TR1": "",
      "haG_TG1": null,
      "haG_TX2": "",
      "haG_TR2": "",
      "haG_TG2": null,
      "haG_TX3": "",
      "haG_TR3": "",
      "haG_TG3": null,
      "haG_TX4": "",
      "haG_TR4": "",
      "haG_TG4": null,
      "haG_TX5": "",
      "haG_TR5": "",
      "haG_TG5": null,
      "haG_REG": null,
      "haG_TXC": "",
      "haG_TXB": null,
      "haG_TXA": null,
      "haG_DPR": null,
      "haG_BPC": "",
      "haG_TXD": ""
    }
  ]
}
```
</details>


<details><summary>Trường – objVN_IDA (126 trường · VNACCS_IDA v1.2.xlsx / VN_IDA)</summary>

| Chỉ tiêu | Key JSON | Kiểu | Độ dài | Mô tả | Bắt buộc | Req | Res | Ghi chú |
|---|---|---|---|---|---|---|---|---|
| TK_ID | `tK_ID` | Long Integer |  | Tờ khai ID FPT.VNACSS |  |  |  |  |
| TK_ICN | `tK_ICN` | Decimal | 12 | Số tờ khai |  |  |  |  |
| TK_JKN | `tK_JKN` | Text | 1 | Phân loại kết xuất báo cáo đã sửa |  |  |  |  |
| TK_FIC | `tK_FIC` | Text | 12 | Số tờ khai đầu tiên |  |  |  |  |
| TK_BNO | `tK_BNO` | Long Integer |  | Số nhánh của tờ khai chia nhỏ |  |  |  |  |
| TK_DNO | `tK_DNO` | Long Integer |  | Tổng số tờ khai chia nhỏ |  |  |  |  |
| TK_TDN | `tK_TDN` | Decimal | 12 | Số tờ khai tạm nhập tái xuất tương ứng |  |  |  |  |
| TK_A06 | `tK_A06` | Text | 3 | Mã phân loại kiểm tra |  |  |  |  |
| TK_A00 | `tK_A00` | Text | 4 | Mã số hàng hóa đại diện |  |  |  |  |
| TK_A07 | `tK_A07` | Text | 10 | Tên cơ quan Hải quan |  |  |  |  |
| TK_CHB | `tK_CHB` | Text | 2 | Đội thủ tục | ✓ |  |  | Don vi Hai quan.xls |
| TK_A09 | `tK_A09` | Date/Time | 8 | Ngày đăng ký |  |  |  |  |
| TK_AD11 | `tK_AD11` | Text | 6 | Giờ đăng ký |  |  |  |  |
| TK_AD21 | `tK_AD21` | Date/Time | 8 | Ngày thay đổi đăng ký |  |  |  |  |
| TK_AD31 | `tK_AD31` | Text | 6 | Giờ thay đổi đăng ký |  |  |  |  |
| TK_RED | `tK_RED` | Date/Time | 8 | Thời hạn tái xuất |  |  |  |  |
| TK_AAA | `tK_AAA` | Text | 1 | Biểu thị trường hợp hết hạn |  |  |  |  |
| TK_IMC | `tK_IMC` | Text | 13 | Mã số thuế nhập khẩu | ✓ |  |  |  |
| TK_IMN | `tK_IMN` | Text | 100 | Tên người nhập khẩu | ✓ |  |  |  |
| TK_IMY | `tK_IMY` | Text | 7 | Mã bưu chính | ✓ |  |  |  |
| TK_IMA | `tK_IMA` | Text | 100 | Địa chỉ người nhập khẩu | ✓ |  |  |  |
| TK_IMT | `tK_IMT` | Text | 20 | Số điện thoại người nhập khẩu |  |  |  |  |
| TK_NMC | `tK_NMC` | Text | 13 | Mã người ủy thác nhập khẩu |  |  |  |  |
| TK_NMN | `tK_NMN` | Text | 100 | Tên người ủy thác nhập khẩu |  |  |  |  |
| TK_EPC | `tK_EPC` | Text | 13 | Mã người xuất khẩu |  |  |  |  |
| TK_EPN | `tK_EPN` | Text | 70 | Tên người xuất khẩu | ✓ |  |  |  |
| TK_EPY | `tK_EPY` | Text | 9 | Mã bưu chính |  |  |  |  |
| TK_EPA | `tK_EPA` | Text | 35 | Địa chỉ 1(Street and number/P.O.BOX) | ✓ |  |  |  |
| TK_EP2 | `tK_EP2` | Text | 35 | Địa chỉ 2(Street and number/P.O.BOX) |  |  |  |  |
| TK_EP3 | `tK_EP3` | Text | 35 | Địa chỉ 3(City name) |  |  |  |  |
| TK_EP4 | `tK_EP4` | Text | 35 | Địa chỉ 4(Country sub-entity, name) |  |  |  |  |
| TK_EPO | `tK_EPO` | Text | 2 | Mã nước(Country, coded) |  |  |  | Nuoc.xls |
| TK_ENM | `tK_ENM` | Text | 70 | Người ủy thác xuất khẩu |  |  |  |  |
| TK_A37 | `tK_A37` | Text | 5 | Mã đại lý Hải quan |  |  |  |  |
| TK_A38 | `tK_A38` | Text | 50 | Tên đại lý Hải quan |  |  |  |  |
| TK_A39 | `tK_A39` | Text | 5 | Mã nhân viên Hải quan |  |  |  |  |
| TK_OL1 | `tK_OL1` | Text | 2 | Mã văn bản pháp quy khác |  |  |  | CẬP NHẬT MÃ VĂN BẢN 2024 (19.01.2024).xlsx |
| TK_OL2 | `tK_OL2` | Text | 2 | Mã văn bản pháp quy khác |  |  |  | CẬP NHẬT MÃ VĂN BẢN 2024 (19.01.2024).xlsx |
| TK_OL3 | `tK_OL3` | Text | 2 | Mã văn bản pháp quy khác |  |  |  | CẬP NHẬT MÃ VĂN BẢN 2024 (19.01.2024).xlsx |
| TK_OL4 | `tK_OL4` | Text | 2 | Mã văn bản pháp quy khác |  |  |  | CẬP NHẬT MÃ VĂN BẢN 2024 (19.01.2024).xlsx |
| TK_OL5 | `tK_OL5` | Text | 2 | Mã văn bản pháp quy khác |  |  |  | CẬP NHẬT MÃ VĂN BẢN 2024 (19.01.2024).xlsx |
| TK_IV1 | `tK_IV1` | Text | 1 | Phân loại hình thức hóa đơn | ✓ |  |  | A: Hóa đơn( Sử dụng trong trường hợp Doanh nghiệp sử dụng hóa đơn để khai báo tờ khai).<br>B: Chứng từ thay thế hóa đơn( Sử dụng trong trường hợp Doanh nghiệp có nhiều hóa đơn được tổng hợp thành 1 hóa đơn tổng đã khai bằng HYS, hoặc chứng từ thay thế cho hóa đơn).<br>D: Hóa đơn điện tử (sử dụng trong trường hợp Doanh nghiệp đã đăng kí hóa đơn điện tử trên VNACCS). |
| TK_IV3 | `tK_IV3` | Text | 35 | Số hóa đơn |  |  |  |  |
| TK_IV2 | `tK_IV2` | Decimal | 12 | Số tiếp nhận hóa đơn điện tử |  |  |  |  |
| TK_IVD | `tK_IVD` | Date/Time | 8 | Ngày phát hành |  |  |  |  |
| TK_IVP | `tK_IVP` | Text | 7 | Phương thức thanh toán | ✓ |  |  | BIENMAU: Biên mậu<br>DA: Nhờ thu chấp nhận chứng từ<br>CAD: Trả tiền lấy chứng từ<br>CANTRU: Cấn trừ<br>CASH: Tiền mặt<br>CHEQUE: Séc<br>DP: Nhờ thu kèm chứng từ<br>GV: Góp vốn<br>H-D-H: Hàng đổi hàng<br>H-T-N: Hàng trả nợ<br>HPH: Hối phiếu<br>KHONGTT: Không thanh toán<br>LC: Tín dụng thư<br>LDDT: Liên doanh đầu tư<br>OA: Mở tài khoản thanh toán<br>TTR: Điện chuyển tiền<br>KC: Khác |
| TK_IP1 | `tK_IP1` | Text | 1 | Mã phân loại giá hóa đơn | ✓ |  |  | A: Giá hóa đơn cho hàng hóa phải trả tiền<br>B: Giá hóa đơn cho hàng hóa không phải trả tiền (F.O.C/hàng khuyến mại)<br>C: Giá hóa đơn cho hàng hóa bao gồm phải trả tiền và không phải trả tiền<br>D: Các trường hợp khác (bao gồm cả trường hợp không có hóa đơn thương mại). |
| TK_IP2 | `tK_IP2` | Text | 3 | Mã điều kiện giao hàng | ✓ |  |  | CIF : Đã bao gồm tiền hàng, bảo hiểm và cước phí.<br>CIP : Đã bao cước phí và phí bảo hiểm trả tới.<br>FOB : Giao hàng trên tàu.<br>FCA : Giao cho người chuyên chở.<br>FAS : Giao dọc mạn tàu.<br>EXW : Giao tại xưởng.<br>C&F : Bao gồm tiền hàng và cước phí.<br>CFR : Bao gồm tiền hàng và cước phí.<br>CPT : Bao gồm cước phí trả tới.<br>DDP : Giao hàng đã nộp thuế.<br>DAP : Giao hàng tại chổ.<br>DAT : Giao hàng tại cảng.<br>C&I :Đã bao gồm tiền hàng và phí bảo hiểm.<br>DAF : Giao tại biên giới.<br>DDU : Giao hàng chưa nộp thuế.<br>DES : Giao hàng tại tàu.<br>DEQ : Giao hàng tại cầu cảng. |
| TK_IP3 | `tK_IP3` | Text | 3 | Mã đồng tiền của hóa đơn | ✓ |  |  | Tien te.xls |
| TK_IP4 | `tK_IP4` | Double |  | Tổng trị giá  hóa đơn | ✓ |  |  |  |
| TK_A86 | `tK_A86` | Decimal | 27.8 | Tổng trị giá tính thuế |  |  |  |  |
| TK_TP | `tK_TP` | Decimal | 20.4 | Tổng hệ số phân bổ trị giá |  |  |  |  |
| TK_A97 | `tK_A97` | Text | 1 | Mã phân loại nhập liệu cho Tổng giá cơ bản |  |  |  |  |
| TK_N4 | `tK_N4` | Text | 1 | Mã kết quả kiểm tra nội dung |  |  |  |  |
| TK_SS1 | `tK_SS1` | Text | 4 | Phân loại giấy phép nhập khẩu |  |  |  | CẬP NHẬT MÃ VĂN BẢN 2024 (19.01.2024).xlsx |
| TK_SN1 | `tK_SN1` | Text | 20 | Số của giấy phép |  |  |  |  |
| TK_SS2 | `tK_SS2` | Text | 4 | Phân loại giấy phép nhập khẩu |  |  |  | CẬP NHẬT MÃ VĂN BẢN 2024 (19.01.2024).xlsx |
| TK_SN2 | `tK_SN2` | Text | 20 | Số của giấy phép |  |  |  |  |
| TK_SS3 | `tK_SS3` | Text | 4 | Phân loại giấy phép nhập khẩu |  |  |  | CẬP NHẬT MÃ VĂN BẢN 2024 (19.01.2024).xlsx |
| TK_SN3 | `tK_SN3` | Text | 20 | Số của giấy phép |  |  |  |  |
| TK_SS4 | `tK_SS4` | Text | 4 | Phân loại giấy phép nhập khẩu |  |  |  | CẬP NHẬT MÃ VĂN BẢN 2024 (19.01.2024).xlsx |
| TK_SN4 | `tK_SN4` | Text | 20 | Số của giấy phép |  |  |  |  |
| TK_SS5 | `tK_SS5` | Text | 4 | Phân loại giấy phép nhập khẩu |  |  |  | CẬP NHẬT MÃ VĂN BẢN 2024 (19.01.2024).xlsx |
| TK_SN5 | `tK_SN5` | Text | 20 | Số của giấy phép |  |  |  |  |
| TK_ENC | `tK_ENC` | Text | 1 | Mã xác định thời hạn nộp thuế |  |  |  | A: trường hợp được áp dụng thời hạn nộp thuế do sử dụng bảo lãnh riêng.<br>B: trường hợp được áp dụng thời hạn nộp thuế do sử dụng bảo lãnh chung.<br>C: trường hợp được áp dụng thời hạn nộp thuế mà không sử dụng bảo lãnh.<br>D: trong trường hợp nộp thuế ngay. |
| TK_TPM | `tK_TPM` | Text | 1 | Người nộp thuế | ✓ |  |  | 1: Người nộp thuế chính là người nhập khẩu.<br>2: Người nộp thuế chính là đại lý làm thủ tục hải quan |
| TK_BP | `tK_BP` | Text | 1 | Mã lý do đề nghị BP (release before permit) |  |  |  | A: Chờ xác định mã số hàng hóa.<br>B: Chờ xác định trị giá tính thuế.<br>C: Trường hợp khác. |
| TK_B08 | `tK_B08` | Text | 1 | Phân loại nộp thuế |  |  |  |  |
| TK_B12 | `tK_B12` | Long Integer |  | Tổng số trang của tờ khai |  |  |  |  |
| TK_B13 | `tK_B13` | Long Integer |  | Tổng số dòng hàng của tờ khai |  |  |  |  |
| TK_EA1 | `tK_EA1` | Text | 3 | Phân loại đính kèm khai báo điện tử |  |  |  | INV: Chứng từ đính kèm bằng HYS là hóa đơn<br>BOL: Chứng từ đính kèm bằng HYS là B/L.<br>AWB: Chứng từ đính kèm bằng HYS là AWB.<br>INS: Chứng từ đính kèm bằng HYS là bảo hiểm.<br>CON: Chứng từ đính kèm bằng HYS là hợp đồng. <br>ALL: Chứng từ đính kèm bằng HYS là tất cả hồ sơ.<br>ETC: Chứng từ đính kèm bằng HYS là loại khác. |
| TK_EB1 | `tK_EB1` | Decimal | 12 | Số đính kèm khai báo điện tử |  |  |  |  |
| TK_EA2 | `tK_EA2` | Text | 3 | Phân loại đính kèm khai báo điện tử |  |  |  | INV: Chứng từ đính kèm bằng HYS là hóa đơn<br>BOL: Chứng từ đính kèm bằng HYS là B/L.<br>AWB: Chứng từ đính kèm bằng HYS là AWB.<br>INS: Chứng từ đính kèm bằng HYS là bảo hiểm.<br>CON: Chứng từ đính kèm bằng HYS là hợp đồng. <br>ALL: Chứng từ đính kèm bằng HYS là tất cả hồ sơ.<br>ETC: Chứng từ đính kèm bằng HYS là loại khác. |
| TK_EB2 | `tK_EB2` | Decimal | 12 | Số đính kèm khai báo điện tử |  |  |  |  |
| TK_EA3 | `tK_EA3` | Text | 3 | Phân loại đính kèm khai báo điện tử |  |  |  | INV: Chứng từ đính kèm bằng HYS là hóa đơn<br>BOL: Chứng từ đính kèm bằng HYS là B/L.<br>AWB: Chứng từ đính kèm bằng HYS là AWB.<br>INS: Chứng từ đính kèm bằng HYS là bảo hiểm.<br>CON: Chứng từ đính kèm bằng HYS là hợp đồng. <br>ALL: Chứng từ đính kèm bằng HYS là tất cả hồ sơ.<br>ETC: Chứng từ đính kèm bằng HYS là loại khác. |
| TK_EB3 | `tK_EB3` | Decimal | 12 | Số đính kèm khai báo điện tử |  |  |  |  |
| TK_NT2 | `tK_NT2` | Text | 100 | Phần ghi chú |  |  |  |  |
| TK_REF | `tK_REF` | Text | 20 | Số quản lý của nội bộ doanh nghiệp |  |  |  |  |
| TK_B16 | `tK_B16` | Text | 5 | Số quản lý người sử dụng |  |  |  |  |
| TK_ADY | `tK_ADY` | Date/Time | 8 | Ngày khai báo nộp thuế |  |  |  |  |
| TK_B23 | `tK_B23` | Text | 81 | Tiêu đề |  |  |  |  |
| TK_KN1 | `tK_KN1` | Text | 1 | Mã sắc thuế được ân hạn |  |  |  |  |
| TK_KO1 | `tK_KO1` | Text | 27 | Tên sắc thuế được ân hạn |  |  |  |  |
| TK_KP1 | `tK_KP1` | Text | 8 | Hạn nộp thuế sau khi ân hạn |  |  |  |  |
| TK_KN2 | `tK_KN2` | Text | 1 | Mã sắc thuế được ân hạn |  |  |  |  |
| TK_KO2 | `tK_KO2` | Text | 27 | Tên sắc thuế được ân hạn |  |  |  |  |
| TK_KP2 | `tK_KP2` | Text | 8 | Hạn nộp thuế sau khi ân hạn |  |  |  |  |
| TK_KN3 | `tK_KN3` | Text | 1 | Mã sắc thuế được ân hạn |  |  |  |  |
| TK_KO3 | `tK_KO3` | Text | 27 | Tên sắc thuế được ân hạn |  |  |  |  |
| TK_KP3 | `tK_KP3` | Text | 8 | Hạn nộp thuế sau khi ân hạn |  |  |  |  |
| TK_KN4 | `tK_KN4` | Text | 1 | Mã sắc thuế được ân hạn |  |  |  |  |
| TK_KO4 | `tK_KO4` | Text | 27 | Tên sắc thuế được ân hạn |  |  |  |  |
| TK_KP4 | `tK_KP4` | Text | 8 | Hạn nộp thuế sau khi ân hạn |  |  |  |  |
| TK_KN5 | `tK_KN5` | Text | 1 | Mã sắc thuế được ân hạn |  |  |  |  |
| TK_KO5 | `tK_KO5` | Text | 27 | Tên sắc thuế được ân hạn |  |  |  |  |
| TK_KP5 | `tK_KP5` | Text | 8 | Hạn nộp thuế sau khi ân hạn |  |  |  |  |
| TK_KN6 | `tK_KN6` | Text | 1 | Mã sắc thuế được ân hạn |  |  |  |  |
| TK_KO6 | `tK_KO6` | Text | 27 | Tên sắc thuế được ân hạn |  |  |  |  |
| TK_KP6 | `tK_KP6` | Text | 8 | Hạn nộp thuế sau khi ân hạn |  |  |  |  |
| TK_DPD | `tK_DPD` | Date/Time | 8 | Ngày khởi hành vận chuyển |  |  |  |  |
| TK_ST1 | `tK_ST1` | Text | 7 | Địa điểm trung chuyển cho vận chuyển bảo thuế (khai báo gộp) |  |  |  |  |
| TK_AD1 | `tK_AD1` | Date/Time | 8 | Ngày dự kiến đến(Địa điểm trung chuyển) |  |  |  |  |
| TK_SD1 | `tK_SD1` | Date/Time | 8 | Ngày khởi hành vận chuyển(Địa điểm trung chuyển) |  |  |  |  |
| TK_ST2 | `tK_ST2` | Text | 7 | Địa điểm trung chuyển cho vận chuyển bảo thuế (khai báo gộp) |  |  |  |  |
| TK_AD2 | `tK_AD2` | Date/Time | 8 | Ngày dự kiến đến(Địa điểm trung chuyển) |  |  |  |  |
| TK_SD2 | `tK_SD2` | Date/Time | 8 | Ngày khởi hành vận chuyển(Địa điểm trung chuyển) |  |  |  |  |
| TK_ST3 | `tK_ST3` | Text | 7 | Địa điểm trung chuyển cho vận chuyển bảo thuế (khai báo gộp) |  |  |  |  |
| TK_AD3 | `tK_AD3` | Date/Time | 8 | Ngày dự kiến đến(Địa điểm trung chuyển) |  |  |  |  |
| TK_SD3 | `tK_SD3` | Date/Time | 8 | Ngày khởi hành vận chuyển(Địa điểm trung chuyển) |  |  |  |  |
| TK_ARP | `tK_ARP` | Text | 7 | Địa điểm đích cho vận chuyển bảo thuế (khai báo gộp) |  |  |  |  |
| TK_ADT | `tK_ADT` | Date/Time | 8 | Ngày dự kiến đến |  |  |  |  |
| TK_RYA | `tK_RYA` | Long Integer | 4 | Năm phát hành bảo lãnh |  |  |  |  |
| TK_SBC | `tK_SBC` | Text | 11 | Mã ngân hàng bảo lãnh |  |  |  |  |
| TK_BCN | `tK_BCN` | Text | 10 | Số chứng từ hạn mức |  |  |  |  |
| TK_SCN | `tK_SCN` | Text | 10 | Số chứng từ bảo lãnh |  |  |  |  |
| TK_SCM | `tK_SCM` | Text | 10 | Kí hiệu chứng từ bảo lãnh |  |  |  |  |
| TK_ICC | `tK_ICC` | Text | 5 | Mã đại lý Hải quan |  |  |  |  |
| TK_ICD | `tK_ICD` | Date/Time | 8 | Ngày đăng ký tờ khai (Dự kiến) |  |  |  |  |
| TK_CH | `tK_CH` | Text | 6 | Cơ quan Hải quan | ✓ |  |  | Don vi Hai quan.xls |
| TK_BCM | `tK_BCM` | Text | 10 | Kí hiệu chứng từ hạn mức |  |  |  |  |
| TK_BYA | `tK_BYA` | Long Integer | 4 | Năm phát hành hạn mức |  |  |  |  |
| TK_BRC | `tK_BRC` | Text | 11 | Mã ngân hàng trả thuế thay |  |  |  |  |
| TK_ICB | `tK_ICB` | Text | 5 | Mã loại hình | ✓ |  |  | Loai hinh(1).doc |
| TK_CCC | `tK_CCC` | Text | 1 | Mã phân loại hàng hóa |  |  |  | A: Hàng quà biếu, quà tặng.<br>B: Hàng an ninh, quốc phòng.<br>C: Hàng cứu trợ khẩn cấp.<br>D: Hàng phòng chống thiên tai, dịch bệnh.<br>E: Hàng viện trợ nhân đạo.<br>F: Hàng bưu chính, chuyển phát nhanh.<br>G: Hàng tài sản di chuyển.<br>H: Hàng hóa được sử dụng cho PTVT xuất nhập cảnh.<br>I: Hàng ngoại giao.<br>J: Hàng khác theo quy định của Chính phủ.<br>K: Hàng bảo quản đặc biệt. |
| TK_MTC | `tK_MTC` | Text | 1 | Mã hiệu phương thức vận chuyển | ✓ |  |  | 1: Hàng được vận chuyển bằng "Đường không"<br>2: Hàng được vận chuyển bằng "Đường biển (container)"<br>3: Hàng được vận chuyển bằng "Đường biển (hàng rời, lỏng...)"<br>4: Hàng được vận chuyển bằng "Đường bộ (xe tải)"<br>5: Hàng được vận chuyển bằng "Đường sắt"<br>6: Hàng được vận chuyển bằng "Đường sông"<br>9: Hàng được vận chuyển bằng "Khác" |
| TK_SKB | `tK_SKB` | Text | 1 | Phân loại cá nhân/tổ chức | ✓ |  |  | Mã 1: Cá nhân gửi đến cá nhân<br>Mã 2: Tổ chức/công ty gửi đến cá nhân<br>Mã 3: Cá nhân gửi đến tổ chức/công ty<br>Mã 4: Tổ chức/Công ty gửi đến tổ chức/công ty<br>Mã 5: Hình thức Khác |
</details>


<details><summary>Trường – objVN_IDA_VANDON[] (23 trường · VNACCS_IDA v1.2.xlsx / VN_IDA_VANDON)</summary>

| Chỉ tiêu | Key JSON | Kiểu | Độ dài | Mô tả | Bắt buộc | Req | Res | Ghi chú |
|---|---|---|---|---|---|---|---|---|
| VD_ID | `vD_ID` | Long Integer |  | Vận đơn ID |  |  |  |  |
| TK_ID | `tK_ID` | Long Integer |  | Tờ khai ID |  |  |  |  |
| VD_BL1 | `vD_BL1` | Text | 35 | Số vận đơn (Số B/L, số AWB v.v. …) | ✓ |  |  |  |
| VD_BL2 | `vD_BL2` | Text | 35 | Số vận đơn (Số B/L, số AWB v.v. …) |  |  |  |  |
| VD_BL3 | `vD_BL3` | Text | 35 | Số vận đơn (Số B/L, số AWB v.v. …) |  |  |  |  |
| VD_BL4 | `vD_BL4` | Text | 35 | Số vận đơn (Số B/L, số AWB v.v. …) |  |  |  |  |
| VD_BL5 | `vD_BL5` | Text | 35 | Số vận đơn (Số B/L, số AWB v.v. …) |  |  |  |  |
| VD_NO | `vD_NO` | Long Integer |  | Số kiện | ✓ |  |  |  |
| VD_NOT | `vD_NOT` | Text | 3 | Mã đơn vị tính số kiện | ✓ |  |  | Loai kien.xls |
| VD_GW | `vD_GW` | Decimal | 18.8 | Tổng trọng lượng hàng (Gross) | ✓ |  |  |  |
| VD_GWT | `vD_GWT` | Text | 6 | Mã đơn vị tính trọng lượng (Gross) | ✓ |  |  |  |
| VD_COC | `vD_COC` | Long Integer |  | Số lượng container |  |  |  |  |
| VD_ST | `vD_ST` | Text | 7 | Mã địa điểm lưu kho hàng chờ thông quan dự kiến | ✓ |  |  | 420Ma dia diem 14062024.xlsx |
| VD_A51 | `vD_A51` | Text | 20 | Tên địa điểm lưu kho hàng chờ thông quan dự kiến |  |  |  |  |
| VD_DST | `vD_DST` | Text | 6 | Mã địa điểm dỡ hàng | ✓ |  |  | DNCX.xls<br>KhoNgoaiQuan-KhoCFS 2024.xls<br>San bay trong nuoc.xls<br>Cua khau duong bo - Ga.xls<br>Cang - ICD trong nuoc 2024.xls |
| VD_DSN | `vD_DSN` | Text | 255 | Tên địa điểm dỡ hàng | ✓ |  |  |  |
| VD_PSC | `vD_PSC` | Text | 6 | Mã địa điểm xếp hàng | ✓ |  |  | DNCX.xls<br>KhoNgoaiQuan-KhoCFS 2024.xls<br>San bay nuoc ngoai.xls<br>San bay trong nuoc.xls<br>Cua khau duong bo - Ga.xls<br>Cang nuoc ngoai.xls<br>Cang - ICD trong nuoc 2024.xls |
| VD_PSN | `vD_PSN` | Text | 255 | Tên địa điểm xếp hàng | ✓ |  |  |  |
| VD_VSC | `vD_VSC` | Text | 9 | Mã phương tiện vận chuyển |  |  |  |  |
| VD_VSN | `vD_VSN` | Text | 255 | Tên phương tiện vận chuyển | ✓ |  |  |  |
| VD_ARR | `vD_ARR` | Date/Time | 8 | Ngày hàng đến | ✓ |  |  |  |
| VD_MRK | `vD_MRK` | Text | 140 | Ký hiệu và số hiệu |  |  |  |  |
| VD_ISD | `vD_ISD` | Date/Time | 8 | Ngày được phép nhập kho đầu tiên |  |  |  |  |
</details>


<details><summary>Trường – objVN_IDA_KTG (42 trường · VNACCS_IDA v1.2.xlsx / VN_IDA_KTG)</summary>

| Chỉ tiêu | Key JSON | Kiểu | Độ dài | Mô tả | Bắt buộc | Req | Res | Ghi chú |
|---|---|---|---|---|---|---|---|---|
| KTG_ID | `ktG_ID` | Long Integer |  | Tờ khai trị giá ID |  |  |  |  |
| TK_ID | `tK_ID` | Long Integer |  | Tờ khai ID |  |  |  |  |
| KTG_VD1 | `ktG_VD1` | Text | 1 | Mã phân loại khai trị giá |  |  |  |  |
| KTG_VD2 | `ktG_VD2` | Text | 9 | Số tiếp nhận tờ khai trị giá tổng hợp |  |  |  |  |
| KTG_A93 | `ktG_A93` | Text | 1 | Phân loại công thức chuẩn của khai báo trị giá tổng hợp |  |  |  |  |
| KTG_A94 | `ktG_A94` | Text | 2 | Mã phân loại điều chỉnh trị giá của khai báo trị giá tổng hợp |  |  |  |  |
| KTG_A95 | `ktG_A95` | Text | 22 | Phương pháp điều chỉnh trị giá của khai báo trị giá tổng hợp |  |  |  |  |
| KTG_VCC | `ktG_VCC` | Text | 3 | Mã tiền tệ của giá cơ sở hiệu chỉnh trị giá |  |  |  |  |
| KTG_VPC | `ktG_VPC` | Decimal | 20.4 | Giá cơ sở để hiệu chỉnh trị giá |  |  |  |  |
| KTG_FR1 | `ktG_FR1` | Text | 1 | Mã phân loại phí vận chuyển |  |  |  | A: Khai trong trường hợp chứng từ vận tải ghi Tổng số tiền cước phí chung cho tất cả hàng hóa trên chứng từ.<br>B: Khai trong trường hợp:<br>      - Hóa đơn lô hàng có cả hàng trả tiền và hàng F.O.C;<br>      - Tách riêng phí vận tải của hàng trả tiền với hàng F.O.C trên chứng từ vận tải.<br>Tương ứng với mã này tại ô phí vận chuyển chỉ nhập phí của hàng phải trả tiền (ô 3) để hệ thống tự động phân bổ, đối với các mặt hàng F.O.C người khai hải quan tự cộng cước phí vận tải để tính toán trị giá tính thuế rồi điền vào ô trị giá tính thuế của dòng hàng F.O.C.<br>C: Khai trong trường hợp tờ khai chỉ nhập khẩu một phần hàng hóa của lô hàng trên chứng từ vận tải.<br>D: Phân bổ cước phí vận tải theo tỷ lệ trọng lượng, dung tích. Khi khai mã này, người khai hải quan phải khai tờ khai trị giá để phân bổ các khoản điều chỉnh, tính toán trị giá tính thuế của từng mặt hàng, lấy kết quả tính toán trị giá tính thuế trên tờ khai trị giá để nhập vào ô tương ứng trên tờ khai nhập khẩu của hệ thống VNACCS.<br>E: Khai trong trường hợp trị giá hóa đơn của hàng hóa đã có phí vận tải (ví dụ: CIF, C&F, CIP) nhưng cước phí thực tế vượt quá cước phí trên hóa đơn (phát sinh thêm phí vận tải khi hàng về cảng nhập khẩu: tăng cước phí do giá nhiên liệu tăng, do biến động tiền tệ, do tắc tàu tại cảng ...). <br>F: Khai trong trường hợp có cước vượt cước và chỉ nhập khẩu 1 phần hàng hóa của lô hàng. |
| KTG_FR2 | `ktG_FR2` | Text | 3 | Mã tiền tệ phí vận chuyển |  |  |  |  |
| KTG_FR3 | `ktG_FR3` | Decimal | 18.4 | Phí vận chuyển |  |  |  |  |
| KTG_IN1 | `ktG_IN1` | Text | 1 | Mã phân loại bảo hiểm |  |  |  |  |
| KTG_IN2 | `ktG_IN2` | Text | 3 | Mã tiền tệ của tiền bảo hiểm |  |  |  |  |
| KTG_IN3 | `ktG_IN3` | Decimal | 24.4 | Phí bảo hiểm |  |  |  |  |
| KTG_IN4 | `ktG_IN4` | Text | 6 | Số đăng ký bảo hiểm tổng hợp |  |  |  |  |
| KTG_VR1 | `ktG_VR1` | Text | 1 | Mã tên khoản điều chỉnh |  |  |  | A: Phí hoa hồng bán hàng, phí môi giới (AD).<br>B: Chi phí bao bì được coi là đồng nhất với hàng hóa nhập khẩu (AD).<br>C: Chi phí đóng gói hàng hóa (AD).<br>D: Khoản trợ giúp (AD).<br>E: Phí bản quyền, phí giấy phép (AD).<br>P: Các khoản tiền mà người nhập khẩu phải trả từ số tiền thu được sau khi bán lại, định đoạt, sử dụng hàng hóa nhập khẩu (AD). <br>Q: Các khoản tiền người mua phải thanh toán nhưng chưa tính vào giá mua trên hóa đơn, gồm: tiền trả trước, ứng trước, tiền đặt cọc (AD).<br>K: khoản tiền người mua thanh toán cho người thứ ba theo yêu cầu của người bán (AD)<br>M: khoản tiền được thanh toán bằng cách bù trừ nợ (AD).<br>U: Chi phí cho những hoạt động phát sinh sau khi nhập khẩu hàng hóa bao gồm các chi phí về xây dựng, kiến trúc, lắp đặt, bảo dưỡng hoặc trợ giúp kỹ thuật, tư vấn kỹ thuật, chi phí giám sát và các chi phí tương tự (SB).<br>V: Phí vận tải phát sinh sau khi hàng hóa được vận chuyển đến cửa khẩu nhập đầu tiên (SB).<br>H: Phí bảo hiểm phát sinh sau khi hàng hóa được vận chuyển đến cửa khẩu nhập đầu tiên (SB).<br>T: Các khoản thuế, phí, lệ phí phải nộp ở Việt Nam đã nằm trong giá mua hàng nhập khẩu (SB).<br>G: Khoản giảm giá (SB).<br>S: Các chi phí do người mua chịu liên quan đến tiếp thị hàng hóa nhập khẩu (SB)<br>L: Khoản tiền lãi tương ứng với mức lãi suất theo thỏa thuận tài chính của người mua và có liên quan đến việc mua hàng hóa nhập khẩu (SB).<br>N: Khác |
| KTG_VI1 | `ktG_VI1` | Text | 3 | Mã phân loại điều chỉnh trị giá |  |  |  | AD: cộng thêm số tiền điều chỉnh. <br>SB: Trừ đi số tiền điều chỉnh.<br>IP: Trị giá tính thuế là trị giá hóa đơn. <br>DP: Nhập vào tổng giá tính thuế được tính bằng tay. |
| KTG_VC1 | `ktG_VC1` | Text | 3 | Mã đồng tiền của khoản điều chỉnh trị giá |  |  |  | Tien te.xls |
| KTG_VP1 | `ktG_VP1` | Decimal | 20.4 | Trị giá khoản điều chỉnh |  |  |  |  |
| KTG_VT1 | `ktG_VT1` | Decimal | 20.4 | Tổng hệ số phân bổ trị giá khoản điều chỉnh |  |  |  |  |
| KTG_VR2 | `ktG_VR2` | Text | 1 | Mã tên khoản điều chỉnh |  |  |  | Tham khảo F18 |
| KTG_VI2 | `ktG_VI2` | Text | 3 | Mã phân loại điều chỉnh trị giá |  |  |  | Tham khảo F19 |
| KTG_VC2 | `ktG_VC2` | Text | 3 | Mã đồng tiền của khoản điều chỉnh trị giá |  |  |  | Tien te.xls |
| KTG_VP2 | `ktG_VP2` | Decimal | 20.4 | Trị giá khoản điều chỉnh |  |  |  |  |
| KTG_VT2 | `ktG_VT2` | Decimal | 20.4 | Tổng hệ số phân bổ trị giá khoản điều chỉnh |  |  |  |  |
| KTG_VR3 | `ktG_VR3` | Text | 1 | Mã tên khoản điều chỉnh |  |  |  | Tham khảo F18 |
| KTG_VI3 | `ktG_VI3` | Text | 3 | Mã phân loại điều chỉnh trị giá |  |  |  | Tham khảo F19 |
| KTG_VC3 | `ktG_VC3` | Text | 3 | Mã đồng tiền của khoản điều chỉnh trị giá |  |  |  | Tien te.xls |
| KTG_VP3 | `ktG_VP3` | Decimal | 20.4 | Trị giá khoản điều chỉnh |  |  |  |  |
| KTG_VT3 | `ktG_VT3` | Decimal | 20.4 | Tổng hệ số phân bổ trị giá khoản điều chỉnh |  |  |  |  |
| KTG_VR4 | `ktG_VR4` | Text | 1 | Mã tên khoản điều chỉnh |  |  |  | Tham khảo F18 |
| KTG_VI4 | `ktG_VI4` | Text | 3 | Mã phân loại điều chỉnh trị giá |  |  |  | Tham khảo F19 |
| KTG_VC4 | `ktG_VC4` | Text | 3 | Mã đồng tiền của khoản điều chỉnh trị giá |  |  |  | Tien te.xls |
| KTG_VP4 | `ktG_VP4` | Decimal | 20.4 | Trị giá khoản điều chỉnh |  |  |  |  |
| KTG_VT4 | `ktG_VT4` | Decimal | 20.4 | Tổng hệ số phân bổ trị giá khoản điều chỉnh |  |  |  |  |
| KTG_VR5 | `ktG_VR5` | Text | 1 | Mã tên khoản điều chỉnh |  |  |  | Tham khảo F18 |
| KTG_VI5 | `ktG_VI5` | Text | 3 | Mã phân loại điều chỉnh trị giá |  |  |  | Tham khảo F19 |
| KTG_VC5 | `ktG_VC5` | Text | 3 | Mã đồng tiền của khoản điều chỉnh trị giá |  |  |  | Tien te.xls |
| KTG_VP5 | `ktG_VP5` | Decimal | 20.4 | Trị giá khoản điều chỉnh |  |  |  |  |
| KTG_VT5 | `ktG_VT5` | Decimal | 20.4 | Tổng hệ số phân bổ trị giá khoản điều chỉnh |  |  |  |  |
| KTG_VLD | `ktG_VLD` | Text | 280 | Chi tiết khai trị giá |  |  |  |  |
</details>


<details><summary>Trường – objVN_IDA_HANG[] (106 trường · VNACCS_IDA v1.2.xlsx / VN_IDA_HANG)</summary>

| Chỉ tiêu | Key JSON | Kiểu | Độ dài | Mô tả | Bắt buộc | Req | Res | Ghi chú |
|---|---|---|---|---|---|---|---|---|
| HAG_ID | `haG_ID` | Long Integer |  | Hàng ID |  |  |  |  |
| TK_ID | `tK_ID` | Long Integer |  | Tờ khai ID |  |  |  |  |
| HAG_B25 | `haG_B25` | Text | 2 | Số dòng |  |  |  |  |
| HAG_CMD | `haG_CMD` | Text | 12 | Mã số hàng hóa | ✓ |  |  |  |
| HAG_GZC | `haG_GZC` | Text | 255 | Mã quản lý riêng |  |  |  |  |
| HAG_B29 | `haG_B29` | Text | 1 | Mã phân loại tái xác nhận giá |  |  |  |  |
| HAG_CMN | `haG_CMN` | Text | 200 | Mô tả hàng hóa | ✓ |  |  |  |
| HAG_QN1 | `haG_QN1` | Decimal | 18.2 | Số lượng (1) | ✓ |  |  |  |
| HAG_QT1 | `haG_QT1` | Text | 4 | Mã đơn vị tính (1) | ✓ |  |  | DVT.xls |
| HAG_VN1 | `haG_VN1` | Long Integer |  | Số của mục khai khoản điều chỉnh |  |  |  |  |
| HAG_VN2 | `haG_VN2` | Long Integer |  | Số của mục khai khoản điều chỉnh |  |  |  |  |
| HAG_VN3 | `haG_VN3` | Long Integer |  | Số của mục khai khoản điều chỉnh |  |  |  |  |
| HAG_VN4 | `haG_VN4` | Long Integer |  | Số của mục khai khoản điều chỉnh |  |  |  |  |
| HAG_VN5 | `haG_VN5` | Long Integer |  | Số của mục khai khoản điều chỉnh |  |  |  |  |
| HAG_QN2 | `haG_QN2` | Decimal | 18.2 | Số lượng (2) | ✓ |  |  |  |
| HAG_QT2 | `haG_QT2` | Text | 4 | Mã đơn vị tính (2) | ✓ |  |  | DVT.xls |
| HAG_BPR | `haG_BPR` | Double |  | Trị giá  hóa đơn | ✓ |  |  |  |
| HAG_UPR | `haG_UPR` | Decimal | 20.8 | Đơn giá hóa đơn | ✓ |  |  |  |
| HAG_UPC | `haG_UPC` | Text | 3 | Mã đồng tiền của đơn giá | ✓ |  |  | Tien te.xls |
| HAG_TSC | `haG_TSC` | Text | 4 | Đơn vị của đơn giá và số lượng |  |  |  |  |
| HAG_B36 | `haG_B36` | Decimal | 25.4 | Trị giá tính thuế(S) |  |  |  |  |
| HAG_B50 | `haG_B50` | Text | 3 | Mã đồng tiền của giá tính thuế |  |  |  | Tien te.xls |
| HAG_B51 | `haG_B51` | Decimal | 28.4 | Trị giá tính thuế(M) |  |  |  |  |
| HAG_B37 | `haG_B37` | Decimal | 20.4 | Số lượng tính thuế |  |  |  |  |
| HAG_B38 | `haG_B38` | Text | 4 | Mã đơn vị tính chuẩn để đánh thuế nhập khẩu |  |  |  |  |
| HAG_KKT | `haG_KKT` | Decimal | 26.4 | Đơn giá tính thuế |  |  |  |  |
| HAG_KKS | `haG_KKS` | Text | 4 | Mã tiền tệ đơn giá tính thuế |  |  |  |  |
| HAG_B42 | `haG_B42` | Text | 1 | Mã phân loại thuế suất thuế nhập khẩu |  |  |  |  |
| HAG_B43 | `haG_B43` | Text | 30 | Thuế suất thuế nhập khẩu |  |  |  |  |
| HAG_SKB | `haG_SKB` | Text | 1 | Phân loại nhập thuế suất nhập khẩu |  |  |  |  |
| HAG_SPD | `haG_SPD` | Text | 10 | Mã xác định mức thuế nhập khẩu theo lượng |  |  |  |  |
| HAG_B47 | `haG_B47` | Decimal | 24.4 | Số tiền thuế nhập khẩu |  |  |  |  |
| HAG_OR | `haG_OR` | Text | 2 | Mã nước xuất xứ | ✓ |  |  | Nuoc.xls |
| HAG_B56 | `haG_B56` | Text | 7 | Tên nơi xuất xứ |  |  |  |  |
| HAG_ORS | `haG_ORS` | Text | 3 | Mã biểu thuế nhập khẩu | ✓ |  |  | Bieu thue.xls |
| HAG_B49 | `haG_B49` | Decimal | 24.4 | Số tiền giảm thuế nhập khẩu |  |  |  |  |
| HAG_KWS | `haG_KWS` | Text | 1 | Mã ngoài hạn ngạch |  |  |  |  |
| HAG_TDL | `haG_TDL` | Text | 2 | Số thứ tự của dòng hàng trên tờ khai tạm nhập tái xuất tương ứng |  |  |  |  |
| HAG_TXN | `haG_TXN` | Decimal | 12 | Số đăng ký danh mục miễn thuế nhập khẩu |  |  |  |  |
| HAG_TXR | `haG_TXR` | Text | 3 | Số dòng tương ứng trong danh mục miễn thuế nhập khẩu |  |  |  |  |
| HAG_RE | `haG_RE` | Text | 5 | Mã miễn / Giảm / Không chịu thuế nhập khẩu |  |  |  | Mien-Giam-Khong chiu thue XNK.xls |
| HAG_B59 | `haG_B59` | Text | 60 | Điều khoản miễn / Giảm / Không chịu thuế nhập khẩu (Pháp luật) |  |  |  |  |
| HAG_KQ1 | `haG_KQ1` | Text | 27 | Tên khoản mục thuế và thu khác |  |  |  |  |
| HAG_TX1 | `haG_TX1` | Text | 10 | Mã áp dụng thuế suất thuế và thu khác (thuế chống bán phá giá) |  |  |  | Bảng thuế CBPG (cập nhật ngày 13.06.2024).xls |
| HAG_KS1 | `haG_KS1` | Decimal | 25.4 | Trị giá tính thuế và thu khác |  |  |  |  |
| HAG_KT1 | `haG_KT1` | Decimal | 20.4 | Số tiền giảm thuế và thu khác(output) |  |  |  |  |
| HAG_KU1 | `haG_KU1` | Text | 4 | Mã đơn vị tính chuẩn để đánh thuế và thu khác |  |  |  |  |
| HAG_KY1 | `haG_KY1` | Text | 25 | Thuế suất thuế và thu khác |  |  |  |  |
| HAG_KZ1 | `haG_KZ1` | Decimal | 24.4 | Số tiền thuế và thu khác |  |  |  |  |
| HAG_TR1 | `haG_TR1` | Text | 5 | Mã miễn / Giảm / Không chịu thuế và thu khác (thuế chống bán phá giá) |  |  |  |  |
| HAG_LC1 | `haG_LC1` | Text | 60 | Điều khoản miễn / Giảm / Không chịu thuế và thu khác (Pháp luật) |  |  |  |  |
| HAG_LB1 | `haG_LB1` | Decimal | 24.4 | Số tiền giảm thuế và thu khác |  |  |  |  |
| HAG_KQ2 | `haG_KQ2` | Text | 27 | Tên khoản mục thuế và thu khác |  |  |  |  |
| HAG_TX2 | `haG_TX2` | Text | 10 | Mã áp dụng thuế suất thuế và thu khác (thuế chống phân biệt đối xử) |  |  |  |  |
| HAG_KS2 | `haG_KS2` | Decimal | 25.4 | Trị giá tính thuế và thu khác |  |  |  |  |
| HAG_KT2 | `haG_KT2` | Decimal | 20.4 | Số tiền giảm thuế và thu khác(output) |  |  |  |  |
| HAG_KU2 | `haG_KU2` | Text | 4 | Mã đơn vị tính chuẩn để đánh thuế và thu khác |  |  |  |  |
| HAG_KY2 | `haG_KY2` | Text | 25 | Thuế suất thuế và thu khác |  |  |  |  |
| HAG_KZ2 | `haG_KZ2` | Decimal | 24.4 | Số tiền thuế và thu khác |  |  |  |  |
| HAG_TR2 | `haG_TR2` | Text | 5 | Mã miễn / Giảm / Không chịu thuế và thu khác |  |  |  |  |
| HAG_LC2 | `haG_LC2` | Text | 60 | Điều khoản miễn / Giảm / Không chịu thuế và thu khác (Pháp luật) |  |  |  |  |
| HAG_LB2 | `haG_LB2` | Decimal | 24.4 | Số tiền giảm thuế và thu khác |  |  |  |  |
| HAG_KQ3 | `haG_KQ3` | Text | 27 | Tên khoản mục thuế và thu khác |  |  |  |  |
| HAG_TX3 | `haG_TX3` | Text | 10 | Mã áp dụng thuế suất thuế và thu khác (thuế tiêu thụ đặc biệt) |  |  |  | Thue khac - TTDB.xls |
| HAG_KS3 | `haG_KS3` | Decimal | 25.4 | Trị giá tính thuế và thu khác |  |  |  |  |
| HAG_KT3 | `haG_KT3` | Decimal | 20.4 | Số lượng tính thuế và thu khác |  |  |  |  |
| HAG_KU3 | `haG_KU3` | Text | 4 | Mã đơn vị tính chuẩn để đánh thuế và thu khác |  |  |  |  |
| HAG_KY3 | `haG_KY3` | Text | 25 | Thuế suất thuế và thu khác |  |  |  |  |
| HAG_KZ3 | `haG_KZ3` | Decimal | 24.4 | Số tiền thuế và thu khác |  |  |  |  |
| HAG_TR3 | `haG_TR3` | Text | 5 | Mã miễn / Giảm / Không chịu thuế và thu khác  (thuế tiêu thụ đặc biệt) |  |  |  |  |
| HAG_LC3 | `haG_LC3` | Text | 60 | Điều khoản miễn / Giảm / Không chịu thuế và thu khác (Pháp luật) |  |  |  |  |
| HAG_LB3 | `haG_LB3` | Decimal | 24.4 | Số tiền giảm thuế và thu khác(output) |  |  |  |  |
| HAG_KQ4 | `haG_KQ4` | Text | 27 | Tên khoản mục thuế và thu khác |  |  |  |  |
| HAG_TX4 | `haG_TX4` | Text | 10 | Mã áp dụng thuế suất thuế và thu khác (thuế bảo vệ môi trường) |  |  |  | Thue khac - BVMT.xls |
| HAG_KS4 | `haG_KS4` | Decimal | 25.4 | Trị giá tính thuế và thu khác |  |  |  |  |
| HAG_KT4 | `haG_KT4` | Decimal | 20.4 | Số lượng tính thuế và thu khác |  |  |  |  |
| HAG_KU4 | `haG_KU4` | Text | 4 | Mã đơn vị tính chuẩn để đánh thuế và thu khác |  |  |  |  |
| HAG_KY4 | `haG_KY4` | Text | 25 | Thuế suất thuế và thu khác |  |  |  |  |
| HAG_KZ4 | `haG_KZ4` | Decimal | 24.4 | Số tiền thuế và thu khác |  |  |  |  |
| HAG_TR4 | `haG_TR4` | Text | 5 | Mã miễn / Giảm / Không chịu thuế và thu khác (thuế bảo vệ môi trường) |  |  |  |  |
| HAG_LC4 | `haG_LC4` | Text | 60 | Điều khoản miễn / Giảm / Không chịu thuế và thu khác (Pháp luật) |  |  |  |  |
| HAG_LB4 | `haG_LB4` | Decimal | 24.4 | Số tiền giảm thuế và thu khác(output) |  |  |  |  |
| HAG_KQ5 | `haG_KQ5` | Text | 27 | Tên khoản mục thuế và thu khác |  |  |  |  |
| HAG_TX5 | `haG_TX5` | Text | 10 | Mã áp dụng thuế suất thuế và thu khác (thuế VAT) | ✓ |  |  | Thue khac - GTGT.xls |
| HAG_KS5 | `haG_KS5` | Decimal | 25.4 | Trị giá tính thuế và thu khác |  |  |  |  |
| HAG_KT5 | `haG_KT5` | Decimal | 20.4 | Số lượng tính thuế và thu khác |  |  |  |  |
| HAG_KU5 | `haG_KU5` | Text | 4 | Mã đơn vị tính chuẩn để đánh thuế và thu khác |  |  |  |  |
| HAG_KY5 | `haG_KY5` | Text | 25 | Thuế suất thuế và thu khác |  |  |  |  |
| HAG_KZ5 | `haG_KZ5` | Decimal | 24.4 | Số tiền thuế và thu khác |  |  |  |  |
| HAG_TR5 | `haG_TR5` | Text | 5 | Mã miễn / Giảm / Không chịu thuế và thu khác (thuế VAT) |  |  |  | 767Khong thue - GTGT.xls |
| HAG_LC5 | `haG_LC5` | Text | 60 | Điều khoản miễn / Giảm / Không chịu thuế và thu khác (Pháp luật) |  |  |  |  |
| HAG_LB5 | `haG_LB5` | Decimal | 24.4 | Số tiền giảm thuế và thu khác(output) |  |  |  |  |
| HAG_TG2 | `haG_TG2` | Decimal | 24.4 | Số tiền giảm thuế và thu khác(input) |  |  |  |  |
| HAG_TG1 | `haG_TG1` | Decimal | 24.4 | Số tiền giảm thuế và thu khác(input) |  |  |  |  |
| HAG_REG | `haG_REG` | Decimal | 24.4 | Số tiền giảm thuế nhập khẩu |  |  |  |  |
| HAG_TG5 | `haG_TG5` | Decimal | 24.4 | Số tiền giảm thuế và thu khác(input) |  |  |  |  |
| HAG_TG4 | `haG_TG4` | Decimal | 24.4 | Số tiền giảm thuế và thu khác(input) |  |  |  |  |
| HAG_TG3 | `haG_TG3` | Decimal | 24.4 | Số tiền giảm thuế và thu khác(input) |  |  |  |  |
| HAG_TXC | `haG_TXC` | Text | 4 | Mã đơn vị tính thuế tuyệt đối |  |  |  |  |
| HAG_TXB | `haG_TXB` | Decimal | 18.4 | Mức thuế tuyệt đối |  |  |  |  |
| HAG_TXA | `haG_TXA` | Decimal | 18.4 | Thuế suất |  |  |  |  |
| HAG_DPR | `haG_DPR` | Decimal | 28.4 | Trị giá tính thuế |  |  |  |  |
| HAG_BPC | `haG_BPC` | Text | 3 | Mã đồng tiền trị giá tính thuế |  |  |  |  |
| HAG_TXD | `haG_TXD` | Text | 3 | Mã đồng tiền của mức thuế tuyệt đối |  |  |  |  |
| HAG_MAHANG | `haG_MAHANG` | Text | 255 | Mã hàng |  |  |  |  |
| HAG_TDT | `haG_TDT` | Text | 1 | x |  |  |  |  |
</details>


<details><summary>Trường – objVN_IDA_THUE[] (chỉ phản hồi) (34 trường · VNACCS_IDA v1.2.xlsx / VN_IDA_THUE)</summary>

| Chỉ tiêu | Key JSON | Kiểu | Độ dài | Mô tả | Bắt buộc | Req | Res | Ghi chú |
|---|---|---|---|---|---|---|---|---|
| THUE_ID | `thuE_ID` | Long Integer |  | Thuế ID |  |  |  | ID IDA_THUE FPT |
| TK_ID | `tK_ID` | Long Integer |  | Tờ khai ID |  |  |  | ID IDA FPT |
| THUE_KF1 | `thuE_KF1` | Text | 1 | Mã sắc thuế |  |  |  | Tax subject code |
| THUE_KG1 | `thuE_KG1` | Text | 27 | Tên sắc thuế |  |  |  | Tax subject name |
| THUE_KH1 | `thuE_KH1` | Decimal | 11 | Tổng tiền thuế |  |  |  | Total tax amount |
| THUE_KI1 | `thuE_KI1` | Long Integer |  | Số dòng tổng tiền thuế |  |  |  | Number of columns of Total payable tax |
| THUE_KF2 | `thuE_KF2` | Text | 1 | Mã sắc thuế |  |  |  | Tax subject code |
| THUE_KG2 | `thuE_KG2` | Text | 27 | Tên sắc thuế |  |  |  | Tax subject name |
| THUE_KH2 | `thuE_KH2` | Decimal | 11 | Tổng tiền thuế |  |  |  | Total tax amount |
| THUE_KI2 | `thuE_KI2` | Long Integer |  | Số dòng tổng tiền thuế |  |  |  | Number of columns of Total payable tax |
| THUE_KF3 | `thuE_KF3` | Text | 1 | Mã sắc thuế |  |  |  | Tax subject code |
| THUE_KG3 | `thuE_KG3` | Text | 27 | Tên sắc thuế |  |  |  | Tax subject name |
| THUE_KH3 | `thuE_KH3` | Decimal | 11 | Tổng tiền thuế |  |  |  | Total tax amount |
| THUE_KI3 | `thuE_KI3` | Long Integer |  | Số dòng tổng tiền thuế |  |  |  | Number of columns of Total payable tax |
| THUE_KF4 | `thuE_KF4` | Text | 1 | Mã sắc thuế |  |  |  | Tax subject code |
| THUE_KG4 | `thuE_KG4` | Text | 27 | Tên sắc thuế |  |  |  | Tax subject name |
| THUE_KH4 | `thuE_KH4` | Decimal | 11 | Tổng tiền thuế |  |  |  | Total tax amount |
| THUE_KI4 | `thuE_KI4` | Long Integer |  | Số dòng tổng tiền thuế |  |  |  | Number of columns of Total payable tax |
| THUE_KF5 | `thuE_KF5` | Text | 1 | Mã sắc thuế |  |  |  | Tax subject code |
| THUE_KG5 | `thuE_KG5` | Text | 27 | Tên sắc thuế |  |  |  | Tax subject name |
| THUE_KH5 | `thuE_KH5` | Decimal | 11 | Tổng tiền thuế |  |  |  | Total tax amount |
| THUE_KI5 | `thuE_KI5` | Long Integer |  | Số dòng tổng tiền thuế |  |  |  | Number of columns of Total payable tax |
| THUE_KF6 | `thuE_KF6` | Text | 1 | Mã sắc thuế |  |  |  | Tax subject code |
| THUE_KG6 | `thuE_KG6` | Text | 27 | Tên sắc thuế |  |  |  | Tax subject name |
| THUE_KH6 | `thuE_KH6` | Decimal | 11 | Tổng tiền thuế |  |  |  | Total tax amount |
| THUE_KI6 | `thuE_KI6` | Long Integer |  | Số dòng tổng tiền thuế |  |  |  | Number of columns of Total payable tax |
| THUE_B02 | `thuE_B02` | Decimal | 11 | Tổng tiền thuế phải nộp |  |  |  | Total payable tax |
| THUE_B03 | `thuE_B03` | Decimal | 11 | Số tiền bảo lãnh |  |  |  | Security amount |
| THUE_KJ1 | `thuE_KJ1` | Text | 3 | Mã đồng tiền của tỷ giá tính thuế |  |  |  | Currency Code |
| THUE_KK1 | `thuE_KK1` | Decimal | 17.8 | Tỷ giá tính thuế |  |  |  | Currency Exchange Rate |
| THUE_KJ2 | `thuE_KJ2` | Text | 3 | Mã đồng tiền của tỷ giá tính thuế |  |  |  | Currency Code |
| THUE_KK2 | `thuE_KK2` | Decimal | 17.8 | Tỷ giá tính thuế |  |  |  | Currency Exchange Rate |
| THUE_KJ3 | `thuE_KJ3` | Text | 3 | Mã đồng tiền của tỷ giá tính thuế |  |  |  | Currency Code |
| THUE_KK3 | `thuE_KK3` | Decimal | 17.8 | Tỷ giá tính thuế |  |  |  | Currency Exchange Rate |
</details>


<details><summary>Trường – objVN_IDA_CTHQ[] (chỉ phản hồi) (33 trường · VNACCS_IDA v1.2.xlsx / VN_IDA_CTHQ)</summary>

| Chỉ tiêu | Key JSON | Kiểu | Độ dài | Mô tả | Bắt buộc | Req | Res | Ghi chú |
|---|---|---|---|---|---|---|---|---|
| CTHQ_ID | `cthQ_ID` | Long Integer |  | Chỉ thị HQ ID |  |  |  |  |
| TK_ID | `tK_ID` | Long Integer |  | Tờ khai ID |  |  |  |  |
| CTHQ_CCM | `cthQ_CCM` | Text | 1 | Phân loại chỉ thị của Hải quan |  |  |  |  |
| CTHQ_D01 | `cthQ_D01` | Date/Time | 8 | Ngày chỉ thị của Hải quan |  |  |  |  |
| CTHQ_T01 | `cthQ_T01` | Text | 120 | Tên chỉ thị của Hải quan |  |  |  |  |
| CTHQ_I01 | `cthQ_I01` | Text | 420 | Nội dung chỉ thị của Hải quan |  |  |  |  |
| CTHQ_D02 | `cthQ_D02` | Date/Time | 8 | Ngày chỉ thị của Hải quan |  |  |  |  |
| CTHQ_T02 | `cthQ_T02` | Text | 120 | Tên chỉ thị của Hải quan |  |  |  |  |
| CTHQ_I02 | `cthQ_I02` | Text | 420 | Nội dung chỉ thị của Hải quan |  |  |  |  |
| CTHQ_D03 | `cthQ_D03` | Date/Time | 8 | Ngày chỉ thị của Hải quan |  |  |  |  |
| CTHQ_T03 | `cthQ_T03` | Text | 120 | Tên chỉ thị của Hải quan |  |  |  |  |
| CTHQ_I03 | `cthQ_I03` | Text | 420 | Nội dung chỉ thị của Hải quan |  |  |  |  |
| CTHQ_D04 | `cthQ_D04` | Date/Time | 8 | Ngày chỉ thị của Hải quan |  |  |  |  |
| CTHQ_T04 | `cthQ_T04` | Text | 120 | Tên chỉ thị của Hải quan |  |  |  |  |
| CTHQ_I04 | `cthQ_I04` | Text | 420 | Nội dung chỉ thị của Hải quan |  |  |  |  |
| CTHQ_D05 | `cthQ_D05` | Date/Time | 8 | Ngày chỉ thị của Hải quan |  |  |  |  |
| CTHQ_T05 | `cthQ_T05` | Text | 120 | Tên chỉ thị của Hải quan |  |  |  |  |
| CTHQ_I05 | `cthQ_I05` | Text | 420 | Nội dung chỉ thị của Hải quan |  |  |  |  |
| CTHQ_D06 | `cthQ_D06` | Date/Time | 8 | Ngày chỉ thị của Hải quan |  |  |  |  |
| CTHQ_T06 | `cthQ_T06` | Text | 120 | Tên chỉ thị của Hải quan |  |  |  |  |
| CTHQ_I06 | `cthQ_I06` | Text | 420 | Nội dung chỉ thị của Hải quan |  |  |  |  |
| CTHQ_D07 | `cthQ_D07` | Date/Time | 8 | Ngày chỉ thị của Hải quan |  |  |  |  |
| CTHQ_T07 | `cthQ_T07` | Text | 120 | Tên chỉ thị của Hải quan |  |  |  |  |
| CTHQ_I07 | `cthQ_I07` | Text | 420 | Nội dung chỉ thị của Hải quan |  |  |  |  |
| CTHQ_D08 | `cthQ_D08` | Date/Time | 8 | Ngày chỉ thị của Hải quan |  |  |  |  |
| CTHQ_T08 | `cthQ_T08` | Text | 120 | Tên chỉ thị của Hải quan |  |  |  |  |
| CTHQ_I08 | `cthQ_I08` | Text | 420 | Nội dung chỉ thị của Hải quan |  |  |  |  |
| CTHQ_D09 | `cthQ_D09` | Date/Time | 8 | Ngày chỉ thị của Hải quan |  |  |  |  |
| CTHQ_T09 | `cthQ_T09` | Text | 120 | Tên chỉ thị của Hải quan |  |  |  |  |
| CTHQ_I09 | `cthQ_I09` | Text | 420 | Nội dung chỉ thị của Hải quan |  |  |  |  |
| CTHQ_D10 | `cthQ_D10` | Date/Time | 8 | Ngày chỉ thị của Hải quan |  |  |  |  |
| CTHQ_T10 | `cthQ_T10` | Text | 120 | Tên chỉ thị của Hải quan |  |  |  |  |
| CTHQ_I10 | `cthQ_I10` | Text | 420 | Nội dung chỉ thị của Hải quan |  |  |  |  |
</details>


<details><summary>Trường – objVN_IDA_TRANGTHAI (chỉ phản hồi) (27 trường · VNACCS_IDA v1.2.xlsx / VN_IDA_TRANGTHAI)</summary>

| Chỉ tiêu | Key JSON | Kiểu | Độ dài | Mô tả | Bắt buộc | Req | Res | Ghi chú |
|---|---|---|---|---|---|---|---|---|
| TK_ID | `tK_ID` | Long Integer |  | Tờ khai ID |  |  |  |  |
| TK_ADY | `tK_ADY` | Date/Time | 8 | x |  |  |  |  |
| TK_ADZ | `tK_ADZ` | Long Integer |  | x |  |  |  |  |
| TK_C20 | `tK_C20` | Text | 255 | Tên trưởng đơn vị Hải quan |  |  |  |  |
| TK_C21 | `tK_C21` | Date/Time | 8 | Ngày cấp phép |  |  |  |  |
| TK_AD4 | `tK_AD4` | Long Integer |  | Thời gian cấp phép |  |  |  |  |
| TK_C22 | `tK_C22` | Date/Time | 8 | Ngày hoàn thành kiểm tra |  |  |  |  |
| TK_AD5 | `tK_AD5` | Long Integer |  | Giờ hoàn thành kiểm tra |  |  |  |  |
| TK_C23 | `tK_C23` | Text | 2 | Phân loại thẩm tra sau thông quan |  |  |  |  |
| TK_C24 | `tK_C24` | Date/Time | 8 | Ngày phê duyệt BP |  |  |  |  |
| TK_AD6 | `tK_AD6` | Long Integer |  | Giờ phê duyệt BP |  |  |  |  |
| TK_C25 | `tK_C25` | Date/Time | 8 | Ngày hoàn thành kiểm tra BP |  |  |  |  |
| TK_AD7 | `tK_AD7` | Long Integer |  | Giờ hoàn thành kiểm tra BP |  |  |  |  |
| TK_C26 | `tK_C26` | Long Integer |  | Số ngày mong đợi đến khi cấp phép |  |  |  |  |
| TK_ADX | `tK_ADX` | Text | 1 | Mã sắc thuế được ân hạn (dành cho VAT hàng hóa đặc biệt) |  |  |  |  |
| TK_LUONG | `tK_LUONG` | Long Integer |  | Chưa phân luồng: 0<br>Luồng xanh: 1<br>Luồng vàng: 2<br>Luồng đỏ: 3 |  |  |  |  |
| TK_TRANGTHAI | `tK_TRANGTHAI` | Text | 10 | Lưu tạm : T<br>Khai báo tạm (IDA) : A<br>Khai chính thức (IDC) : C<br>Lưu tạm sửa đổi: TE<br>Khai tạm sửa đổi (IDA01) : A01<br>Khai chính thức sửa đổi (IDE): E<br>Hủy : R |  |  |  |  |
| TK_THONGQUAN | `tK_THONGQUAN` | Long Integer |  | Chưa thông quan: 0<br>Đã thông quan: 1 |  |  |  |  |
| TK_ADY1 | `tK_ADY1` | Text | 27 | Tên sắc thuế được ân hạn (dành cho VAT hàng hóa đặc biệt) |  |  |  |  |
| TK_ADZ1 | `tK_ADZ1` | Date/Time | 8 | Hạn nộp thuế sau khi ân hạn (dành cho VAT hàng hóa đặc biệt) |  |  |  |  |
| TK_B31 | `tK_B31` | Date/Time | 8 | Ngày hủy bỏ tờ khai nhập khẩu |  |  |  |  |
| TK_AD8 | `tK_AD8` | Text | 6 | Thời gian hủy bỏ tờ khai |  |  |  |  |
| TK_B32 | `tK_B32` | Date/Time | 8 | Ngày chuyển sang tờ khai thủ công nhập khẩu |  |  |  |  |
| TK_AD9 | `tK_AD9` | Text | 6 | Thời gian chuyển sang tờ khai thủ công nhập khẩu |  |  |  |  |
| TK_B34 | `tK_B34` | Date/Time | 8 | Ngày đăng ký dữ liệu |  |  |  |  |
| TK_ADA | `tK_ADA` | Text | 6 | Thời gian đăng ký dữ liệu |  |  |  |  |
| TK_B35 | `tK_B35` | Text | 5 | Người đang ký |  |  |  |  |
</details>


#### IDB – Gọi tờ khai nhập đã khai tạm để sửa

- **Endpoint**: `POST {{FPT_BASE_URL}}/api/IDB` · xác thực: Bearer token (từ /api/auth/login)
- **Mục đích**: Lấy lại thông tin tờ khai đã IDA (chưa IDC) để sửa; sau đó gửi lại IDA với cùng số tờ khai.
- **Khi nào gọi**: Sau IDA, trước IDC, khi cần sửa nội dung khai tạm.
- **Bước tiếp theo**: IDA
- **Body**: Chỉ cần tài khoản VNACCS + `tK_ICN` (số tờ khai, số 12 chữ số – kiểu number).
- **Phản hồi**: envelope, dữ liệu ở `objIDA`

<details><summary>Body mẫu (Postman, đã che mật khẩu, cắt base64) – đầy đủ: samples/IDB.request.json</summary>

```json
{
  "objVNACCS_ACCOUNT": {
    "useR_ID": "***",
    "password": "***",
    "terminaL_ID": "***",
    "terminaL_ACCESS_KEY": "***"
  },
  "tK_ICN": 107579621110
}
```
</details>


#### IDC – Khai chính thức tờ khai nhập (đăng ký)

- **Endpoint**: `POST {{FPT_BASE_URL}}/api/IDC` · xác thực: Bearer token (từ /api/auth/login)
- **Mục đích**: Đăng ký tờ khai đã khai tạm; Hải quan kiểm tra và phân luồng (xanh/vàng/đỏ). Sau bước này không sửa bằng IDA được nữa – phải sửa đổi bổ sung (IDD/IDA01/IDE).
- **Khi nào gọi**: Sau IDA, khi người khai đã kiểm tra số tờ khai + thuế dự kiến.
- **Bước tiếp theo**: VNACCSREP, IID, IDD
- **Body**: Tài khoản VNACCS + `tK_ICN`.
- **Phản hồi**: envelope, dữ liệu ở `objIDA`

<details><summary>Body mẫu (Postman, đã che mật khẩu, cắt base64) – đầy đủ: samples/IDC.request.json</summary>

```json
{
  "objVNACCS_ACCOUNT": {
    "useR_ID": "***",
    "password": "***",
    "terminaL_ID": "***",
    "terminaL_ACCESS_KEY": "***"
  },
  "tK_ICN": 107592862530
}
```
</details>


#### IDD – Gọi thông tin sửa đổi tờ khai nhập

- **Endpoint**: `POST {{FPT_BASE_URL}}/api/IDD` · xác thực: Bearer token (từ /api/auth/login)
- **Mục đích**: Gọi tờ khai đã đăng ký (đã phân luồng, chưa thông quan) về để khai sửa đổi bổ sung.
- **Khi nào gọi**: Sau IDC, trước thông quan, khi cần sửa.
- **Bước tiếp theo**: IDA01
- **Body**: Tài khoản VNACCS + `tK_ICN`.
- **Phản hồi**: envelope, dữ liệu ở `objIDA`

<details><summary>Body mẫu (Postman, đã che mật khẩu, cắt base64) – đầy đủ: samples/IDD.request.json</summary>

```json
{
  "objVNACCS_ACCOUNT": {
    "useR_ID": "***",
    "password": "***",
    "terminaL_ID": "***",
    "terminaL_ACCESS_KEY": "***"
  },
  "tK_ICN": 107579621110
}
```
</details>


#### IDA01 – Khai sửa đổi tờ khai nhập (tạm)

- **Endpoint**: `POST {{FPT_BASE_URL}}/api/IDA01` · xác thực: Bearer token (từ /api/auth/login)
- **Mục đích**: Gửi nội dung tờ khai nhập đã sửa sau IDD (cùng cấu trúc IDA).
- **Khi nào gọi**: Sau IDD.
- **Bước tiếp theo**: IDE, IDD
- **Phản hồi**: envelope, dữ liệu ở `objIDA`

<details><summary>Body mẫu (Postman, đã che mật khẩu, cắt base64) – đầy đủ: samples/IDA01.request.json</summary>

```json
{
  "objVNACCS_ACCOUNT": {
    "useR_ID": "***",
    "password": "***",
    "terminaL_ID": "***",
    "terminaL_ACCESS_KEY": "***"
  },
  "objVN_IDA": {
    "tK_ICB": "A12",
    "tK_CCC": "",
    "tK_MTC": "2",
    "tK_SKB": "4",
    "tK_ICN": 107592862530,
    "tK_FIC": "",
    "tK_BNO": "",
    "tK_DNO": "",
    "tK_TDN": null,
    "tK_RED": "",
    "tK_IMC": "4100811111001",
    "tK_IMN": "Công Ty TNHH Daekwang Vina",
    "tK_IMY": "(+084)",
    "tK_IMA": "THON XUAN LONG, XA GIA SON, HUYEN NHO QUAN, TINH NINH BINH, VIET NAM",
    "tK_IMT": "0909090909",
    "tK_NMC": "",
    "tK_NMN": "",
    "tK_EPC": "",
    "tK_EPN": "DAEKWANG VINA CO.,LTD",
    "tK_EPY": "",
    "tK_EPA": "#25. DAESEONG-RO 181BEON-GIL",
    "tK_EP2": "HANAM-SI,",
    "tK_EP3": "GYEONGGI-DO,",
    "tK_EP4": "KOREA",
    "tK_EPO": "KR",
    "tK_ENM": "",
    "tK_OL1": "MO",
    "tK_OL2": "",
    "tK_OL3": "",
    "tK_OL4": "",
    "tK_OL5": "",
    "tK_IV1": "A",
    "tK_IV2": null,
    "tK_IV3": "YJ-181015-01",
    "tK_IVD": "30/09/2025",
    "tK_IVP": "KC",
    "tK_IP1": "A",
    "tK_IP2": "FOB",
    "tK_IP3": "USD",
    "tK_IP4": 29820,
    "tK_TP": null,
    "tK_N4": "",
    "tK_SS1": "",
    "tK_SN1": "",
    "tK_SS2": "",
    "tK_SN2": "",
    "tK_SS3": "",
    "tK_SN3": "",
    "tK_SS4": "",
    "tK_SN4": "",
    "tK_SS5": "",
    "tK_SN5": "",
    "tK_ENC": "D",
    "tK_TPM": "1",
    "tK_BP": "",
    "tK_EA1": "",
    "tK_EB1": null,
    "tK_EA2": "",
    "tK_EB2": null,
    "tK_EA3": "",
    "tK_EB3": null,
    "tK_NT2": "HD: YJC-180629-01, ngay 29/06/2018;",
    "tK_REF": "",
    "tK_DPD": "",
    "tK_ST1": "",
    "tK_AD1": "",
    "tK_SD1": "",
    "tK_ST2": "",
    "tK_AD2": "",
    "tK_SD2": "",
    "tK_ST3": "",
    "tK_AD3": "",
    "tK_SD3": "",
    "tK_ARP": "",
    "tK_ADT": "",
    "tK_RYA": "",
    "tK_SBC": "",
    "tK_BCN": "",
    "tK_SCN": "",
    "tK_SCM": "",
    "tK_ICC": "",
    "tK_ICD": "",
    "tK_CH": "88AB",
    "tK_BCM": "",
    "tK_BYA": "",
    "tK_BRC": ""
  },
  "objVN_IDA_VANDON": {
    "vD_BL1": "300925VPNBEF1810058",
    "vD_BL2": "",
    "vD_BL3": "",
    "vD_BL4": "",
    "vD_BL5": "",
    "vD_NO": "208",
    "vD_NOT": "CT",
    "vD_GW": 7553.3,
    "vD_GWT": "KGM",
    "vD_COC": "1",
    "vD_ST": "03CCS04",
    "vD_DST": "PTS",
    "vD_DSN": "PTSC DINH VU",
    "vD_PSC": "CNNGB",
    "vD_PSN": "NINGBO",
    "vD_VSC": "9999",
    "vD_VSN": "KUO LUNG 1841S",
    "vD_ARR": "30/09/2025",
    "vD_MRK": "",
    "vD_ISD": ""
  },
  "objVN_IDA_KTG": {
    "ktG_VD1": "6",
    "ktG_VD2": "",
    "ktG_VCC": "",
    "ktG_VPC": null,
    "ktG_FR1": "A",
    "ktG_FR2": "USD",
    "ktG_FR3": 300,
    "ktG_IN1": "D",
    "ktG_IN2": "",
    "ktG_IN3": null,
    "ktG_IN4": "",
    "ktG_VR1": "",
    "ktG_VI1": "",
    "ktG_VC1": "",
    "ktG_VP1": null,
    "ktG_VT1": null,
    "ktG_VR2": "",
    "ktG_VI2": "",
    "ktG_VC2": "",
    "ktG_VP2": null,
    "ktG_VT2": null,
    "ktG_VR3": "",
    "ktG_VI3": "",
    "ktG_VC3": "",
    "ktG_VP3": null,
    "ktG_VT3": null,
    "ktG_VR4": "",
    "ktG_VI4": "",
    "ktG_VC4": "",
    "ktG_VP4": null,
    "ktG_VT4": null,
    "ktG_VR5": "",
    "ktG_VI5": "",
    "ktG_VC5": "",
    "ktG_VP5": null,
    "ktG_VT5": null,
    "ktG_VLD": "30092025#&PHUONG THUC THANH TOAN: TT"
  },
  "objVN_IDA_HANG": [
    {
      "haG_CMD": "84522900",
      "haG_GZC": "",
      "haG_CMN": "Máy may Công nghiệp. Hiệu JACK. Model A5-W. Hàng đồng bộ gồm đầu máy, chân bàn. Máy may 1 kim điện tử trong xưởng may mặc. Điện 220V, 550W. Mới 100%",
      "haG_QN1": 71,
      "haG_QT1": "SET",
      "haG_VN1": "",
      "haG_VN2": "",
      "haG_VN3": "",
      "haG_VN4": "",
      "haG_VN5": "",
      "haG_QN2": 71,
      "haG_QT2": "SET",
      "haG_BPR": 29820,
      "haG_UPR": 420,
      "haG_UPC": "USD",
      "haG_TSC": "SET",
      "haG_SPD": "",
      "haG_OR": "CN",
      "haG_ORS": "B01",
      "haG_KWS": "",
      "haG_TDL": "",
      "haG_TXN": null,
      "haG_TXR": "",
      "haG_RE": "",
      "haG_TX1": "VB901",
      "haG_TR1": "",
      "haG_TG1": null,
      "haG_TX2": "",
      "haG_TR2": "",
      "haG_TG2": null,
      "haG_TX3": "",
      "haG_TR3": "",
      "haG_TG3": null,
      "haG_TX4": "",
      "haG_TR4": "",
      "haG_TG4": null,
      "haG_TX5": "",
      "haG_TR5": "",
      "haG_TG5": null,
      "haG_REG": null,
      "haG_TXC": "",
      "haG_TXB": null,
      "haG_TXA": null,
      "haG_DPR": null,
      "haG_BPC": "",
      "haG_TXD": ""
    }
  ]
}
```
</details>


<details><summary>Trường – objVN_IDA (126 trường · VNACCS_IDA v1.2.xlsx / VN_IDA)</summary>

| Chỉ tiêu | Key JSON | Kiểu | Độ dài | Mô tả | Bắt buộc | Req | Res | Ghi chú |
|---|---|---|---|---|---|---|---|---|
| TK_ID | `tK_ID` | Long Integer |  | Tờ khai ID FPT.VNACSS |  |  |  |  |
| TK_ICN | `tK_ICN` | Decimal | 12 | Số tờ khai |  |  |  |  |
| TK_JKN | `tK_JKN` | Text | 1 | Phân loại kết xuất báo cáo đã sửa |  |  |  |  |
| TK_FIC | `tK_FIC` | Text | 12 | Số tờ khai đầu tiên |  |  |  |  |
| TK_BNO | `tK_BNO` | Long Integer |  | Số nhánh của tờ khai chia nhỏ |  |  |  |  |
| TK_DNO | `tK_DNO` | Long Integer |  | Tổng số tờ khai chia nhỏ |  |  |  |  |
| TK_TDN | `tK_TDN` | Decimal | 12 | Số tờ khai tạm nhập tái xuất tương ứng |  |  |  |  |
| TK_A06 | `tK_A06` | Text | 3 | Mã phân loại kiểm tra |  |  |  |  |
| TK_A00 | `tK_A00` | Text | 4 | Mã số hàng hóa đại diện |  |  |  |  |
| TK_A07 | `tK_A07` | Text | 10 | Tên cơ quan Hải quan |  |  |  |  |
| TK_CHB | `tK_CHB` | Text | 2 | Đội thủ tục | ✓ |  |  | Don vi Hai quan.xls |
| TK_A09 | `tK_A09` | Date/Time | 8 | Ngày đăng ký |  |  |  |  |
| TK_AD11 | `tK_AD11` | Text | 6 | Giờ đăng ký |  |  |  |  |
| TK_AD21 | `tK_AD21` | Date/Time | 8 | Ngày thay đổi đăng ký |  |  |  |  |
| TK_AD31 | `tK_AD31` | Text | 6 | Giờ thay đổi đăng ký |  |  |  |  |
| TK_RED | `tK_RED` | Date/Time | 8 | Thời hạn tái xuất |  |  |  |  |
| TK_AAA | `tK_AAA` | Text | 1 | Biểu thị trường hợp hết hạn |  |  |  |  |
| TK_IMC | `tK_IMC` | Text | 13 | Mã số thuế nhập khẩu | ✓ |  |  |  |
| TK_IMN | `tK_IMN` | Text | 100 | Tên người nhập khẩu | ✓ |  |  |  |
| TK_IMY | `tK_IMY` | Text | 7 | Mã bưu chính | ✓ |  |  |  |
| TK_IMA | `tK_IMA` | Text | 100 | Địa chỉ người nhập khẩu | ✓ |  |  |  |
| TK_IMT | `tK_IMT` | Text | 20 | Số điện thoại người nhập khẩu |  |  |  |  |
| TK_NMC | `tK_NMC` | Text | 13 | Mã người ủy thác nhập khẩu |  |  |  |  |
| TK_NMN | `tK_NMN` | Text | 100 | Tên người ủy thác nhập khẩu |  |  |  |  |
| TK_EPC | `tK_EPC` | Text | 13 | Mã người xuất khẩu |  |  |  |  |
| TK_EPN | `tK_EPN` | Text | 70 | Tên người xuất khẩu | ✓ |  |  |  |
| TK_EPY | `tK_EPY` | Text | 9 | Mã bưu chính |  |  |  |  |
| TK_EPA | `tK_EPA` | Text | 35 | Địa chỉ 1(Street and number/P.O.BOX) | ✓ |  |  |  |
| TK_EP2 | `tK_EP2` | Text | 35 | Địa chỉ 2(Street and number/P.O.BOX) |  |  |  |  |
| TK_EP3 | `tK_EP3` | Text | 35 | Địa chỉ 3(City name) |  |  |  |  |
| TK_EP4 | `tK_EP4` | Text | 35 | Địa chỉ 4(Country sub-entity, name) |  |  |  |  |
| TK_EPO | `tK_EPO` | Text | 2 | Mã nước(Country, coded) |  |  |  | Nuoc.xls |
| TK_ENM | `tK_ENM` | Text | 70 | Người ủy thác xuất khẩu |  |  |  |  |
| TK_A37 | `tK_A37` | Text | 5 | Mã đại lý Hải quan |  |  |  |  |
| TK_A38 | `tK_A38` | Text | 50 | Tên đại lý Hải quan |  |  |  |  |
| TK_A39 | `tK_A39` | Text | 5 | Mã nhân viên Hải quan |  |  |  |  |
| TK_OL1 | `tK_OL1` | Text | 2 | Mã văn bản pháp quy khác |  |  |  | CẬP NHẬT MÃ VĂN BẢN 2024 (19.01.2024).xlsx |
| TK_OL2 | `tK_OL2` | Text | 2 | Mã văn bản pháp quy khác |  |  |  | CẬP NHẬT MÃ VĂN BẢN 2024 (19.01.2024).xlsx |
| TK_OL3 | `tK_OL3` | Text | 2 | Mã văn bản pháp quy khác |  |  |  | CẬP NHẬT MÃ VĂN BẢN 2024 (19.01.2024).xlsx |
| TK_OL4 | `tK_OL4` | Text | 2 | Mã văn bản pháp quy khác |  |  |  | CẬP NHẬT MÃ VĂN BẢN 2024 (19.01.2024).xlsx |
| TK_OL5 | `tK_OL5` | Text | 2 | Mã văn bản pháp quy khác |  |  |  | CẬP NHẬT MÃ VĂN BẢN 2024 (19.01.2024).xlsx |
| TK_IV1 | `tK_IV1` | Text | 1 | Phân loại hình thức hóa đơn | ✓ |  |  | A: Hóa đơn( Sử dụng trong trường hợp Doanh nghiệp sử dụng hóa đơn để khai báo tờ khai).<br>B: Chứng từ thay thế hóa đơn( Sử dụng trong trường hợp Doanh nghiệp có nhiều hóa đơn được tổng hợp thành 1 hóa đơn tổng đã khai bằng HYS, hoặc chứng từ thay thế cho hóa đơn).<br>D: Hóa đơn điện tử (sử dụng trong trường hợp Doanh nghiệp đã đăng kí hóa đơn điện tử trên VNACCS). |
| TK_IV3 | `tK_IV3` | Text | 35 | Số hóa đơn |  |  |  |  |
| TK_IV2 | `tK_IV2` | Decimal | 12 | Số tiếp nhận hóa đơn điện tử |  |  |  |  |
| TK_IVD | `tK_IVD` | Date/Time | 8 | Ngày phát hành |  |  |  |  |
| TK_IVP | `tK_IVP` | Text | 7 | Phương thức thanh toán | ✓ |  |  | BIENMAU: Biên mậu<br>DA: Nhờ thu chấp nhận chứng từ<br>CAD: Trả tiền lấy chứng từ<br>CANTRU: Cấn trừ<br>CASH: Tiền mặt<br>CHEQUE: Séc<br>DP: Nhờ thu kèm chứng từ<br>GV: Góp vốn<br>H-D-H: Hàng đổi hàng<br>H-T-N: Hàng trả nợ<br>HPH: Hối phiếu<br>KHONGTT: Không thanh toán<br>LC: Tín dụng thư<br>LDDT: Liên doanh đầu tư<br>OA: Mở tài khoản thanh toán<br>TTR: Điện chuyển tiền<br>KC: Khác |
| TK_IP1 | `tK_IP1` | Text | 1 | Mã phân loại giá hóa đơn | ✓ |  |  | A: Giá hóa đơn cho hàng hóa phải trả tiền<br>B: Giá hóa đơn cho hàng hóa không phải trả tiền (F.O.C/hàng khuyến mại)<br>C: Giá hóa đơn cho hàng hóa bao gồm phải trả tiền và không phải trả tiền<br>D: Các trường hợp khác (bao gồm cả trường hợp không có hóa đơn thương mại). |
| TK_IP2 | `tK_IP2` | Text | 3 | Mã điều kiện giao hàng | ✓ |  |  | CIF : Đã bao gồm tiền hàng, bảo hiểm và cước phí.<br>CIP : Đã bao cước phí và phí bảo hiểm trả tới.<br>FOB : Giao hàng trên tàu.<br>FCA : Giao cho người chuyên chở.<br>FAS : Giao dọc mạn tàu.<br>EXW : Giao tại xưởng.<br>C&F : Bao gồm tiền hàng và cước phí.<br>CFR : Bao gồm tiền hàng và cước phí.<br>CPT : Bao gồm cước phí trả tới.<br>DDP : Giao hàng đã nộp thuế.<br>DAP : Giao hàng tại chổ.<br>DAT : Giao hàng tại cảng.<br>C&I :Đã bao gồm tiền hàng và phí bảo hiểm.<br>DAF : Giao tại biên giới.<br>DDU : Giao hàng chưa nộp thuế.<br>DES : Giao hàng tại tàu.<br>DEQ : Giao hàng tại cầu cảng. |
| TK_IP3 | `tK_IP3` | Text | 3 | Mã đồng tiền của hóa đơn | ✓ |  |  | Tien te.xls |
| TK_IP4 | `tK_IP4` | Double |  | Tổng trị giá  hóa đơn | ✓ |  |  |  |
| TK_A86 | `tK_A86` | Decimal | 27.8 | Tổng trị giá tính thuế |  |  |  |  |
| TK_TP | `tK_TP` | Decimal | 20.4 | Tổng hệ số phân bổ trị giá |  |  |  |  |
| TK_A97 | `tK_A97` | Text | 1 | Mã phân loại nhập liệu cho Tổng giá cơ bản |  |  |  |  |
| TK_N4 | `tK_N4` | Text | 1 | Mã kết quả kiểm tra nội dung |  |  |  |  |
| TK_SS1 | `tK_SS1` | Text | 4 | Phân loại giấy phép nhập khẩu |  |  |  | CẬP NHẬT MÃ VĂN BẢN 2024 (19.01.2024).xlsx |
| TK_SN1 | `tK_SN1` | Text | 20 | Số của giấy phép |  |  |  |  |
| TK_SS2 | `tK_SS2` | Text | 4 | Phân loại giấy phép nhập khẩu |  |  |  | CẬP NHẬT MÃ VĂN BẢN 2024 (19.01.2024).xlsx |
| TK_SN2 | `tK_SN2` | Text | 20 | Số của giấy phép |  |  |  |  |
| TK_SS3 | `tK_SS3` | Text | 4 | Phân loại giấy phép nhập khẩu |  |  |  | CẬP NHẬT MÃ VĂN BẢN 2024 (19.01.2024).xlsx |
| TK_SN3 | `tK_SN3` | Text | 20 | Số của giấy phép |  |  |  |  |
| TK_SS4 | `tK_SS4` | Text | 4 | Phân loại giấy phép nhập khẩu |  |  |  | CẬP NHẬT MÃ VĂN BẢN 2024 (19.01.2024).xlsx |
| TK_SN4 | `tK_SN4` | Text | 20 | Số của giấy phép |  |  |  |  |
| TK_SS5 | `tK_SS5` | Text | 4 | Phân loại giấy phép nhập khẩu |  |  |  | CẬP NHẬT MÃ VĂN BẢN 2024 (19.01.2024).xlsx |
| TK_SN5 | `tK_SN5` | Text | 20 | Số của giấy phép |  |  |  |  |
| TK_ENC | `tK_ENC` | Text | 1 | Mã xác định thời hạn nộp thuế |  |  |  | A: trường hợp được áp dụng thời hạn nộp thuế do sử dụng bảo lãnh riêng.<br>B: trường hợp được áp dụng thời hạn nộp thuế do sử dụng bảo lãnh chung.<br>C: trường hợp được áp dụng thời hạn nộp thuế mà không sử dụng bảo lãnh.<br>D: trong trường hợp nộp thuế ngay. |
| TK_TPM | `tK_TPM` | Text | 1 | Người nộp thuế | ✓ |  |  | 1: Người nộp thuế chính là người nhập khẩu.<br>2: Người nộp thuế chính là đại lý làm thủ tục hải quan |
| TK_BP | `tK_BP` | Text | 1 | Mã lý do đề nghị BP (release before permit) |  |  |  | A: Chờ xác định mã số hàng hóa.<br>B: Chờ xác định trị giá tính thuế.<br>C: Trường hợp khác. |
| TK_B08 | `tK_B08` | Text | 1 | Phân loại nộp thuế |  |  |  |  |
| TK_B12 | `tK_B12` | Long Integer |  | Tổng số trang của tờ khai |  |  |  |  |
| TK_B13 | `tK_B13` | Long Integer |  | Tổng số dòng hàng của tờ khai |  |  |  |  |
| TK_EA1 | `tK_EA1` | Text | 3 | Phân loại đính kèm khai báo điện tử |  |  |  | INV: Chứng từ đính kèm bằng HYS là hóa đơn<br>BOL: Chứng từ đính kèm bằng HYS là B/L.<br>AWB: Chứng từ đính kèm bằng HYS là AWB.<br>INS: Chứng từ đính kèm bằng HYS là bảo hiểm.<br>CON: Chứng từ đính kèm bằng HYS là hợp đồng. <br>ALL: Chứng từ đính kèm bằng HYS là tất cả hồ sơ.<br>ETC: Chứng từ đính kèm bằng HYS là loại khác. |
| TK_EB1 | `tK_EB1` | Decimal | 12 | Số đính kèm khai báo điện tử |  |  |  |  |
| TK_EA2 | `tK_EA2` | Text | 3 | Phân loại đính kèm khai báo điện tử |  |  |  | INV: Chứng từ đính kèm bằng HYS là hóa đơn<br>BOL: Chứng từ đính kèm bằng HYS là B/L.<br>AWB: Chứng từ đính kèm bằng HYS là AWB.<br>INS: Chứng từ đính kèm bằng HYS là bảo hiểm.<br>CON: Chứng từ đính kèm bằng HYS là hợp đồng. <br>ALL: Chứng từ đính kèm bằng HYS là tất cả hồ sơ.<br>ETC: Chứng từ đính kèm bằng HYS là loại khác. |
| TK_EB2 | `tK_EB2` | Decimal | 12 | Số đính kèm khai báo điện tử |  |  |  |  |
| TK_EA3 | `tK_EA3` | Text | 3 | Phân loại đính kèm khai báo điện tử |  |  |  | INV: Chứng từ đính kèm bằng HYS là hóa đơn<br>BOL: Chứng từ đính kèm bằng HYS là B/L.<br>AWB: Chứng từ đính kèm bằng HYS là AWB.<br>INS: Chứng từ đính kèm bằng HYS là bảo hiểm.<br>CON: Chứng từ đính kèm bằng HYS là hợp đồng. <br>ALL: Chứng từ đính kèm bằng HYS là tất cả hồ sơ.<br>ETC: Chứng từ đính kèm bằng HYS là loại khác. |
| TK_EB3 | `tK_EB3` | Decimal | 12 | Số đính kèm khai báo điện tử |  |  |  |  |
| TK_NT2 | `tK_NT2` | Text | 100 | Phần ghi chú |  |  |  |  |
| TK_REF | `tK_REF` | Text | 20 | Số quản lý của nội bộ doanh nghiệp |  |  |  |  |
| TK_B16 | `tK_B16` | Text | 5 | Số quản lý người sử dụng |  |  |  |  |
| TK_ADY | `tK_ADY` | Date/Time | 8 | Ngày khai báo nộp thuế |  |  |  |  |
| TK_B23 | `tK_B23` | Text | 81 | Tiêu đề |  |  |  |  |
| TK_KN1 | `tK_KN1` | Text | 1 | Mã sắc thuế được ân hạn |  |  |  |  |
| TK_KO1 | `tK_KO1` | Text | 27 | Tên sắc thuế được ân hạn |  |  |  |  |
| TK_KP1 | `tK_KP1` | Text | 8 | Hạn nộp thuế sau khi ân hạn |  |  |  |  |
| TK_KN2 | `tK_KN2` | Text | 1 | Mã sắc thuế được ân hạn |  |  |  |  |
| TK_KO2 | `tK_KO2` | Text | 27 | Tên sắc thuế được ân hạn |  |  |  |  |
| TK_KP2 | `tK_KP2` | Text | 8 | Hạn nộp thuế sau khi ân hạn |  |  |  |  |
| TK_KN3 | `tK_KN3` | Text | 1 | Mã sắc thuế được ân hạn |  |  |  |  |
| TK_KO3 | `tK_KO3` | Text | 27 | Tên sắc thuế được ân hạn |  |  |  |  |
| TK_KP3 | `tK_KP3` | Text | 8 | Hạn nộp thuế sau khi ân hạn |  |  |  |  |
| TK_KN4 | `tK_KN4` | Text | 1 | Mã sắc thuế được ân hạn |  |  |  |  |
| TK_KO4 | `tK_KO4` | Text | 27 | Tên sắc thuế được ân hạn |  |  |  |  |
| TK_KP4 | `tK_KP4` | Text | 8 | Hạn nộp thuế sau khi ân hạn |  |  |  |  |
| TK_KN5 | `tK_KN5` | Text | 1 | Mã sắc thuế được ân hạn |  |  |  |  |
| TK_KO5 | `tK_KO5` | Text | 27 | Tên sắc thuế được ân hạn |  |  |  |  |
| TK_KP5 | `tK_KP5` | Text | 8 | Hạn nộp thuế sau khi ân hạn |  |  |  |  |
| TK_KN6 | `tK_KN6` | Text | 1 | Mã sắc thuế được ân hạn |  |  |  |  |
| TK_KO6 | `tK_KO6` | Text | 27 | Tên sắc thuế được ân hạn |  |  |  |  |
| TK_KP6 | `tK_KP6` | Text | 8 | Hạn nộp thuế sau khi ân hạn |  |  |  |  |
| TK_DPD | `tK_DPD` | Date/Time | 8 | Ngày khởi hành vận chuyển |  |  |  |  |
| TK_ST1 | `tK_ST1` | Text | 7 | Địa điểm trung chuyển cho vận chuyển bảo thuế (khai báo gộp) |  |  |  |  |
| TK_AD1 | `tK_AD1` | Date/Time | 8 | Ngày dự kiến đến(Địa điểm trung chuyển) |  |  |  |  |
| TK_SD1 | `tK_SD1` | Date/Time | 8 | Ngày khởi hành vận chuyển(Địa điểm trung chuyển) |  |  |  |  |
| TK_ST2 | `tK_ST2` | Text | 7 | Địa điểm trung chuyển cho vận chuyển bảo thuế (khai báo gộp) |  |  |  |  |
| TK_AD2 | `tK_AD2` | Date/Time | 8 | Ngày dự kiến đến(Địa điểm trung chuyển) |  |  |  |  |
| TK_SD2 | `tK_SD2` | Date/Time | 8 | Ngày khởi hành vận chuyển(Địa điểm trung chuyển) |  |  |  |  |
| TK_ST3 | `tK_ST3` | Text | 7 | Địa điểm trung chuyển cho vận chuyển bảo thuế (khai báo gộp) |  |  |  |  |
| TK_AD3 | `tK_AD3` | Date/Time | 8 | Ngày dự kiến đến(Địa điểm trung chuyển) |  |  |  |  |
| TK_SD3 | `tK_SD3` | Date/Time | 8 | Ngày khởi hành vận chuyển(Địa điểm trung chuyển) |  |  |  |  |
| TK_ARP | `tK_ARP` | Text | 7 | Địa điểm đích cho vận chuyển bảo thuế (khai báo gộp) |  |  |  |  |
| TK_ADT | `tK_ADT` | Date/Time | 8 | Ngày dự kiến đến |  |  |  |  |
| TK_RYA | `tK_RYA` | Long Integer | 4 | Năm phát hành bảo lãnh |  |  |  |  |
| TK_SBC | `tK_SBC` | Text | 11 | Mã ngân hàng bảo lãnh |  |  |  |  |
| TK_BCN | `tK_BCN` | Text | 10 | Số chứng từ hạn mức |  |  |  |  |
| TK_SCN | `tK_SCN` | Text | 10 | Số chứng từ bảo lãnh |  |  |  |  |
| TK_SCM | `tK_SCM` | Text | 10 | Kí hiệu chứng từ bảo lãnh |  |  |  |  |
| TK_ICC | `tK_ICC` | Text | 5 | Mã đại lý Hải quan |  |  |  |  |
| TK_ICD | `tK_ICD` | Date/Time | 8 | Ngày đăng ký tờ khai (Dự kiến) |  |  |  |  |
| TK_CH | `tK_CH` | Text | 6 | Cơ quan Hải quan | ✓ |  |  | Don vi Hai quan.xls |
| TK_BCM | `tK_BCM` | Text | 10 | Kí hiệu chứng từ hạn mức |  |  |  |  |
| TK_BYA | `tK_BYA` | Long Integer | 4 | Năm phát hành hạn mức |  |  |  |  |
| TK_BRC | `tK_BRC` | Text | 11 | Mã ngân hàng trả thuế thay |  |  |  |  |
| TK_ICB | `tK_ICB` | Text | 5 | Mã loại hình | ✓ |  |  | Loai hinh(1).doc |
| TK_CCC | `tK_CCC` | Text | 1 | Mã phân loại hàng hóa |  |  |  | A: Hàng quà biếu, quà tặng.<br>B: Hàng an ninh, quốc phòng.<br>C: Hàng cứu trợ khẩn cấp.<br>D: Hàng phòng chống thiên tai, dịch bệnh.<br>E: Hàng viện trợ nhân đạo.<br>F: Hàng bưu chính, chuyển phát nhanh.<br>G: Hàng tài sản di chuyển.<br>H: Hàng hóa được sử dụng cho PTVT xuất nhập cảnh.<br>I: Hàng ngoại giao.<br>J: Hàng khác theo quy định của Chính phủ.<br>K: Hàng bảo quản đặc biệt. |
| TK_MTC | `tK_MTC` | Text | 1 | Mã hiệu phương thức vận chuyển | ✓ |  |  | 1: Hàng được vận chuyển bằng "Đường không"<br>2: Hàng được vận chuyển bằng "Đường biển (container)"<br>3: Hàng được vận chuyển bằng "Đường biển (hàng rời, lỏng...)"<br>4: Hàng được vận chuyển bằng "Đường bộ (xe tải)"<br>5: Hàng được vận chuyển bằng "Đường sắt"<br>6: Hàng được vận chuyển bằng "Đường sông"<br>9: Hàng được vận chuyển bằng "Khác" |
| TK_SKB | `tK_SKB` | Text | 1 | Phân loại cá nhân/tổ chức | ✓ |  |  | Mã 1: Cá nhân gửi đến cá nhân<br>Mã 2: Tổ chức/công ty gửi đến cá nhân<br>Mã 3: Cá nhân gửi đến tổ chức/công ty<br>Mã 4: Tổ chức/Công ty gửi đến tổ chức/công ty<br>Mã 5: Hình thức Khác |
</details>


<details><summary>Trường – objVN_IDA_VANDON[] (23 trường · VNACCS_IDA v1.2.xlsx / VN_IDA_VANDON)</summary>

| Chỉ tiêu | Key JSON | Kiểu | Độ dài | Mô tả | Bắt buộc | Req | Res | Ghi chú |
|---|---|---|---|---|---|---|---|---|
| VD_ID | `vD_ID` | Long Integer |  | Vận đơn ID |  |  |  |  |
| TK_ID | `tK_ID` | Long Integer |  | Tờ khai ID |  |  |  |  |
| VD_BL1 | `vD_BL1` | Text | 35 | Số vận đơn (Số B/L, số AWB v.v. …) | ✓ |  |  |  |
| VD_BL2 | `vD_BL2` | Text | 35 | Số vận đơn (Số B/L, số AWB v.v. …) |  |  |  |  |
| VD_BL3 | `vD_BL3` | Text | 35 | Số vận đơn (Số B/L, số AWB v.v. …) |  |  |  |  |
| VD_BL4 | `vD_BL4` | Text | 35 | Số vận đơn (Số B/L, số AWB v.v. …) |  |  |  |  |
| VD_BL5 | `vD_BL5` | Text | 35 | Số vận đơn (Số B/L, số AWB v.v. …) |  |  |  |  |
| VD_NO | `vD_NO` | Long Integer |  | Số kiện | ✓ |  |  |  |
| VD_NOT | `vD_NOT` | Text | 3 | Mã đơn vị tính số kiện | ✓ |  |  | Loai kien.xls |
| VD_GW | `vD_GW` | Decimal | 18.8 | Tổng trọng lượng hàng (Gross) | ✓ |  |  |  |
| VD_GWT | `vD_GWT` | Text | 6 | Mã đơn vị tính trọng lượng (Gross) | ✓ |  |  |  |
| VD_COC | `vD_COC` | Long Integer |  | Số lượng container |  |  |  |  |
| VD_ST | `vD_ST` | Text | 7 | Mã địa điểm lưu kho hàng chờ thông quan dự kiến | ✓ |  |  | 420Ma dia diem 14062024.xlsx |
| VD_A51 | `vD_A51` | Text | 20 | Tên địa điểm lưu kho hàng chờ thông quan dự kiến |  |  |  |  |
| VD_DST | `vD_DST` | Text | 6 | Mã địa điểm dỡ hàng | ✓ |  |  | DNCX.xls<br>KhoNgoaiQuan-KhoCFS 2024.xls<br>San bay trong nuoc.xls<br>Cua khau duong bo - Ga.xls<br>Cang - ICD trong nuoc 2024.xls |
| VD_DSN | `vD_DSN` | Text | 255 | Tên địa điểm dỡ hàng | ✓ |  |  |  |
| VD_PSC | `vD_PSC` | Text | 6 | Mã địa điểm xếp hàng | ✓ |  |  | DNCX.xls<br>KhoNgoaiQuan-KhoCFS 2024.xls<br>San bay nuoc ngoai.xls<br>San bay trong nuoc.xls<br>Cua khau duong bo - Ga.xls<br>Cang nuoc ngoai.xls<br>Cang - ICD trong nuoc 2024.xls |
| VD_PSN | `vD_PSN` | Text | 255 | Tên địa điểm xếp hàng | ✓ |  |  |  |
| VD_VSC | `vD_VSC` | Text | 9 | Mã phương tiện vận chuyển |  |  |  |  |
| VD_VSN | `vD_VSN` | Text | 255 | Tên phương tiện vận chuyển | ✓ |  |  |  |
| VD_ARR | `vD_ARR` | Date/Time | 8 | Ngày hàng đến | ✓ |  |  |  |
| VD_MRK | `vD_MRK` | Text | 140 | Ký hiệu và số hiệu |  |  |  |  |
| VD_ISD | `vD_ISD` | Date/Time | 8 | Ngày được phép nhập kho đầu tiên |  |  |  |  |
</details>


<details><summary>Trường – objVN_IDA_KTG (42 trường · VNACCS_IDA v1.2.xlsx / VN_IDA_KTG)</summary>

| Chỉ tiêu | Key JSON | Kiểu | Độ dài | Mô tả | Bắt buộc | Req | Res | Ghi chú |
|---|---|---|---|---|---|---|---|---|
| KTG_ID | `ktG_ID` | Long Integer |  | Tờ khai trị giá ID |  |  |  |  |
| TK_ID | `tK_ID` | Long Integer |  | Tờ khai ID |  |  |  |  |
| KTG_VD1 | `ktG_VD1` | Text | 1 | Mã phân loại khai trị giá |  |  |  |  |
| KTG_VD2 | `ktG_VD2` | Text | 9 | Số tiếp nhận tờ khai trị giá tổng hợp |  |  |  |  |
| KTG_A93 | `ktG_A93` | Text | 1 | Phân loại công thức chuẩn của khai báo trị giá tổng hợp |  |  |  |  |
| KTG_A94 | `ktG_A94` | Text | 2 | Mã phân loại điều chỉnh trị giá của khai báo trị giá tổng hợp |  |  |  |  |
| KTG_A95 | `ktG_A95` | Text | 22 | Phương pháp điều chỉnh trị giá của khai báo trị giá tổng hợp |  |  |  |  |
| KTG_VCC | `ktG_VCC` | Text | 3 | Mã tiền tệ của giá cơ sở hiệu chỉnh trị giá |  |  |  |  |
| KTG_VPC | `ktG_VPC` | Decimal | 20.4 | Giá cơ sở để hiệu chỉnh trị giá |  |  |  |  |
| KTG_FR1 | `ktG_FR1` | Text | 1 | Mã phân loại phí vận chuyển |  |  |  | A: Khai trong trường hợp chứng từ vận tải ghi Tổng số tiền cước phí chung cho tất cả hàng hóa trên chứng từ.<br>B: Khai trong trường hợp:<br>      - Hóa đơn lô hàng có cả hàng trả tiền và hàng F.O.C;<br>      - Tách riêng phí vận tải của hàng trả tiền với hàng F.O.C trên chứng từ vận tải.<br>Tương ứng với mã này tại ô phí vận chuyển chỉ nhập phí của hàng phải trả tiền (ô 3) để hệ thống tự động phân bổ, đối với các mặt hàng F.O.C người khai hải quan tự cộng cước phí vận tải để tính toán trị giá tính thuế rồi điền vào ô trị giá tính thuế của dòng hàng F.O.C.<br>C: Khai trong trường hợp tờ khai chỉ nhập khẩu một phần hàng hóa của lô hàng trên chứng từ vận tải.<br>D: Phân bổ cước phí vận tải theo tỷ lệ trọng lượng, dung tích. Khi khai mã này, người khai hải quan phải khai tờ khai trị giá để phân bổ các khoản điều chỉnh, tính toán trị giá tính thuế của từng mặt hàng, lấy kết quả tính toán trị giá tính thuế trên tờ khai trị giá để nhập vào ô tương ứng trên tờ khai nhập khẩu của hệ thống VNACCS.<br>E: Khai trong trường hợp trị giá hóa đơn của hàng hóa đã có phí vận tải (ví dụ: CIF, C&F, CIP) nhưng cước phí thực tế vượt quá cước phí trên hóa đơn (phát sinh thêm phí vận tải khi hàng về cảng nhập khẩu: tăng cước phí do giá nhiên liệu tăng, do biến động tiền tệ, do tắc tàu tại cảng ...). <br>F: Khai trong trường hợp có cước vượt cước và chỉ nhập khẩu 1 phần hàng hóa của lô hàng. |
| KTG_FR2 | `ktG_FR2` | Text | 3 | Mã tiền tệ phí vận chuyển |  |  |  |  |
| KTG_FR3 | `ktG_FR3` | Decimal | 18.4 | Phí vận chuyển |  |  |  |  |
| KTG_IN1 | `ktG_IN1` | Text | 1 | Mã phân loại bảo hiểm |  |  |  |  |
| KTG_IN2 | `ktG_IN2` | Text | 3 | Mã tiền tệ của tiền bảo hiểm |  |  |  |  |
| KTG_IN3 | `ktG_IN3` | Decimal | 24.4 | Phí bảo hiểm |  |  |  |  |
| KTG_IN4 | `ktG_IN4` | Text | 6 | Số đăng ký bảo hiểm tổng hợp |  |  |  |  |
| KTG_VR1 | `ktG_VR1` | Text | 1 | Mã tên khoản điều chỉnh |  |  |  | A: Phí hoa hồng bán hàng, phí môi giới (AD).<br>B: Chi phí bao bì được coi là đồng nhất với hàng hóa nhập khẩu (AD).<br>C: Chi phí đóng gói hàng hóa (AD).<br>D: Khoản trợ giúp (AD).<br>E: Phí bản quyền, phí giấy phép (AD).<br>P: Các khoản tiền mà người nhập khẩu phải trả từ số tiền thu được sau khi bán lại, định đoạt, sử dụng hàng hóa nhập khẩu (AD). <br>Q: Các khoản tiền người mua phải thanh toán nhưng chưa tính vào giá mua trên hóa đơn, gồm: tiền trả trước, ứng trước, tiền đặt cọc (AD).<br>K: khoản tiền người mua thanh toán cho người thứ ba theo yêu cầu của người bán (AD)<br>M: khoản tiền được thanh toán bằng cách bù trừ nợ (AD).<br>U: Chi phí cho những hoạt động phát sinh sau khi nhập khẩu hàng hóa bao gồm các chi phí về xây dựng, kiến trúc, lắp đặt, bảo dưỡng hoặc trợ giúp kỹ thuật, tư vấn kỹ thuật, chi phí giám sát và các chi phí tương tự (SB).<br>V: Phí vận tải phát sinh sau khi hàng hóa được vận chuyển đến cửa khẩu nhập đầu tiên (SB).<br>H: Phí bảo hiểm phát sinh sau khi hàng hóa được vận chuyển đến cửa khẩu nhập đầu tiên (SB).<br>T: Các khoản thuế, phí, lệ phí phải nộp ở Việt Nam đã nằm trong giá mua hàng nhập khẩu (SB).<br>G: Khoản giảm giá (SB).<br>S: Các chi phí do người mua chịu liên quan đến tiếp thị hàng hóa nhập khẩu (SB)<br>L: Khoản tiền lãi tương ứng với mức lãi suất theo thỏa thuận tài chính của người mua và có liên quan đến việc mua hàng hóa nhập khẩu (SB).<br>N: Khác |
| KTG_VI1 | `ktG_VI1` | Text | 3 | Mã phân loại điều chỉnh trị giá |  |  |  | AD: cộng thêm số tiền điều chỉnh. <br>SB: Trừ đi số tiền điều chỉnh.<br>IP: Trị giá tính thuế là trị giá hóa đơn. <br>DP: Nhập vào tổng giá tính thuế được tính bằng tay. |
| KTG_VC1 | `ktG_VC1` | Text | 3 | Mã đồng tiền của khoản điều chỉnh trị giá |  |  |  | Tien te.xls |
| KTG_VP1 | `ktG_VP1` | Decimal | 20.4 | Trị giá khoản điều chỉnh |  |  |  |  |
| KTG_VT1 | `ktG_VT1` | Decimal | 20.4 | Tổng hệ số phân bổ trị giá khoản điều chỉnh |  |  |  |  |
| KTG_VR2 | `ktG_VR2` | Text | 1 | Mã tên khoản điều chỉnh |  |  |  | Tham khảo F18 |
| KTG_VI2 | `ktG_VI2` | Text | 3 | Mã phân loại điều chỉnh trị giá |  |  |  | Tham khảo F19 |
| KTG_VC2 | `ktG_VC2` | Text | 3 | Mã đồng tiền của khoản điều chỉnh trị giá |  |  |  | Tien te.xls |
| KTG_VP2 | `ktG_VP2` | Decimal | 20.4 | Trị giá khoản điều chỉnh |  |  |  |  |
| KTG_VT2 | `ktG_VT2` | Decimal | 20.4 | Tổng hệ số phân bổ trị giá khoản điều chỉnh |  |  |  |  |
| KTG_VR3 | `ktG_VR3` | Text | 1 | Mã tên khoản điều chỉnh |  |  |  | Tham khảo F18 |
| KTG_VI3 | `ktG_VI3` | Text | 3 | Mã phân loại điều chỉnh trị giá |  |  |  | Tham khảo F19 |
| KTG_VC3 | `ktG_VC3` | Text | 3 | Mã đồng tiền của khoản điều chỉnh trị giá |  |  |  | Tien te.xls |
| KTG_VP3 | `ktG_VP3` | Decimal | 20.4 | Trị giá khoản điều chỉnh |  |  |  |  |
| KTG_VT3 | `ktG_VT3` | Decimal | 20.4 | Tổng hệ số phân bổ trị giá khoản điều chỉnh |  |  |  |  |
| KTG_VR4 | `ktG_VR4` | Text | 1 | Mã tên khoản điều chỉnh |  |  |  | Tham khảo F18 |
| KTG_VI4 | `ktG_VI4` | Text | 3 | Mã phân loại điều chỉnh trị giá |  |  |  | Tham khảo F19 |
| KTG_VC4 | `ktG_VC4` | Text | 3 | Mã đồng tiền của khoản điều chỉnh trị giá |  |  |  | Tien te.xls |
| KTG_VP4 | `ktG_VP4` | Decimal | 20.4 | Trị giá khoản điều chỉnh |  |  |  |  |
| KTG_VT4 | `ktG_VT4` | Decimal | 20.4 | Tổng hệ số phân bổ trị giá khoản điều chỉnh |  |  |  |  |
| KTG_VR5 | `ktG_VR5` | Text | 1 | Mã tên khoản điều chỉnh |  |  |  | Tham khảo F18 |
| KTG_VI5 | `ktG_VI5` | Text | 3 | Mã phân loại điều chỉnh trị giá |  |  |  | Tham khảo F19 |
| KTG_VC5 | `ktG_VC5` | Text | 3 | Mã đồng tiền của khoản điều chỉnh trị giá |  |  |  | Tien te.xls |
| KTG_VP5 | `ktG_VP5` | Decimal | 20.4 | Trị giá khoản điều chỉnh |  |  |  |  |
| KTG_VT5 | `ktG_VT5` | Decimal | 20.4 | Tổng hệ số phân bổ trị giá khoản điều chỉnh |  |  |  |  |
| KTG_VLD | `ktG_VLD` | Text | 280 | Chi tiết khai trị giá |  |  |  |  |
</details>


<details><summary>Trường – objVN_IDA_HANG[] (106 trường · VNACCS_IDA v1.2.xlsx / VN_IDA_HANG)</summary>

| Chỉ tiêu | Key JSON | Kiểu | Độ dài | Mô tả | Bắt buộc | Req | Res | Ghi chú |
|---|---|---|---|---|---|---|---|---|
| HAG_ID | `haG_ID` | Long Integer |  | Hàng ID |  |  |  |  |
| TK_ID | `tK_ID` | Long Integer |  | Tờ khai ID |  |  |  |  |
| HAG_B25 | `haG_B25` | Text | 2 | Số dòng |  |  |  |  |
| HAG_CMD | `haG_CMD` | Text | 12 | Mã số hàng hóa | ✓ |  |  |  |
| HAG_GZC | `haG_GZC` | Text | 255 | Mã quản lý riêng |  |  |  |  |
| HAG_B29 | `haG_B29` | Text | 1 | Mã phân loại tái xác nhận giá |  |  |  |  |
| HAG_CMN | `haG_CMN` | Text | 200 | Mô tả hàng hóa | ✓ |  |  |  |
| HAG_QN1 | `haG_QN1` | Decimal | 18.2 | Số lượng (1) | ✓ |  |  |  |
| HAG_QT1 | `haG_QT1` | Text | 4 | Mã đơn vị tính (1) | ✓ |  |  | DVT.xls |
| HAG_VN1 | `haG_VN1` | Long Integer |  | Số của mục khai khoản điều chỉnh |  |  |  |  |
| HAG_VN2 | `haG_VN2` | Long Integer |  | Số của mục khai khoản điều chỉnh |  |  |  |  |
| HAG_VN3 | `haG_VN3` | Long Integer |  | Số của mục khai khoản điều chỉnh |  |  |  |  |
| HAG_VN4 | `haG_VN4` | Long Integer |  | Số của mục khai khoản điều chỉnh |  |  |  |  |
| HAG_VN5 | `haG_VN5` | Long Integer |  | Số của mục khai khoản điều chỉnh |  |  |  |  |
| HAG_QN2 | `haG_QN2` | Decimal | 18.2 | Số lượng (2) | ✓ |  |  |  |
| HAG_QT2 | `haG_QT2` | Text | 4 | Mã đơn vị tính (2) | ✓ |  |  | DVT.xls |
| HAG_BPR | `haG_BPR` | Double |  | Trị giá  hóa đơn | ✓ |  |  |  |
| HAG_UPR | `haG_UPR` | Decimal | 20.8 | Đơn giá hóa đơn | ✓ |  |  |  |
| HAG_UPC | `haG_UPC` | Text | 3 | Mã đồng tiền của đơn giá | ✓ |  |  | Tien te.xls |
| HAG_TSC | `haG_TSC` | Text | 4 | Đơn vị của đơn giá và số lượng |  |  |  |  |
| HAG_B36 | `haG_B36` | Decimal | 25.4 | Trị giá tính thuế(S) |  |  |  |  |
| HAG_B50 | `haG_B50` | Text | 3 | Mã đồng tiền của giá tính thuế |  |  |  | Tien te.xls |
| HAG_B51 | `haG_B51` | Decimal | 28.4 | Trị giá tính thuế(M) |  |  |  |  |
| HAG_B37 | `haG_B37` | Decimal | 20.4 | Số lượng tính thuế |  |  |  |  |
| HAG_B38 | `haG_B38` | Text | 4 | Mã đơn vị tính chuẩn để đánh thuế nhập khẩu |  |  |  |  |
| HAG_KKT | `haG_KKT` | Decimal | 26.4 | Đơn giá tính thuế |  |  |  |  |
| HAG_KKS | `haG_KKS` | Text | 4 | Mã tiền tệ đơn giá tính thuế |  |  |  |  |
| HAG_B42 | `haG_B42` | Text | 1 | Mã phân loại thuế suất thuế nhập khẩu |  |  |  |  |
| HAG_B43 | `haG_B43` | Text | 30 | Thuế suất thuế nhập khẩu |  |  |  |  |
| HAG_SKB | `haG_SKB` | Text | 1 | Phân loại nhập thuế suất nhập khẩu |  |  |  |  |
| HAG_SPD | `haG_SPD` | Text | 10 | Mã xác định mức thuế nhập khẩu theo lượng |  |  |  |  |
| HAG_B47 | `haG_B47` | Decimal | 24.4 | Số tiền thuế nhập khẩu |  |  |  |  |
| HAG_OR | `haG_OR` | Text | 2 | Mã nước xuất xứ | ✓ |  |  | Nuoc.xls |
| HAG_B56 | `haG_B56` | Text | 7 | Tên nơi xuất xứ |  |  |  |  |
| HAG_ORS | `haG_ORS` | Text | 3 | Mã biểu thuế nhập khẩu | ✓ |  |  | Bieu thue.xls |
| HAG_B49 | `haG_B49` | Decimal | 24.4 | Số tiền giảm thuế nhập khẩu |  |  |  |  |
| HAG_KWS | `haG_KWS` | Text | 1 | Mã ngoài hạn ngạch |  |  |  |  |
| HAG_TDL | `haG_TDL` | Text | 2 | Số thứ tự của dòng hàng trên tờ khai tạm nhập tái xuất tương ứng |  |  |  |  |
| HAG_TXN | `haG_TXN` | Decimal | 12 | Số đăng ký danh mục miễn thuế nhập khẩu |  |  |  |  |
| HAG_TXR | `haG_TXR` | Text | 3 | Số dòng tương ứng trong danh mục miễn thuế nhập khẩu |  |  |  |  |
| HAG_RE | `haG_RE` | Text | 5 | Mã miễn / Giảm / Không chịu thuế nhập khẩu |  |  |  | Mien-Giam-Khong chiu thue XNK.xls |
| HAG_B59 | `haG_B59` | Text | 60 | Điều khoản miễn / Giảm / Không chịu thuế nhập khẩu (Pháp luật) |  |  |  |  |
| HAG_KQ1 | `haG_KQ1` | Text | 27 | Tên khoản mục thuế và thu khác |  |  |  |  |
| HAG_TX1 | `haG_TX1` | Text | 10 | Mã áp dụng thuế suất thuế và thu khác (thuế chống bán phá giá) |  |  |  | Bảng thuế CBPG (cập nhật ngày 13.06.2024).xls |
| HAG_KS1 | `haG_KS1` | Decimal | 25.4 | Trị giá tính thuế và thu khác |  |  |  |  |
| HAG_KT1 | `haG_KT1` | Decimal | 20.4 | Số tiền giảm thuế và thu khác(output) |  |  |  |  |
| HAG_KU1 | `haG_KU1` | Text | 4 | Mã đơn vị tính chuẩn để đánh thuế và thu khác |  |  |  |  |
| HAG_KY1 | `haG_KY1` | Text | 25 | Thuế suất thuế và thu khác |  |  |  |  |
| HAG_KZ1 | `haG_KZ1` | Decimal | 24.4 | Số tiền thuế và thu khác |  |  |  |  |
| HAG_TR1 | `haG_TR1` | Text | 5 | Mã miễn / Giảm / Không chịu thuế và thu khác (thuế chống bán phá giá) |  |  |  |  |
| HAG_LC1 | `haG_LC1` | Text | 60 | Điều khoản miễn / Giảm / Không chịu thuế và thu khác (Pháp luật) |  |  |  |  |
| HAG_LB1 | `haG_LB1` | Decimal | 24.4 | Số tiền giảm thuế và thu khác |  |  |  |  |
| HAG_KQ2 | `haG_KQ2` | Text | 27 | Tên khoản mục thuế và thu khác |  |  |  |  |
| HAG_TX2 | `haG_TX2` | Text | 10 | Mã áp dụng thuế suất thuế và thu khác (thuế chống phân biệt đối xử) |  |  |  |  |
| HAG_KS2 | `haG_KS2` | Decimal | 25.4 | Trị giá tính thuế và thu khác |  |  |  |  |
| HAG_KT2 | `haG_KT2` | Decimal | 20.4 | Số tiền giảm thuế và thu khác(output) |  |  |  |  |
| HAG_KU2 | `haG_KU2` | Text | 4 | Mã đơn vị tính chuẩn để đánh thuế và thu khác |  |  |  |  |
| HAG_KY2 | `haG_KY2` | Text | 25 | Thuế suất thuế và thu khác |  |  |  |  |
| HAG_KZ2 | `haG_KZ2` | Decimal | 24.4 | Số tiền thuế và thu khác |  |  |  |  |
| HAG_TR2 | `haG_TR2` | Text | 5 | Mã miễn / Giảm / Không chịu thuế và thu khác |  |  |  |  |
| HAG_LC2 | `haG_LC2` | Text | 60 | Điều khoản miễn / Giảm / Không chịu thuế và thu khác (Pháp luật) |  |  |  |  |
| HAG_LB2 | `haG_LB2` | Decimal | 24.4 | Số tiền giảm thuế và thu khác |  |  |  |  |
| HAG_KQ3 | `haG_KQ3` | Text | 27 | Tên khoản mục thuế và thu khác |  |  |  |  |
| HAG_TX3 | `haG_TX3` | Text | 10 | Mã áp dụng thuế suất thuế và thu khác (thuế tiêu thụ đặc biệt) |  |  |  | Thue khac - TTDB.xls |
| HAG_KS3 | `haG_KS3` | Decimal | 25.4 | Trị giá tính thuế và thu khác |  |  |  |  |
| HAG_KT3 | `haG_KT3` | Decimal | 20.4 | Số lượng tính thuế và thu khác |  |  |  |  |
| HAG_KU3 | `haG_KU3` | Text | 4 | Mã đơn vị tính chuẩn để đánh thuế và thu khác |  |  |  |  |
| HAG_KY3 | `haG_KY3` | Text | 25 | Thuế suất thuế và thu khác |  |  |  |  |
| HAG_KZ3 | `haG_KZ3` | Decimal | 24.4 | Số tiền thuế và thu khác |  |  |  |  |
| HAG_TR3 | `haG_TR3` | Text | 5 | Mã miễn / Giảm / Không chịu thuế và thu khác  (thuế tiêu thụ đặc biệt) |  |  |  |  |
| HAG_LC3 | `haG_LC3` | Text | 60 | Điều khoản miễn / Giảm / Không chịu thuế và thu khác (Pháp luật) |  |  |  |  |
| HAG_LB3 | `haG_LB3` | Decimal | 24.4 | Số tiền giảm thuế và thu khác(output) |  |  |  |  |
| HAG_KQ4 | `haG_KQ4` | Text | 27 | Tên khoản mục thuế và thu khác |  |  |  |  |
| HAG_TX4 | `haG_TX4` | Text | 10 | Mã áp dụng thuế suất thuế và thu khác (thuế bảo vệ môi trường) |  |  |  | Thue khac - BVMT.xls |
| HAG_KS4 | `haG_KS4` | Decimal | 25.4 | Trị giá tính thuế và thu khác |  |  |  |  |
| HAG_KT4 | `haG_KT4` | Decimal | 20.4 | Số lượng tính thuế và thu khác |  |  |  |  |
| HAG_KU4 | `haG_KU4` | Text | 4 | Mã đơn vị tính chuẩn để đánh thuế và thu khác |  |  |  |  |
| HAG_KY4 | `haG_KY4` | Text | 25 | Thuế suất thuế và thu khác |  |  |  |  |
| HAG_KZ4 | `haG_KZ4` | Decimal | 24.4 | Số tiền thuế và thu khác |  |  |  |  |
| HAG_TR4 | `haG_TR4` | Text | 5 | Mã miễn / Giảm / Không chịu thuế và thu khác (thuế bảo vệ môi trường) |  |  |  |  |
| HAG_LC4 | `haG_LC4` | Text | 60 | Điều khoản miễn / Giảm / Không chịu thuế và thu khác (Pháp luật) |  |  |  |  |
| HAG_LB4 | `haG_LB4` | Decimal | 24.4 | Số tiền giảm thuế và thu khác(output) |  |  |  |  |
| HAG_KQ5 | `haG_KQ5` | Text | 27 | Tên khoản mục thuế và thu khác |  |  |  |  |
| HAG_TX5 | `haG_TX5` | Text | 10 | Mã áp dụng thuế suất thuế và thu khác (thuế VAT) | ✓ |  |  | Thue khac - GTGT.xls |
| HAG_KS5 | `haG_KS5` | Decimal | 25.4 | Trị giá tính thuế và thu khác |  |  |  |  |
| HAG_KT5 | `haG_KT5` | Decimal | 20.4 | Số lượng tính thuế và thu khác |  |  |  |  |
| HAG_KU5 | `haG_KU5` | Text | 4 | Mã đơn vị tính chuẩn để đánh thuế và thu khác |  |  |  |  |
| HAG_KY5 | `haG_KY5` | Text | 25 | Thuế suất thuế và thu khác |  |  |  |  |
| HAG_KZ5 | `haG_KZ5` | Decimal | 24.4 | Số tiền thuế và thu khác |  |  |  |  |
| HAG_TR5 | `haG_TR5` | Text | 5 | Mã miễn / Giảm / Không chịu thuế và thu khác (thuế VAT) |  |  |  | 767Khong thue - GTGT.xls |
| HAG_LC5 | `haG_LC5` | Text | 60 | Điều khoản miễn / Giảm / Không chịu thuế và thu khác (Pháp luật) |  |  |  |  |
| HAG_LB5 | `haG_LB5` | Decimal | 24.4 | Số tiền giảm thuế và thu khác(output) |  |  |  |  |
| HAG_TG2 | `haG_TG2` | Decimal | 24.4 | Số tiền giảm thuế và thu khác(input) |  |  |  |  |
| HAG_TG1 | `haG_TG1` | Decimal | 24.4 | Số tiền giảm thuế và thu khác(input) |  |  |  |  |
| HAG_REG | `haG_REG` | Decimal | 24.4 | Số tiền giảm thuế nhập khẩu |  |  |  |  |
| HAG_TG5 | `haG_TG5` | Decimal | 24.4 | Số tiền giảm thuế và thu khác(input) |  |  |  |  |
| HAG_TG4 | `haG_TG4` | Decimal | 24.4 | Số tiền giảm thuế và thu khác(input) |  |  |  |  |
| HAG_TG3 | `haG_TG3` | Decimal | 24.4 | Số tiền giảm thuế và thu khác(input) |  |  |  |  |
| HAG_TXC | `haG_TXC` | Text | 4 | Mã đơn vị tính thuế tuyệt đối |  |  |  |  |
| HAG_TXB | `haG_TXB` | Decimal | 18.4 | Mức thuế tuyệt đối |  |  |  |  |
| HAG_TXA | `haG_TXA` | Decimal | 18.4 | Thuế suất |  |  |  |  |
| HAG_DPR | `haG_DPR` | Decimal | 28.4 | Trị giá tính thuế |  |  |  |  |
| HAG_BPC | `haG_BPC` | Text | 3 | Mã đồng tiền trị giá tính thuế |  |  |  |  |
| HAG_TXD | `haG_TXD` | Text | 3 | Mã đồng tiền của mức thuế tuyệt đối |  |  |  |  |
| HAG_MAHANG | `haG_MAHANG` | Text | 255 | Mã hàng |  |  |  |  |
| HAG_TDT | `haG_TDT` | Text | 1 | x |  |  |  |  |
</details>


#### IDE – Đăng ký sửa đổi tờ khai nhập (chính thức)

- **Endpoint**: `POST {{FPT_BASE_URL}}/api/IDE` · xác thực: Bearer token (từ /api/auth/login)
- **Mục đích**: Đăng ký chính thức bản sửa đổi đã khai ở IDA01; Hải quan xử lý lại (phân luồng lại nếu có).
- **Khi nào gọi**: Sau IDA01.
- **Bước tiếp theo**: VNACCSREP, IID
- **Body**: Tài khoản VNACCS + `tK_ICN`.
- **Phản hồi**: envelope, dữ liệu ở `objIDA`

<details><summary>Body mẫu (Postman, đã che mật khẩu, cắt base64) – đầy đủ: samples/IDE.request.json</summary>

```json
{
  "objVNACCS_ACCOUNT": {
    "useR_ID": "***",
    "password": "***",
    "terminaL_ID": "***",
    "terminaL_ACCESS_KEY": "***"
  },
  "tK_ICN": 107592862531
}
```
</details>


#### IID – Tham chiếu (tra cứu) tờ khai nhập

- **Endpoint**: `POST {{FPT_BASE_URL}}/api/IID` · xác thực: Bearer token (từ /api/auth/login)
- **Mục đích**: Lấy thông tin + trạng thái hiện tại của tờ khai nhập (luồng, thông quan, thuế).
- **Khi nào gọi**: Bất kỳ lúc nào đã có số tờ khai; dùng để làm mới trạng thái sau IDC/IDE.
- **Body**: Tài khoản VNACCS + `tK_ICN`.
- **Phản hồi**: envelope, dữ liệu ở `objIDA`

<details><summary>Body mẫu (Postman, đã che mật khẩu, cắt base64) – đầy đủ: samples/IID.request.json</summary>

```json
{
  "objVNACCS_ACCOUNT": {
    "useR_ID": "***",
    "password": "***",
    "terminaL_ID": "***",
    "terminaL_ACCESS_KEY": "***"
  },
  "tK_ICN": 107592862530
}
```
</details>


<details><summary>Trường – objVN_IDA_TRANGTHAI (27 trường · VNACCS_IDA v1.2.xlsx / VN_IDA_TRANGTHAI)</summary>

| Chỉ tiêu | Key JSON | Kiểu | Độ dài | Mô tả | Bắt buộc | Req | Res | Ghi chú |
|---|---|---|---|---|---|---|---|---|
| TK_ID | `tK_ID` | Long Integer |  | Tờ khai ID |  |  |  |  |
| TK_ADY | `tK_ADY` | Date/Time | 8 | x |  |  |  |  |
| TK_ADZ | `tK_ADZ` | Long Integer |  | x |  |  |  |  |
| TK_C20 | `tK_C20` | Text | 255 | Tên trưởng đơn vị Hải quan |  |  |  |  |
| TK_C21 | `tK_C21` | Date/Time | 8 | Ngày cấp phép |  |  |  |  |
| TK_AD4 | `tK_AD4` | Long Integer |  | Thời gian cấp phép |  |  |  |  |
| TK_C22 | `tK_C22` | Date/Time | 8 | Ngày hoàn thành kiểm tra |  |  |  |  |
| TK_AD5 | `tK_AD5` | Long Integer |  | Giờ hoàn thành kiểm tra |  |  |  |  |
| TK_C23 | `tK_C23` | Text | 2 | Phân loại thẩm tra sau thông quan |  |  |  |  |
| TK_C24 | `tK_C24` | Date/Time | 8 | Ngày phê duyệt BP |  |  |  |  |
| TK_AD6 | `tK_AD6` | Long Integer |  | Giờ phê duyệt BP |  |  |  |  |
| TK_C25 | `tK_C25` | Date/Time | 8 | Ngày hoàn thành kiểm tra BP |  |  |  |  |
| TK_AD7 | `tK_AD7` | Long Integer |  | Giờ hoàn thành kiểm tra BP |  |  |  |  |
| TK_C26 | `tK_C26` | Long Integer |  | Số ngày mong đợi đến khi cấp phép |  |  |  |  |
| TK_ADX | `tK_ADX` | Text | 1 | Mã sắc thuế được ân hạn (dành cho VAT hàng hóa đặc biệt) |  |  |  |  |
| TK_LUONG | `tK_LUONG` | Long Integer |  | Chưa phân luồng: 0<br>Luồng xanh: 1<br>Luồng vàng: 2<br>Luồng đỏ: 3 |  |  |  |  |
| TK_TRANGTHAI | `tK_TRANGTHAI` | Text | 10 | Lưu tạm : T<br>Khai báo tạm (IDA) : A<br>Khai chính thức (IDC) : C<br>Lưu tạm sửa đổi: TE<br>Khai tạm sửa đổi (IDA01) : A01<br>Khai chính thức sửa đổi (IDE): E<br>Hủy : R |  |  |  |  |
| TK_THONGQUAN | `tK_THONGQUAN` | Long Integer |  | Chưa thông quan: 0<br>Đã thông quan: 1 |  |  |  |  |
| TK_ADY1 | `tK_ADY1` | Text | 27 | Tên sắc thuế được ân hạn (dành cho VAT hàng hóa đặc biệt) |  |  |  |  |
| TK_ADZ1 | `tK_ADZ1` | Date/Time | 8 | Hạn nộp thuế sau khi ân hạn (dành cho VAT hàng hóa đặc biệt) |  |  |  |  |
| TK_B31 | `tK_B31` | Date/Time | 8 | Ngày hủy bỏ tờ khai nhập khẩu |  |  |  |  |
| TK_AD8 | `tK_AD8` | Text | 6 | Thời gian hủy bỏ tờ khai |  |  |  |  |
| TK_B32 | `tK_B32` | Date/Time | 8 | Ngày chuyển sang tờ khai thủ công nhập khẩu |  |  |  |  |
| TK_AD9 | `tK_AD9` | Text | 6 | Thời gian chuyển sang tờ khai thủ công nhập khẩu |  |  |  |  |
| TK_B34 | `tK_B34` | Date/Time | 8 | Ngày đăng ký dữ liệu |  |  |  |  |
| TK_ADA | `tK_ADA` | Text | 6 | Thời gian đăng ký dữ liệu |  |  |  |  |
| TK_B35 | `tK_B35` | Text | 5 | Người đang ký |  |  |  |  |
</details>


### Tờ khai xuất khẩu (EDA…IEX)

#### EDA – Khai tạm tờ khai xuất khẩu

- **Endpoint**: `POST {{FPT_BASE_URL}}/api/EDA` · xác thực: Bearer token (từ /api/auth/login)
- **Mục đích**: Gửi thông tin tờ khai xuất (chung, container, hàng). Hải quan cấp số tờ khai tK_ECN, tự tính các trường (tK_K01, tK_K08…); trạng thái khai tạm.
- **Khi nào gọi**: Lần khai đầu; hoặc sau EDB để gửi bản đã sửa.
- **Bước tiếp theo**: EDB, EDC
- **Phản hồi**: envelope, dữ liệu ở `objEDA`
- **Mã thông điệp**: `VAE0LA0` Khai Báo Tờ Khai Xuất Khẩu (C)

<details><summary>Body mẫu (Postman, đã che mật khẩu, cắt base64) – đầy đủ: samples/EDA.request.json</summary>

```json
{
  "objVNACCS_ACCOUNT": {
    "useR_ID": "***",
    "password": "***",
    "terminaL_ID": "***",
    "terminaL_ACCESS_KEY": "***"
  },
  "objVN_EDA": {
    "tK_ID": "TFECUSTEST01",
    "tK_ECN": null,
    "tK_FIC": "",
    "tK_BNO": "",
    "tK_DNO": "",
    "tK_TDN": null,
    "tK_ECB": "B11",
    "tK_CCC": "B",
    "tK_CH": "60CB",
    "tK_MTC": "3",
    "tK_ECD": "08/01/2025",
    "tK_CHB": "00",
    "tK_RID": "",
    "tK_EPC": "4100811111001",
    "tK_EPN": "Thúy Ngọc Electronics Export Corp",
    "tK_EPP": "(+84)",
    "tK_EPA": "123 NAM KỲ KHỞI NGHĨA QUẬN 1 TPHCM",
    "tK_EPT": "0909113113",
    "tK_EXC": "",
    "tK_EXN": "",
    "tK_CGC": "",
    "tK_ECC": "",
    "tK_CGN": "O.D.S COMPANY.,LTD",
    "tK_CGP": "(+856)",
    "tK_CGA": "2 FLOOR, 44, JANGHAN-RO,",
    "tK_CAT": "DONGDAEMOON-GU,",
    "tK_CAC": "SEOUL,",
    "tK_CAS": "SOUTH KOREA",
    "tK_CGK": "KR",
    "tK_EKN": "BL232322442223",
    "tK_NO": "23",
    "tK_NOT": "PK",
    "tK_GW": 600,
    "tK_GWT": "KGM",
    "tK_ST": "27PCC81",
    "tK_DSC": "KRINC",
    "tK_DSN": "INCHEON",
    "tK_PSC": "GEE",
    "tK_PSN": "GREEN PORT (HP)",
    "tK_VSC": "9999",
    "tK_VSN": "PEGASUS PETA 0021N",
    "tK_SYM": "08/01/2025",
    "tK_MRK": "Filter fabric is a specialty fabric that is recognized for its durability and usefulness Its resistant to both heat and chemicals 33333333",
    "tK_SS1": "AG01",
    "tK_SN1": "39922GF1234412GH2234",
    "tK_SS2": "AG02",
    "tK_SN2": "39922GF1234412GH2234",
    "tK_SS3": "ZX03",
    "tK_SN3": "39922GF1234412GH2234",
    "tK_SS4": "BD02",
    "tK_SN4": "39922GF1234412GH2234",
    "tK_SS5": "ZY03",
    "tK_SN5": "39922GF1234412GH2234",
    "tK_IV1": "A",
    "tK_IV3": "DW150609/XT",
    "tK_IV2": null,
    "tK_IVD": "03/10/2024",
    "tK_BRC": null,
    "tK_IVP": "KHONGTT",
    "tK_BYA": null,
    "tK_IP2": "FOB",
    "tK_BCM": "",
    "tK_IP3": "USD",
    "tK_BCN": "",
    "tK_IP4": 5543.17,
    "tK_IP1": "B",
    "tK_SBC": null,
    "tK_FCD": "USD",
    "tK_RYA": null,
    "tK_FKK": "5543.17",
    "tK_SCM": "",
    "tK_SCN": "",
    "tK_TP": null,
    "tK_CNV": "",
    "tK_TPM": "2",
    "tK_ENC": "D",
    "tK_EA1": "",
    "tK_EB1": null,
    "tK_EA2": "",
    "tK_EB2": null,
    "tK_EA3": "",
    "tK_EB3": null,
    "tK_NT2": "NPL xuat tra tu TKNK:100260186460 ngay 05/01/2015",
    "tK_REF": "",
    "tK_DPD": "08/01/2025",
    "tK_ST1": "03CEC03",
    "tK_AD1": "08/01/2025",
    "tK_SD1": "08/01/2025",
    "tK_ST2": "03CCC01",
    "tK_AD2": "08/01/2025",
    "tK_SD2": "08/01/2025",
    "tK_ST3": "03CCC02",
    "tK_AD3": "08/01/2025",
    "tK_SD3": "08/01/2025",
    "tK_ARP": "03CCC03",
    "tK_ADT": "08/01/2025"
  },
  "objVN_EDA_CON": {
    "coN_VC1": "01ABA02",
    "coN_VC2": "01ABA03",
    "coN_VC3": "01ABA04",
    "coN_VC4": "01ABC01",
    "coN_VC5": "01ABC02",
    "coN_VN": "CTY CP DVHH NOI BAI",
    "coN_VA": "Cung điện Cửu Công Chúa, Thị trấn Trạm Trôi, Hoài Đức, Hà Nội",
    "coN_C01": "CMAU1234452",
    "coN_C02": "CMAU1234453",
    "coN_C03": "",
    "coN_C04": "",
    "coN_C05": "",
    "coN_C06": "",
    "coN_C07": "",
    "coN_C08": "",
    "coN_C09": "",
    "coN_C10": "",
    "coN_C11": "",
    "coN_C12": "",
    "coN_C13": "",
    "coN_C14": "",
    "coN_C15": "",
    "coN_C16": "",
    "coN_C17": "",
    "coN_C18": "",
    "coN_C19": "",
    "coN_C20": "",
    "coN_C21": "",
    "coN_C22": "",
    "coN_C23": "",
    "coN_C24": "",
    "coN_C25": "",
    "coN_C26": "",
    "coN_C27": "",
    "coN_C28": "",
    "coN_C29": "",
    "coN_C30": "",
    "coN_C31": "",
    "coN_C32": "",
    "coN_C33": "",
    "coN_C34": "",
    "coN_C35": "",
    "coN_C36": "",
    "coN_C37": "",
    "coN_C38": "",
    "coN_C39": "",
    "coN_C40": "",
    "coN_C41": "",
    "coN_C42": "",
    "coN_C43": "",
    "coN_C44": "",
    "coN_C45": "",
    "coN_C46": "",
    "coN_C47": "",
    "coN_C48": "",
    "coN_C49": "",
    "coN_C50": ""
  },
  "objVN_EDA_CTHQ": {
    "cthQ_D01": "",
    "cthQ_T01": "",
    "cthQ_I01": "",
    "cthQ_D02": "",
    "cthQ_T02": "",
    "cthQ_I02": "",
    "cthQ_D03": "",
    "cthQ_T03": "",
    "cthQ_I03": "",
    "cthQ_D04": "",
    "cthQ_T04": "",
    "cthQ_I04": "",
    "cthQ_D05": "",
    "cthQ_T05": "",
    "cthQ_I05": "",
    "cthQ_D06": "",
    "cthQ_T06": "",
    "cthQ_I06": "",
    "cthQ_D07": "",
    "cthQ_T07": "",
    "cthQ_I07": "",
    "cthQ_D08": "",
    "cthQ_T08": "",
    "cthQ_I08": "",
    "cthQ_D09": "",
    "cthQ_T09": "",
    "cthQ_I09": "",
    "cthQ_D10": "",
    "cthQ_T10": "",
    "cthQ_I10": ""
  },
  "objVN_EDA_HANG": [
    {
      "haG_CMD": "55121900",
      "haG_COC": "MH123000",
      "haG_CMN": "Vải 100% Polyester#&KR",
      "haG_QN1": 2,
      "haG_QT1": "PCE",
      "haG_QN2": 2,
      "haG_QT2": "PCE",
      "haG_BPR": null,
      "haG_UPR": null,
      "haG_UPC": "",
      "haG_TSC": "",
      "haG_BPC": "USD",
      "haG_REG": null,
      "haG_TDL": null,
      "haG_TXR": null,
      "haG_OL1": "AD",
      "haG_OL2": "WF",
      "haG_OL3": "AS",
      "haG_OL4": "BW",
      "haG_OL5": "UR",
      "haG_RE": "XNK10",
      "haG_TXD": "",
      "haG_DPR": 200.2,
      "haG_TXN": null,
      "haG_TXC": "",
      "haG_TXA": null,
      "haG_TXB": null
    }
  ]
}
```
</details>

<details><summary>Phản hồi thật</summary>

```json
{
  "objVNACCS_ACCOUNT": {
    "useR_ID": "***",
    "password": "***",
    "terminaL_ID": "***",
    "terminaL_ACCESS_KEY": "***"
  },
  "errorList": null,
  "objIDA": null,
  "objEDA": [
    {
      "objMsgResult": {
        "function": "EDA",
        "code": "VAE0LA0",
        "name": "Khai Báo Tờ Khai Xuất Khẩu",
        "decNumber": "309062686130",
        "time": "14/10/2026 22:01:21",
        "type": "C",
        "ediBase64": null
      },
      "objVN_EDA": {
        "isView": false,
        "tK_ID": "111",
        "hD_ID": null,
        "tK_ECN": 309062686130,
        "tK_JKN": null,
        "tK_FIC": null,
        "tK_BNO": null,
        "tK_DNO": null,
        "tK_TDN": null,
        "tK_K07": null,
        "tK_ECB": "B11",
        "tK_CCC": null,
        "tK_CH": null,
        "tK_MTC": "3",
        "tK_K01": "5512",
        "tK_K08": "CCHQTN",
        "tK_ECD": null,
        "tK_CHB": "00",
        "tK_K10": null,
        "tK_RT1": null,
        "tK_AD21": null,
        "tK_AD31": null,
        "tK_RID": null,
        "tK_AAA": null,
        "tK_EPC": "0313833810",
        "tK_EPN": "CôNG TY TNHH DịCH Vụ TàI CHíNH CôNG",
        "tK_EPP": "(+84)",
        "tK_EPA": "123 NAM KỲ KHỞI NGHĨA QUẬN 1 TPHCM",
        "tK_EPT": "0909090909",
        "tK_EXC": null,
        "tK_EXN": null,
        "tK_CGC": null,
        "tK_ECC": null,
        "tK_CGN": "O.D.S COMPANY.,LTD",
        "tK_CGP": null,
        "tK_CGA": "2 FLOOR, 44, JANGHAN-RO,",
        "tK_CAT": "DONGDAEMOON-GU,",
        "tK_CAC": "SEOUL,",
        "tK_CAS": "SOUTH KOREA",
        "tK_CGK": "KR",
        "tK_K32": null,
        "tK_K33": null,
        "tK_K34": null,
        "tK_EKN": null,
        "tK_NO": "23",
        "tK_NOT": "PK",
        "tK_GW": 600,
        "tK_GWT": "KGM",
        "tK_ST": "27PCC81",
        "tK_K42": "CTY KIM GIANG",
        "tK_DSC": "KRINC",
        "tK_DSN": "INCHEON",
        "tK_PSC": "VNGEE",
        "tK_PSN": "GREEN PORT (HP)",
        "tK_VSC": "9999",
        "tK_VSN": "PEGASUS PETA 0021N",
        "tK_SYM": "14/10/2026",
        "tK_MRK": null,
        "tK_SS1": null,
        "tK_SN1": null,
        "tK_SS2": null,
        "tK_SN2": null,
        "tK_SS3": null,
        "tK_SN3": null,
        "tK_SS4": null,
        "tK_SN4": null,
        "tK_SS5": null,
        "tK_SN5": null,
        "tK_IV1": "A",
        "tK_IV3": "DW150609/XT",
        "tK_IV2": null,
        "tK_IVD": "14/10/2026",
        "tK_BRC": null,
        "tK_IVP": "KHONGTT",
        "tK_BYA": null,
        "tK_IP2": "FOB",
        "tK_BCM": null,
        "tK_IP3": "USD",
        "tK_BCN": null,
        "tK_IP4": 5543.17,
        "tK_IP1": "B",
        "tK_SBC": null,
        "tK_FCD": "USD",
        "tK_RYA": null,
        "tK_FKK": 5543.17,
        "tK_SCM": null,
        "tK_RC1": "USD",
        "tK_RD1": 25720,
        "tK_SCN": null,
        "tK_RC2": null,
        "tK_RD2": null,
        "tK_TP": 3109.09,
        "tK_K68": null,
        "tK_CNV": null,
        "tK_TPM": null,
        "tK_ENC": null,
        "tK_PAY": "A",
        "tK_ETA": null,
        "tK_AD7": null,
        "tK_TCO": null,
        "tK_SAM": null,
        "tK_AD8": null,
        "tK_K69": "3",
        "tK_K70": "1",
        "tK_EA1": null,
        "tK_EB1": null,
        "tK_EA2": null,
        "tK_EB2": null,
        "tK_EA3": null,
        "tK_EB3": null,
        "tK_NT2": "NPL xuat tra tu TKNK:100260186460 ngay 05/01/2015",
        "tK_REF": null,
        "tK_K82": null,
        "tK_DPD": "14/10/2026",
        "tK_ST1": null,
        "tK_AD1": null,
        "tK_SD1": null,
        "tK_ST2": null,
        "tK_AD2": null,
        "tK_SD2": null,
        "tK_ST3": null,
        "tK_AD3": null,
        "tK_SD3": null,
        "tK_ARP": "03CEC03",
        "tK_ADT": "14/10/2026",
        "tK_NGAYTX": null,
        "tK_NGAYHT": null,
        "tK_LOAIHINHTK": null,
        "malhV4": null,
        "hD_SO": null,
        "branchCode": null,
        "shptJobNo": null,
        "shptJobDate": null,
        "shptMsgType": null,
        "tK_NOIBO_SOHD": null,
        "tK_NOIBO_NGAYKY": null,
        "tK_NOIBO_NGAYHH": null,
        "dataManagement": 1,
        "dataStatus": 1,
        "stopChangeEvent": false
      },
      "objVN_EDA_CON": {
        "isView": false,
        "coN_ID": null,
        "tK_ID": null,
        "coN_VC1": null,
        "coN_VC2": null,
        "coN_VC3": null,
        "coN_VC4": null,
        "coN_VC5": null,
        "coN_VN": null,
        "coN_VA": null,
        "coN_C01": null,
        "coN_C02": null,
        "coN_C03": null,
        "coN_C04": null,
        "coN_C05": null,
        "coN_C06": null,
        "coN_C07": null,
        "coN_C08": null,
        "coN_C09": null,
        "coN_C10": null,
        "coN_C11": null,
        "coN_C12": null,
        "coN_C13": null,
        "coN_C14": null,
        "coN_C15": null,
        "coN_C16": null,
        "coN_C17": null,
        "coN_C18": null,
        "coN_C19": null,
        "coN_C20": null,
        "coN_C21": null,
        "coN_C22": null,
        "coN_C23": null,
        "coN_C24": null,
        "coN_C25": null,
        "coN_C26": null,
        "coN_C27": null,
        "coN_C28": null,
        "coN_C29": null,
        "coN_C30": null,
        "coN_C31": null,
        "coN_C32": null,
        "coN_C33": null,
        "coN_C34": null,
        "coN_C35": null,
        "coN_C36": null,
        "coN_C37": null,
        "coN_C38": null,
        "coN_C39": null,
        "coN_C40": null,
        "coN_C41": null,
        "coN_C42": null,
        "coN_C43": null,
        "coN_C44": null,
        "coN_C45": null,
        "coN_C46": null,
        "coN_C47": null,
        "coN_C48": null,
        "coN_C49": null,
        "coN_C50": null,
        "dataManagement": 1,
        "dataStatus": 1,
        "stopChangeEvent": false
      },
      "objVN_EDA_TRANGTHAI": {
        "isView": false,
        "tK_ID": null,
        "tK_AD4": null,
        "tK_K86": null,
        "tK_AD5": null,
```
</details>


<details><summary>Trường – objVN_EDA (130 trường · VNACCS_EDA v1.2.xlsx / VN_EDA)</summary>

| Chỉ tiêu | Key JSON | Kiểu | Độ dài | Mô tả | Bắt buộc | Req | Res | Ghi chú |
|---|---|---|---|---|---|---|---|---|
| TK_ID | `tK_ID` | Long Integer |  | Tờ khai ID |  |  |  |  |
| TK_ECN | `tK_ECN` | Decimal | 12 | Số tờ khai |  |  |  |  |
| TK_JKN | `tK_JKN` | Text | 1 | Phân loại xuất báo cáo sửa đổi |  |  |  |  |
| TK_FIC | `tK_FIC` | Text | 12 | Số tờ khai đầu tiên |  |  |  |  |
| TK_BNO | `tK_BNO` | Long Integer |  | Số nhánh của tờ khai chia nhỏ |  |  |  |  |
| TK_DNO | `tK_DNO` | Long Integer |  | Tổng số tờ khai chia nhỏ |  |  |  |  |
| TK_TDN | `tK_TDN` | Decimal | 12 | Số tờ khai tạm nhập tái xuất tương ứng |  |  |  |  |
| TK_K07 | `tK_K07` | Text | 3 | Mã phân loại kiểm tra |  |  |  |  |
| TK_ECB | `tK_ECB` | Text | 5 | Mã loại hình | ✓ |  |  |  |
| TK_CCC | `tK_CCC` | Text | 1 | Mã phân loại hàng hóa |  |  |  |  |
| TK_CH | `tK_CH` | Text | 6 | Cơ quan Hải quan | ✓ |  |  |  |
| TK_MTC | `tK_MTC` | Text | 1 | Mã hiệu phương thức vận chuyển | ✓ |  |  |  |
| TK_K01 | `tK_K01` | Text | 4 | Mã số thuế đại diện |  |  |  |  |
| TK_K08 | `tK_K08` | Text | 10 | Tên cơ quan Hải quan |  |  |  |  |
| TK_ECD | `tK_ECD` | Date/Time | 8 | Ngày khai báo (Dự kiến) |  |  |  |  |
| TK_CHB | `tK_CHB` | Text | 2 | Nhóm xử lý hồ sơ | ✓ |  |  |  |
| TK_K10 | `tK_K10` | Date/Time | 8 | Ngày đăng ký |  |  |  |  |
| TK_RT1 | `tK_RT1` | Text | 6 | Giờ đăng ký |  |  |  |  |
| TK_AD21 | `tK_AD21` | Date/Time | 8 | Ngày thay đổi đăng ký |  |  |  |  |
| TK_AD31 | `tK_AD31` | Text | 6 | Giờ thay đổi đăng ký |  |  |  |  |
| TK_RID | `tK_RID` | Date/Time | 8 | Thời hạn tái nhập khẩu |  |  |  |  |
| TK_AAA | `tK_AAA` | Text | 1 | Biểu thị trường hợp hết hạn |  |  |  |  |
| TK_EPC | `tK_EPC` | Text | 13 | Mã người xuất khẩu | ✓ |  |  |  |
| TK_EPN | `tK_EPN` | Text | 100 | Tên người xuất khẩu | ✓ |  |  |  |
| TK_EPP | `tK_EPP` | Text | 7 | Mã bưu chính |  |  |  |  |
| TK_EPA | `tK_EPA` | Memo | - | Địa chỉ người xuất khẩu |  |  |  |  |
| TK_EPT | `tK_EPT` | Text | 20 | Số điện thoại người xuất khẩu | ✓ |  |  |  |
| TK_EXC | `tK_EXC` | Text | 13 | Mã người ủy thác xuất khẩu |  |  |  |  |
| TK_EXN | `tK_EXN` | Memo | - | Tên người ủy thác xuất khẩu |  |  |  |  |
| TK_CGC | `tK_CGC` | Text | 13 | Mã người nhập khẩu |  |  |  |  |
| TK_ECC | `tK_ECC` | Text | 5 | Mã đại lý Hải quan |  |  |  |  |
| TK_CGN | `tK_CGN` | Text | 70 | Tên người nhập khẩu | ✓ |  |  |  |
| TK_CGP | `tK_CGP` | Text | 9 | Mã bưu chính |  |  |  |  |
| TK_CGA | `tK_CGA` | Text | 35 | Địa chỉ 1(Street and number/P.O.BOX) | ✓ |  |  |  |
| TK_CAT | `tK_CAT` | Text | 35 | Địa chỉ 2(Street and number/P.O.BOX) |  |  |  |  |
| TK_CAC | `tK_CAC` | Text | 35 | Địa chỉ 3(City name) |  |  |  |  |
| TK_CAS | `tK_CAS` | Text | 35 | Địa chỉ 4(Country sub-entity, name) |  |  |  |  |
| TK_CGK | `tK_CGK` | Text | 2 | Mã nước(Country, coded) |  |  |  |  |
| TK_K32 | `tK_K32` | Text | 5 | Mã đại lý Hải quan |  |  |  |  |
| TK_K33 | `tK_K33` | Text | 50 | Tên đại lý Hải quan |  |  |  |  |
| TK_K34 | `tK_K34` | Text | 5 | Mã nhân viên Hải quan |  |  |  |  |
| TK_EKN | `tK_EKN` | Text | 35 | Số vận đơn (Số B/L, số AWB v.v. …) |  |  |  |  |
| TK_NO | `tK_NO` | Long Integer |  | Số kiện | ✓ |  |  |  |
| TK_NOT | `tK_NOT` | Text | 3 | Mã đơn vị tính | ✓ |  |  |  |
| TK_GW | `tK_GW` | Decimal | 28.3 | Tổng trọng lượng hàng (Gross) | ✓ |  |  |  |
| TK_GWT | `tK_GWT` | Text | 6 | Mã đơn vị tính trọng lượng (Gross) | ✓ |  |  |  |
| TK_ST | `tK_ST` | Text | 7 | Mã địa điểm lưu kho hàng chờ thông quan dự kiến |  |  |  |  |
| TK_K42 | `tK_K42` | Text | 20 | Tên địa điểm lưu kho hàng chờ thông quan dự kiến |  |  |  |  |
| TK_DSC | `tK_DSC` | Text | 6 | Mã địa điểm nhận hàng cuối cùng | ✓ |  |  |  |
| TK_DSN | `tK_DSN` | Text | 255 | Tên địa điểm nhận hàng cuối cùng | ✓ |  |  |  |
| TK_PSC | `tK_PSC` | Text | 6 | Mã địa điểm xếp hàng | ✓ |  |  |  |
| TK_PSN | `tK_PSN` | Text | 255 | Tên địa điểm xếp hàng | ✓ |  |  |  |
| TK_VSC | `tK_VSC` | Text | 9 | Mã phương tiện vận chuyển dự kiến |  |  |  |  |
| TK_VSN | `tK_VSN` | Text | 255 | Tên phương tiện vận chuyển dự kiến | ✓ |  |  |  |
| TK_SYM | `tK_SYM` | Date/Time | 8 | Ngày hàng đi dự kiến | ✓ |  |  |  |
| TK_MRK | `tK_MRK` | Text | 140 | Ký hiệu và số hiệu |  |  |  |  |
| TK_SS1 | `tK_SS1` | Text | 4 | Phân loại giấy phép xuất khẩu |  |  |  |  |
| TK_SN1 | `tK_SN1` | Text | 20 | Số của giấy phép |  |  |  |  |
| TK_SS2 | `tK_SS2` | Text | 4 | Phân loại giấy phép xuất khẩu |  |  |  |  |
| TK_SN2 | `tK_SN2` | Text | 20 | Số của giấy phép |  |  |  |  |
| TK_SS3 | `tK_SS3` | Text | 4 | Phân loại giấy phép xuất khẩu |  |  |  |  |
| TK_SN3 | `tK_SN3` | Text | 20 | Số của giấy phép |  |  |  |  |
| TK_SS4 | `tK_SS4` | Text | 4 | Phân loại giấy phép xuất khẩu |  |  |  |  |
| TK_SN4 | `tK_SN4` | Text | 20 | Số của giấy phép |  |  |  |  |
| TK_SS5 | `tK_SS5` | Text | 4 | Phân loại giấy phép xuất khẩu |  |  |  |  |
| TK_SN5 | `tK_SN5` | Text | 20 | Số của giấy phép |  |  |  |  |
| TK_IV1 | `tK_IV1` | Text | 1 | Phân loại hình thức hóa đơn | ✓ |  |  |  |
| TK_IV3 | `tK_IV3` | Text | 35 | Số hóa đơn |  |  |  |  |
| TK_IV2 | `tK_IV2` | Decimal | 12 | Số tiếp nhận hóa đơn điện tử |  |  |  |  |
| TK_IVD | `tK_IVD` | Date/Time | 8 | Ngày phát hành |  |  |  |  |
| TK_BRC | `tK_BRC` | Text | 11 | Mã ngân hàng trả thuế thay |  |  |  |  |
| TK_IVP | `tK_IVP` | Text | 7 | Phương thức thanh toán |  |  |  |  |
| TK_BYA | `tK_BYA` | Long Integer |  | Năm phát hành hạn mức |  |  |  |  |
| TK_IP2 | `tK_IP2` | Text | 3 | Mã điều kiện giá hóa đơn |  |  |  |  |
| TK_BCM | `tK_BCM` | Text | 10 | Kí hiệu chứng từ hạn mức |  |  |  |  |
| TK_IP3 | `tK_IP3` | Text | 3 | Mã đồng tiền của hóa đơn | ✓ |  |  |  |
| TK_BCN | `tK_BCN` | Text | 10 | Số chứng từ hạn mức |  |  |  |  |
| TK_IP4 | `tK_IP4` | Decimal | 20.4 | Tổng trị giá hóa đơn | ✓ |  |  |  |
| TK_IP1 | `tK_IP1` | Text | 1 | Mã phân loại giá hóa đơn |  |  |  |  |
| TK_SBC | `tK_SBC` | Text | 11 | Mã ngân hàng bảo lãnh |  |  |  |  |
| TK_FCD | `tK_FCD` | Text | 3 | Mã đồng tiền của tổng trị giá tính thuế | ✓ |  |  |  |
| TK_RYA | `tK_RYA` | Long Integer |  | Năm phát hành bảo lãnh |  |  |  |  |
| TK_FKK | `tK_FKK` | Decimal | 20.4 | Tổng trị giá tính thuế | ✓ |  |  |  |
| TK_SCM | `tK_SCM` | Text | 10 | Ký hiệu chứng từ bảo lãnh |  |  |  |  |
| TK_RC1 | `tK_RC1` | Text | 3 | Mã đồng tiền của tỷ giá tính thuế |  |  |  |  |
| TK_RD1 | `tK_RD1` | Decimal | 17.8 | Tỷ giá tính thuế |  |  |  |  |
| TK_SCN | `tK_SCN` | Text | 10 | Số chứng từ bảo lãnh |  |  |  |  |
| TK_RC2 | `tK_RC2` | Text | 3 | Mã đồng tiền của tỷ giá tính thuế |  |  |  |  |
| TK_RD2 | `tK_RD2` | Decimal | 17.8 | Tỷ giá tính thuế |  |  |  |  |
| TK_TP | `tK_TP` | Decimal | 28.4 | Tổng hệ số phân bổ trị giá tính thuế |  |  |  |  |
| TK_K68 | `tK_K68` | Text | 1 | Mã phân loại nhập liệu cho Tổng giá cơ bản |  |  |  |  |
| TK_CNV | `tK_CNV` | Text | 1 | Phân loại không cần quy đổi VND |  |  |  |  |
| TK_TPM | `tK_TPM` | Text | 1 | Người nộp thuế |  |  |  |  |
| TK_ENC | `tK_ENC` | Text | 1 | Mã xác định thời hạn nộp thuế |  |  |  |  |
| TK_PAY | `tK_PAY` | Text | 1 | Phân loại nộp thuế |  |  |  |  |
| TK_ETA | `tK_ETA` | Decimal | 19.8 | Tổng số tiền thuế xuất khẩu |  |  |  |  |
| TK_AD7 | `tK_AD7` | Text | 3 | Mã tiền tệ của tổng số tiền thuế xuất khẩu |  |  |  |  |
| TK_TCO | `tK_TCO` | Decimal | 11 | Tổng số tiền lệ phí |  |  |  |  |
| TK_SAM | `tK_SAM` | Decimal | 11 | Số tiền bảo lãnh |  |  |  |  |
| TK_AD8 | `tK_AD8` | Text | 3 | Mã tiền tệ của số tiền bảo lãnh |  |  |  |  |
| TK_K69 | `tK_K69` | Long Integer |  | Tổng số trang của tờ khai |  |  |  |  |
| TK_K70 | `tK_K70` | Long Integer |  | Tổng số dòng hàng của tờ khai |  |  |  |  |
| TK_EA1 | `tK_EA1` | Text | 3 | Phân loại đính kèm khai báo điện tử |  |  |  |  |
| TK_EB1 | `tK_EB1` | Decimal | 12 | Số đính kèm khai báo điện tử |  |  |  |  |
| TK_EA2 | `tK_EA2` | Text | 3 | Phân loại đính kèm khai báo điện tử |  |  |  |  |
| TK_EB2 | `tK_EB2` | Decimal | 12 | Số đính kèm khai báo điện tử |  |  |  |  |
| TK_EA3 | `tK_EA3` | Text | 3 | Phân loại đính kèm khai báo điện tử |  |  |  |  |
| TK_EB3 | `tK_EB3` | Decimal | 12 | Số đính kèm khai báo điện tử |  |  |  |  |
| TK_NT2 | `tK_NT2` | Memo | - | Phần ghi chú |  |  |  |  |
| TK_REF | `tK_REF` | Text | 20 | Số quản lý của nội bộ doanh nghiệp |  |  |  |  |
| TK_K82 | `tK_K82` | Text | 5 | Số quản lý người sử dụng |  |  |  |  |
| TK_DPD | `tK_DPD` | Date/Time | 8 | Ngày khởi hành vận chuyển |  |  |  |  |
| TK_ST1 | `tK_ST1` | Text | 7 | Địa điểm trung chuyển cho vận chuyển bảo thuế (khai báo gộp) |  |  |  |  |
| TK_AD1 | `tK_AD1` | Date/Time | 8 | Ngày dự kiến đến(Địa điểm trung chuyển) |  |  |  |  |
| TK_SD1 | `tK_SD1` | Date/Time | 8 | Ngày khởi hành vận chuyển(Địa điểm trung chuyển) |  |  |  |  |
| TK_ST2 | `tK_ST2` | Text | 7 | Địa điểm trung chuyển cho vận chuyển bảo thuế (khai báo gộp) |  |  |  |  |
| TK_AD2 | `tK_AD2` | Date/Time | 8 | Ngày dự kiến đến(Địa điểm trung chuyển) |  |  |  |  |
| TK_SD2 | `tK_SD2` | Date/Time | 8 | Ngày khởi hành vận chuyển(Địa điểm trung chuyển) |  |  |  |  |
| TK_ST3 | `tK_ST3` | Text | 7 | Địa điểm trung chuyển cho vận chuyển bảo thuế (khai báo gộp) |  |  |  |  |
| TK_AD3 | `tK_AD3` | Date/Time | 8 | Ngày dự kiến đến(Địa điểm trung chuyển) |  |  |  |  |
| TK_SD3 | `tK_SD3` | Date/Time | 8 | Ngày khởi hành vận chuyển(Địa điểm trung chuyển) |  |  |  |  |
| TK_ARP | `tK_ARP` | Text | 7 | Địa điểm đích cho vận chuyển bảo thuế (khai báo gộp) |  |  |  |  |
| TK_ADT | `tK_ADT` | Date/Time | 8 | Ngày dự kiến đến |  |  |  |  |
| TK_NGAYTX | `tK_NGAYTX` | Date/Time | 8 | Ngày thực xuất |  |  |  |  |
| TK_NGAYHT | `tK_NGAYHT` | Date/Time | 8 | Ngày hoàn thành |  |  |  |  |
| TK_LOAIHINHTK | `tK_LOAIHINHTK` | Double |  | Loại hình tờ khai: <br>1. Kinh doanh<br>2. Sản xuất xuất khẩu<br>3. Gia công<br>4. Chế xuất |  |  |  |  |
| MALHV4 | `malhV4` | Text | 255 | Mã loại hình V4 |  |  |  |  |
| HD_SO | `hD_SO` | Text | 255 | Số hợp đồng |  |  |  |  |
| HD_NGAY | `hD_NGAY` | Text | 255 | Ngày hợp đồng |  |  |  |  |
| HD_ID | `hD_ID` | Long Integer |  | Hợp đồng ID |  |  |  |  |
</details>


<details><summary>Trường – objVN_EDA_CON[] (59 trường · VNACCS_EDA v1.2.xlsx / VN_EDA_CON)</summary>

| Chỉ tiêu | Key JSON | Kiểu | Độ dài | Mô tả | Bắt buộc | Req | Res | Ghi chú |
|---|---|---|---|---|---|---|---|---|
| CON_ID | `coN_ID` | Long Integer |  | Container ID |  |  |  |  |
| TK_ID | `tK_ID` | Long Integer |  | Tờ khai ID |  |  |  | VN_EDA |
| CON_VC1 | `coN_VC1` | Text | 7 | Mã địa điểm xếp hàng lên xe chở hàng (Vanning) |  |  |  |  |
| CON_VC2 | `coN_VC2` | Text | 7 | Mã địa điểm xếp hàng lên xe chở hàng (Vanning) |  |  |  |  |
| CON_VC3 | `coN_VC3` | Text | 7 | Mã địa điểm xếp hàng lên xe chở hàng (Vanning) |  |  |  |  |
| CON_VC4 | `coN_VC4` | Text | 7 | Mã địa điểm xếp hàng lên xe chở hàng (Vanning) |  |  |  |  |
| CON_VC5 | `coN_VC5` | Text | 7 | Mã địa điểm xếp hàng lên xe chở hàng (Vanning) |  |  |  |  |
| CON_VN | `coN_VN` | Text | 70 | Tên địa điểm xếp hàng lên xe chở hàng (Vanning) |  |  |  |  |
| CON_VA | `coN_VA` | Memo | - | Địa chỉ địa điểm xếp hàng lên xe chở hàng (Vanning) |  |  |  |  |
| CON_C01 | `coN_C01` | Text | 12 | Số container |  |  |  |  |
| CON_C02 | `coN_C02` | Text | 12 | Số container |  |  |  |  |
| CON_C03 | `coN_C03` | Text | 12 | Số container |  |  |  |  |
| CON_C04 | `coN_C04` | Text | 12 | Số container |  |  |  |  |
| CON_C05 | `coN_C05` | Text | 12 | Số container |  |  |  |  |
| CON_C06 | `coN_C06` | Text | 12 | Số container |  |  |  |  |
| CON_C07 | `coN_C07` | Text | 12 | Số container |  |  |  |  |
| CON_C08 | `coN_C08` | Text | 12 | Số container |  |  |  |  |
| CON_C09 | `coN_C09` | Text | 12 | Số container |  |  |  |  |
| CON_C10 | `coN_C10` | Text | 12 | Số container |  |  |  |  |
| CON_C11 | `coN_C11` | Text | 12 | Số container |  |  |  |  |
| CON_C12 | `coN_C12` | Text | 12 | Số container |  |  |  |  |
| CON_C13 | `coN_C13` | Text | 12 | Số container |  |  |  |  |
| CON_C14 | `coN_C14` | Text | 12 | Số container |  |  |  |  |
| CON_C15 | `coN_C15` | Text | 12 | Số container |  |  |  |  |
| CON_C16 | `coN_C16` | Text | 12 | Số container |  |  |  |  |
| CON_C17 | `coN_C17` | Text | 12 | Số container |  |  |  |  |
| CON_C18 | `coN_C18` | Text | 12 | Số container |  |  |  |  |
| CON_C19 | `coN_C19` | Text | 12 | Số container |  |  |  |  |
| CON_C20 | `coN_C20` | Text | 12 | Số container |  |  |  |  |
| CON_C21 | `coN_C21` | Text | 12 | Số container |  |  |  |  |
| CON_C22 | `coN_C22` | Text | 12 | Số container |  |  |  |  |
| CON_C23 | `coN_C23` | Text | 12 | Số container |  |  |  |  |
| CON_C24 | `coN_C24` | Text | 12 | Số container |  |  |  |  |
| CON_C25 | `coN_C25` | Text | 12 | Số container |  |  |  |  |
| CON_C26 | `coN_C26` | Text | 12 | Số container |  |  |  |  |
| CON_C27 | `coN_C27` | Text | 12 | Số container |  |  |  |  |
| CON_C28 | `coN_C28` | Text | 12 | Số container |  |  |  |  |
| CON_C29 | `coN_C29` | Text | 12 | Số container |  |  |  |  |
| CON_C30 | `coN_C30` | Text | 12 | Số container |  |  |  |  |
| CON_C31 | `coN_C31` | Text | 12 | Số container |  |  |  |  |
| CON_C32 | `coN_C32` | Text | 12 | Số container |  |  |  |  |
| CON_C33 | `coN_C33` | Text | 12 | Số container |  |  |  |  |
| CON_C34 | `coN_C34` | Text | 12 | Số container |  |  |  |  |
| CON_C35 | `coN_C35` | Text | 12 | Số container |  |  |  |  |
| CON_C36 | `coN_C36` | Text | 12 | Số container |  |  |  |  |
| CON_C37 | `coN_C37` | Text | 12 | Số container |  |  |  |  |
| CON_C38 | `coN_C38` | Text | 12 | Số container |  |  |  |  |
| CON_C39 | `coN_C39` | Text | 12 | Số container |  |  |  |  |
| CON_C40 | `coN_C40` | Text | 12 | Số container |  |  |  |  |
| CON_C41 | `coN_C41` | Text | 12 | Số container |  |  |  |  |
| CON_C42 | `coN_C42` | Text | 12 | Số container |  |  |  |  |
| CON_C43 | `coN_C43` | Text | 12 | Số container |  |  |  |  |
| CON_C44 | `coN_C44` | Text | 12 | Số container |  |  |  |  |
| CON_C45 | `coN_C45` | Text | 12 | Số container |  |  |  |  |
| CON_C46 | `coN_C46` | Text | 12 | Số container |  |  |  |  |
| CON_C47 | `coN_C47` | Text | 12 | Số container |  |  |  |  |
| CON_C48 | `coN_C48` | Text | 12 | Số container |  |  |  |  |
| CON_C49 | `coN_C49` | Text | 12 | Số container |  |  |  |  |
| CON_C50 | `coN_C50` | Text | 12 | Số container |  |  |  |  |
</details>


<details><summary>Trường – objVN_EDA_HANG[] (56 trường · VNACCS_EDA v1.2.xlsx / VN_EDA_HANG)</summary>

| Chỉ tiêu | Key JSON | Kiểu | Độ dài | Mô tả | Bắt buộc | Req | Res | Ghi chú |
|---|---|---|---|---|---|---|---|---|
| HAG_ID | `haG_ID` | Long Integer |  | Hàng ID |  |  |  |  |
| TK_ID | `tK_ID` | Long Integer |  | Tờ khai ID |  |  |  |  |
| HAG_R01 | `haG_R01` | Text | 2 | Số dòng |  |  |  |  |
| HAG_CMD | `haG_CMD` | Text | 12 | Mã số hàng hóa | ✓ |  |  |  |
| HAG_COC | `haG_COC` | Text | 255 | Mã quản lý riêng |  |  |  |  |
| HAG_R03 | `haG_R03` | Text | 1 | Mã phân loại tái xác nhận giá |  |  |  |  |
| HAG_CMN | `haG_CMN` | TEXT | 200 | Mô tả hàng hóa | ✓ |  |  |  |
| HAG_QN1 | `haG_QN1` | Decimal | 20.8 | Số lượng (1) | ✓ |  |  |  |
| HAG_QT1 | `haG_QT1` | Text | 4 | Mã đơn vị tính (1) | ✓ |  |  |  |
| HAG_QN2 | `haG_QN2` | Decimal | 20.4 | Số lượng (2) | ✓ |  |  |  |
| HAG_QT2 | `haG_QT2` | Text | 4 | Mã đơn vị tính (2) | ✓ |  |  |  |
| HAG_BPR | `haG_BPR` | Decimal | 20.4 | Trị giá hóa đơn | ✓ |  |  |  |
| HAG_UPR | `haG_UPR` | Decimal | 20.8 | Đơn giá hóa đơn | ✓ |  |  |  |
| HAG_UPC | `haG_UPC` | Text | 3 | Mã đồng tiền của đơn giá hóa đơn | ✓ |  |  |  |
| HAG_TSC | `haG_TSC` | Text | 4 | Price quantity unit |  |  |  |  |
| HAG_R07 | `haG_R07` | Decimal | 25.4 | Trị giá tính thuế(S) |  |  |  |  |
| HAG_BPC | `haG_BPC` | Text | 3 | Mã đồng tiền của giá tính thuế(S) |  |  |  |  |
| HAG_R14 | `haG_R14` | Text | 3 | Mã đồng tiền của giá tính thuế(M) |  |  |  |  |
| HAG_R15 | `haG_R15` | Decimal | 28.4 | Trị giá tính thuế(M) |  |  |  |  |
| HAG_TSQ | `haG_TSQ` | Decimal | 20.4 | Số lượng tính thuế |  |  |  |  |
| HAG_TSU | `haG_TSU` | Text | 4 | Mã đơn vị tính chuẩn để đánh thuế xuất khẩu |  |  |  |  |
| HAG_CVU | `haG_CVU` | Decimal | 26.4 | Đơn giá tính thuế |  |  |  |  |
| HAG_ADA | `haG_ADA` | Text | 3 | Mã tiền tệ của đơn giá tính thuế |  |  |  |  |
| HAG_QCV | `haG_QCV` | Text | 4 | Đơn vị số lượng trong đơn giá tính thuế |  |  |  |  |
| HAG_TRA | `haG_TRA` | Text | 30 | Thuế suất thuế xuất khẩu |  |  |  |  |
| HAG_TRM | `haG_TRM` | Text | 1 | Phân loại nhập thuế suất thuế xuất khẩu |  |  |  |  |
| HAG_TAX | `haG_TAX` | Decimal | 24.4 | Số tiền thuế xuất khẩu |  |  |  |  |
| HAG_ADB | `haG_ADB` | Text | 3 | Mã tiền tệ của số tiền thuế xuất khẩu |  |  |  |  |
| HAG_REG | `haG_REG` | Decimal | 16 | Số tiền giảm thuế xuất khẩu |  |  |  |  |
| HAG_ADC | `haG_ADC` | Text | 3 | Mã tiền tệ của số tiền giảm thuế xuất khẩu |  |  |  |  |
| HAG_TDL | `haG_TDL` | Text | 2 | Số thứ tự của dòng hàng trên tờ khai tạm nhập tái xuất tương ứng |  |  |  |  |
| HAG_TXR | `haG_TXR` | Decimal | 12 | Danh mục miễn thuế xuất khẩu |  |  |  |  |
| HAG_ADE | `haG_ADE` | Text | 3 | Số dòng tương ứng trong danh mục miễn thuế |  |  |  |  |
| HAG_CUP | `haG_CUP` | Text | 21 | Tiền lệ phí (Đơn giá) |  |  |  |  |
| HAG_IUP | `haG_IUP` | Text | 21 | Tiền bảo hiểm (Đơn giá) |  |  |  |  |
| HAG_CQU | `haG_CQU` | Decimal | 20.4 | Tiền lệ phí (Số lượng) |  |  |  |  |
| HAG_CQC | `haG_CQC` | Text | 4 | Tiền lệ phí (Mã đơn vị số lượng) |  |  |  |  |
| HAG_IQU | `haG_IQU` | Decimal | 20.4 | Tiền bảo hiểm (Số lượng) |  |  |  |  |
| HAG_IQC | `haG_IQC` | Text | 4 | Tiền bảo hiểm (Mã đơn vị số lượng) |  |  |  |  |
| HAG_CPR | `haG_CPR` | Decimal | 24.4 | Tiền lệ phí (Khoản tiền) |  |  |  |  |
| HAG_IPR | `haG_IPR` | Decimal | 24.4 | Tiền bảo hiểm (Khoản tiền) |  |  |  |  |
| HAG_OL1 | `haG_OL1` | Text | 2 | Mã văn bản pháp quy khác |  |  |  |  |
| HAG_OL2 | `haG_OL2` | Text | 2 | Mã văn bản pháp quy khác |  |  |  |  |
| HAG_OL3 | `haG_OL3` | Text | 2 | Mã văn bản pháp quy khác |  |  |  |  |
| HAG_OL4 | `haG_OL4` | Text | 2 | Mã văn bản pháp quy khác |  |  |  |  |
| HAG_OL5 | `haG_OL5` | Text | 2 | Mã văn bản pháp quy khác |  |  |  |  |
| HAG_RE | `haG_RE` | Text | 5 | Mã miễn / Giảm / Không chịu thuế xuất khẩu |  |  |  |  |
| HAG_TXD | `haG_TXD` | Text | 3 | Mã đồng tiền của mức thuế tuyệt đối |  |  |  |  |
| HAG_DPR | `haG_DPR` | Decimal | 28.4 | Trị giá tính thuế |  |  |  |  |
| HAG_TXN | `haG_TXN` | Text | 12 | Danh mục miễn thuế xuất khẩu |  |  |  |  |
| HAG_TXC | `haG_TXC` | Text | 4 | Mã đơn vị tính thuế tuyệt đối |  |  |  |  |
| HAG_TRL | `haG_TRL` | Text | 60 | Điều khoản miễn / Giảm / Không chịu thuế xuất khẩu  (Pháp luật) |  |  |  |  |
| HAG_TXA | `haG_TXA` | Decimal | 18.4 | Thuế suất |  |  |  |  |
| HAG_TXB | `haG_TXB` | Decimal | 18.4 | Mức thuế tuyệt đối |  |  |  |  |
| HAG_MAHANG | `haG_MAHANG` | Text | 255 | Mã hàng |  |  |  |  |
| HAG_XX | `haG_XX` | Text | 5 |  | ✓ |  |  |  |
</details>


<details><summary>Trường – objVN_EDA_CTHQ[] (chỉ phản hồi) (33 trường · VNACCS_EDA v1.2.xlsx / VN_EDA_CTHQ)</summary>

| Chỉ tiêu | Key JSON | Kiểu | Độ dài | Mô tả | Bắt buộc | Req | Res | Ghi chú |
|---|---|---|---|---|---|---|---|---|
| CTHQ_ID | `cthQ_ID` | Long Integer |  | Chỉ thị HQ ID |  |  |  |  |
| TK_ID | `tK_ID` | Long Integer |  | Tờ khai ID |  |  |  | VN_EDA |
| CTHQ_CCM | `cthQ_CCM` | Text | 1 | Phân loại chỉ thị của Hải quan |  |  |  |  |
| CTHQ_D01 | `cthQ_D01` | Date/Time | 8 | Ngày chỉ thị của Hải quan |  |  |  |  |
| CTHQ_T01 | `cthQ_T01` | Text | 120 | Tên chỉ thị của Hải quan |  |  |  |  |
| CTHQ_I01 | `cthQ_I01` | Memo | - | Nội dung chỉ thị của Hải quan |  |  |  |  |
| CTHQ_D02 | `cthQ_D02` | Date/Time | 8 | Ngày chỉ thị của Hải quan |  |  |  |  |
| CTHQ_T02 | `cthQ_T02` | Text | 120 | Tên chỉ thị của Hải quan |  |  |  |  |
| CTHQ_I02 | `cthQ_I02` | Memo | - | Nội dung chỉ thị của Hải quan |  |  |  |  |
| CTHQ_D03 | `cthQ_D03` | Date/Time | 8 | Ngày chỉ thị của Hải quan |  |  |  |  |
| CTHQ_T03 | `cthQ_T03` | Text | 120 | Tên chỉ thị của Hải quan |  |  |  |  |
| CTHQ_I03 | `cthQ_I03` | Memo | - | Nội dung chỉ thị của Hải quan |  |  |  |  |
| CTHQ_D04 | `cthQ_D04` | Date/Time | 8 | Ngày chỉ thị của Hải quan |  |  |  |  |
| CTHQ_T04 | `cthQ_T04` | Text | 120 | Tên chỉ thị của Hải quan |  |  |  |  |
| CTHQ_I04 | `cthQ_I04` | Memo | - | Nội dung chỉ thị của Hải quan |  |  |  |  |
| CTHQ_D05 | `cthQ_D05` | Date/Time | 8 | Ngày chỉ thị của Hải quan |  |  |  |  |
| CTHQ_T05 | `cthQ_T05` | Text | 120 | Tên chỉ thị của Hải quan |  |  |  |  |
| CTHQ_I05 | `cthQ_I05` | Memo | - | Nội dung chỉ thị của Hải quan |  |  |  |  |
| CTHQ_D06 | `cthQ_D06` | Date/Time | 8 | Ngày chỉ thị của Hải quan |  |  |  |  |
| CTHQ_T06 | `cthQ_T06` | Text | 120 | Tên chỉ thị của Hải quan |  |  |  |  |
| CTHQ_I06 | `cthQ_I06` | Memo | - | Nội dung chỉ thị của Hải quan |  |  |  |  |
| CTHQ_D07 | `cthQ_D07` | Date/Time | 8 | Ngày chỉ thị của Hải quan |  |  |  |  |
| CTHQ_T07 | `cthQ_T07` | Text | 120 | Tên chỉ thị của Hải quan |  |  |  |  |
| CTHQ_I07 | `cthQ_I07` | Memo | - | Nội dung chỉ thị của Hải quan |  |  |  |  |
| CTHQ_D08 | `cthQ_D08` | Date/Time | 8 | Ngày chỉ thị của Hải quan |  |  |  |  |
| CTHQ_T08 | `cthQ_T08` | Text | 120 | Tên chỉ thị của Hải quan |  |  |  |  |
| CTHQ_I08 | `cthQ_I08` | Memo | - | Nội dung chỉ thị của Hải quan |  |  |  |  |
| CTHQ_D09 | `cthQ_D09` | Date/Time | 8 | Ngày chỉ thị của Hải quan |  |  |  |  |
| CTHQ_T09 | `cthQ_T09` | Text | 120 | Tên chỉ thị của Hải quan |  |  |  |  |
| CTHQ_I09 | `cthQ_I09` | Memo | - | Nội dung chỉ thị của Hải quan |  |  |  |  |
| CTHQ_D10 | `cthQ_D10` | Date/Time | 8 | Ngày chỉ thị của Hải quan |  |  |  |  |
| CTHQ_T10 | `cthQ_T10` | Text | 120 | Tên chỉ thị của Hải quan |  |  |  |  |
| CTHQ_I10 | `cthQ_I10` | Memo | - | Nội dung chỉ thị của Hải quan |  |  |  |  |
</details>


<details><summary>Trường – objVN_EDA_TRANGTHAI (chỉ phản hồi) (9 trường · VNACCS_EDA v1.2.xlsx / VN_EDA_TRANGTHAI)</summary>

| Chỉ tiêu | Key JSON | Kiểu | Độ dài | Mô tả | Bắt buộc | Req | Res | Ghi chú |
|---|---|---|---|---|---|---|---|---|
| TK_ID | `tK_ID` | Long Integer |  | Tờ khai ID |  |  |  |  |
| TK_AD4 | `tK_AD4` | Text | 255 | Giờ hoàn thành kiểm tra |  |  |  |  |
| TK_K86 | `tK_K86` | Date/Time | 8 | Ngày cấp phép |  |  |  |  |
| TK_AD5 | `tK_AD5` | Text | 255 | Giờ cấp phép |  |  |  |  |
| TK_K87 | `tK_K87` | Text | 255 | Tên trưởng đơn vị Hải quan |  |  |  |  |
| TK_CCD | `tK_CCD` | Date/Time | 8 | Ngày hoàn thành kiểm tra |  |  |  |  |
| TK_LUONG | `tK_LUONG` | Long Integer |  | Luồng ID |  |  |  |  |
| TK_TRANGTHAI | `tK_TRANGTHAI` | Text | 255 | Trạng Thái ID |  |  |  |  |
| TK_THONGQUAN | `tK_THONGQUAN` | Long Integer |  | Thông quan ID |  |  |  |  |
</details>


#### EDB – Gọi tờ khai xuất đã khai tạm để sửa

- **Endpoint**: `POST {{FPT_BASE_URL}}/api/EDB` · xác thực: Bearer token (từ /api/auth/login)
- **Mục đích**: Lấy lại tờ khai đã EDA (chưa EDC) để sửa rồi gửi EDA lại. REP_VNACCS: VAE4000 "Khai báo trước thông tin xuất khẩu".
- **Khi nào gọi**: Sau EDA, trước EDC.
- **Bước tiếp theo**: EDA
- **Body**: Tài khoản VNACCS + `tK_ECN`.
- **Phản hồi**: envelope, dữ liệu ở `objEDA`
- **Mã thông điệp**: `VAE4000` Khai Báo Trước Thông Tin Xuất Khẩu (C)

<details><summary>Body mẫu (Postman, đã che mật khẩu, cắt base64) – đầy đủ: samples/EDB.request.json</summary>

```json
{
  "objVNACCS_ACCOUNT": {
    "useR_ID": "***",
    "password": "***",
    "terminaL_ID": "***",
    "terminaL_ACCESS_KEY": "***"
  },
  "tK_ECN": 306989502100
}
```
</details>


#### EDC – Khai chính thức tờ khai xuất (đăng ký)

- **Endpoint**: `POST {{FPT_BASE_URL}}/api/EDC` · xác thực: Bearer token (từ /api/auth/login)
- **Mục đích**: Đăng ký tờ khai xuất; Hải quan phân luồng (VAE1LD0/VAE2LD0/VAE3LD0 = luồng 1/2/3), thông quan (VAE1LF0/VAE2LF0).
- **Khi nào gọi**: Sau EDA.
- **Bước tiếp theo**: VNACCSREP, IEX, EDD
- **Phản hồi**: envelope, dữ liệu ở `objEDA`
- **Mã thông điệp**: `VAE1LD0` Tờ khai hàng hóa xuất khẩu (thông báo kết quả phân luồng) (P); `VAE2LD0` Tờ khai hàng hóa xuất khẩu (thông báo kết quả phân luồng) (P); `VAE3LD0` Tờ khai hàng hóa xuất khẩu (thông báo kết quả phân luồng) (P); `VAE1RD0` Tờ khai hàng hóa xuất kho ngoại quan (thông báo kết quả phân luồng) (P); `VAE2RD0` Tờ khai hàng hóa xuất kho ngoại quan (thông báo kết quả phân luồng) (P); `VAE3RD0` Tờ khai hàng hóa xuất kho ngoại quan (thông báo kết quả phân luồng) (P); `VAE1LF0` Tờ khai hàng hóa xuất khẩu (thông quan) (P); `VAE2LF0` Tờ khai hàng hóa xuất khẩu (thông quan) (P); `VAE1RF0` Tờ khai hàng hóa xuất kho ngoại quan (cho phép hàng hóa xuất kho) (P); `VAF8010` Chứng từ ghi số thuế phải thu (P); `VAF8030` Chứng từ ghi số lệ phí phải thu (P); `VAF8040` Chứng từ ghi số lệ phí phải thu (P); `VAE4740` Thông báo yêu cầu kiểm tra thực tế hàng hóa (P); `VAE4780` Thông báo hủy yêu cầu kiểm tra thực tế hàng hóa (P)

<details><summary>Body mẫu (Postman, đã che mật khẩu, cắt base64) – đầy đủ: samples/EDC.request.json</summary>

```json
{
  "objVNACCS_ACCOUNT": {
    "useR_ID": "***",
    "password": "***",
    "terminaL_ID": "***",
    "terminaL_ACCESS_KEY": "***"
  },
  "tK_ECN": 306974147120
}
```
</details>


<details><summary>Trường – Body (5 trường · VNACCS_EDA v1.2.xlsx / EDC)</summary>

| Chỉ tiêu | Key JSON | Kiểu | Độ dài | Mô tả | Bắt buộc | Req | Res | Ghi chú |
|---|---|---|---|---|---|---|---|---|
| USER_ID | `useR_ID` | Text | 50 | Tài khoản vnaccs | ✓ |  |  |  |
| PASSWORD | `password` | Text | 50 | Tài khoản vnaccs | ✓ |  |  |  |
| TERMINAL_ID | `terminaL_ID` | Text | 50 | Tài khoản vnaccs | ✓ |  |  |  |
| TERMINAL_ACCESS_KEY | `terminaL_ACCESS_KEY` | Text | 50 | Tài khoản vnaccs | ✓ |  |  |  |
| TK_ECN | `tK_ECN` | Decimal | 12 | Số tờ khai | ✓ |  |  |  |
</details>


#### EDD – Gọi thông tin sửa đổi tờ khai xuất

- **Endpoint**: `POST {{FPT_BASE_URL}}/api/EDD` · xác thực: Bearer token (từ /api/auth/login)
- **Mục đích**: Gọi tờ khai xuất đã đăng ký về để sửa đổi bổ sung (VAE4110).
- **Khi nào gọi**: Sau EDC, trước thông quan.
- **Bước tiếp theo**: EDA01
- **Phản hồi**: envelope, dữ liệu ở `objEDA`
- **Mã thông điệp**: `VAE4110` Gọi thông tin sửa đổi tờ khai xuất khẩu (C)

<details><summary>Body mẫu (Postman, đã che mật khẩu, cắt base64) – đầy đủ: samples/EDD.request.json</summary>

```json
{
  "objVNACCS_ACCOUNT": {
    "useR_ID": "***",
    "password": "***",
    "terminaL_ID": "***",
    "terminaL_ACCESS_KEY": "***"
  },
  "tK_ECN": 306989502100
}
```
</details>


<details><summary>Trường – Body (5 trường · VNACCS_EDA v1.2.xlsx / EDD)</summary>

| Chỉ tiêu | Key JSON | Kiểu | Độ dài | Mô tả | Bắt buộc | Req | Res | Ghi chú |
|---|---|---|---|---|---|---|---|---|
| USER_ID | `useR_ID` | Text | 50 | Tài khoản vnaccs | ✓ |  |  |  |
| PASSWORD | `password` | Text | 50 | Tài khoản vnaccs | ✓ |  |  |  |
| TERMINAL_ID | `terminaL_ID` | Text | 50 | Tài khoản vnaccs | ✓ |  |  |  |
| TERMINAL_ACCESS_KEY | `terminaL_ACCESS_KEY` | Text | 50 | Tài khoản vnaccs | ✓ |  |  |  |
| TK_ECN | `tK_ECN` | Decimal | 12 | Số tờ khai | ✓ |  |  |  |
</details>


#### EDA01 – Khai sửa đổi tờ khai xuất (tạm)

- **Endpoint**: `POST {{FPT_BASE_URL}}/api/EDA01` · xác thực: Bearer token (từ /api/auth/login)
- **Mục đích**: Gửi nội dung tờ khai xuất đã sửa sau EDD (VAE0LB0).
- **Khi nào gọi**: Sau EDD.
- **Bước tiếp theo**: EDE
- **Phản hồi**: envelope, dữ liệu ở `objEDA`
- **Mã thông điệp**: `VAE0LB0` Khai báo sửa đổi tờ khai xuất khẩu (C)

<details><summary>Body mẫu (Postman, đã che mật khẩu, cắt base64) – đầy đủ: samples/EDA01.request.json</summary>

```json
{
  "objVNACCS_ACCOUNT": {
    "useR_ID": "***",
    "password": "***",
    "terminaL_ID": "***",
    "terminaL_ACCESS_KEY": "***"
  },
  "objVN_EDA": {
    "tK_ECN": 0,
    "tK_FIC": "string",
    "tK_BNO": "string",
    "tK_DNO": "string",
    "tK_TDN": 0,
    "tK_ECB": "string",
    "tK_CCC": "string",
    "tK_CH": "string",
    "tK_MTC": "string",
    "tK_ECD": "string",
    "tK_CHB": "string",
    "tK_RID": "string",
    "tK_EPC": "string",
    "tK_EPN": "string",
    "tK_EPP": "string",
    "tK_EPA": "string",
    "tK_EPT": "string",
    "tK_EXC": "string",
    "tK_EXN": "string",
    "tK_CGC": "string",
    "tK_ECC": "string",
    "tK_CGN": "string",
    "tK_CGP": "string",
    "tK_CGA": "string",
    "tK_CAT": "string",
    "tK_CAC": "string",
    "tK_CAS": "string",
    "tK_CGK": "string",
    "tK_EKN": "string",
    "tK_NO": "string",
    "tK_NOT": "string",
    "tK_GW": 0,
    "tK_GWT": "string",
    "tK_ST": "string",
    "tK_DSC": "string",
    "tK_DSN": "string",
    "tK_PSC": "string",
    "tK_PSN": "string",
    "tK_VSC": "string",
    "tK_VSN": "string",
    "tK_SYM": "string",
    "tK_MRK": "string",
    "tK_SS1": "string",
    "tK_SN1": "string",
    "tK_SS2": "string",
    "tK_SN2": "string",
    "tK_SS3": "string",
    "tK_SN3": "string",
    "tK_SS4": "string",
    "tK_SN4": "string",
    "tK_SS5": "string",
    "tK_SN5": "string",
    "tK_IV1": "string",
    "tK_IV3": "string",
    "tK_IV2": 0,
    "tK_IVD": "string",
    "tK_BRC": "string",
    "tK_IVP": "string",
    "tK_BYA": "string",
    "tK_IP2": "string",
    "tK_BCM": "string",
    "tK_IP3": "string",
    "tK_BCN": "string",
    "tK_IP4": 0,
    "tK_IP1": "string",
    "tK_SBC": "string",
    "tK_FCD": "string",
    "tK_RYA": "string",
    "tK_FKK": 0,
    "tK_SCM": "string",
    "tK_SCN": "string",
    "tK_TP": 0,
    "tK_CNV": "string",
    "tK_TPM": "string",
    "tK_ENC": "string",
    "tK_EA1": "string",
    "tK_EB1": 0,
    "tK_EA2": "string",
    "tK_EB2": 0,
    "tK_EA3": "string",
    "tK_EB3": 0,
    "tK_NT2": "string",
    "tK_REF": "string",
    "tK_DPD": "string",
    "tK_ST1": "string",
    "tK_AD1": "string",
    "tK_SD1": "string",
    "tK_ST2": "string",
    "tK_AD2": "string",
    "tK_SD2": "string",
    "tK_ST3": "string",
    "tK_AD3": "string",
    "tK_SD3": "string",
    "tK_ARP": "string",
    "tK_ADT": "string"
  },
  "objVN_EDA_CON": {
    "coN_VC1": "string",
    "coN_VC2": "string",
    "coN_VC3": "string",
    "coN_VC4": "string",
    "coN_VC5": "string",
    "coN_VN": "string",
    "coN_VA": "string",
    "coN_C01": "string",
    "coN_C02": "string",
    "coN_C03": "string",
    "coN_C04": "string",
    "coN_C05": "string",
    "coN_C06": "string",
    "coN_C07": "string",
    "coN_C08": "string",
    "coN_C09": "string",
    "coN_C10": "string",
    "coN_C11": "string",
    "coN_C12": "string",
    "coN_C13": "string",
    "coN_C14": "string",
    "coN_C15": "string",
    "coN_C16": "string",
    "coN_C17": "string",
    "coN_C18": "string",
    "coN_C19": "string",
    "coN_C20": "string",
    "coN_C21": "string",
    "coN_C22": "string",
    "coN_C23": "string",
    "coN_C24": "string",
    "coN_C25": "string",
    "coN_C26": "string",
    "coN_C27": "string",
    "coN_C28": "string",
    "coN_C29": "string",
    "coN_C30": "string",
    "coN_C31": "string",
    "coN_C32": "string",
    "coN_C33": "string",
    "coN_C34": "string",
    "coN_C35": "string",
    "coN_C36": "string",
    "coN_C37": "string",
    "coN_C38": "string",
    "coN_C39": "string",
    "coN_C40": "string",
    "coN_C41": "string",
    "coN_C42": "string",
    "coN_C43": "string",
    "coN_C44": "string",
    "coN_C45": "string",
    "coN_C46": "string",
    "coN_C47": "string",
    "coN_C48": "string",
    "coN_C49": "string",
    "coN_C50": "string"
  },
  "objVN_EDA_CTHQ": {
    "cthQ_CCM": "string",
    "cthQ_D01": "string",
    "cthQ_T01": "string",
    "cthQ_I01": "string",
    "cthQ_D02": "string",
    "cthQ_T02": "string",
    "cthQ_I02": "string",
    "cthQ_D03": "string",
    "cthQ_T03": "string",
    "cthQ_I03": "string",
    "cthQ_D04": "string",
    "cthQ_T04": "string",
    "cthQ_I04": "string",
    "cthQ_D05": "string",
    "cthQ_T05": "string",
    "cthQ_I05": "string",
    "cthQ_D06": "string",
    "cthQ_T06": "string",
    "cthQ_I06": "string",
    "cthQ_D07": "string",
    "cthQ_T07": "string",
    "cthQ_I07": "string",
    "cthQ_D08": "string",
    "cthQ_T08": "string",
    "cthQ_I08": "string",
    "cthQ_D09": "string",
    "cthQ_T09": "string",
    "cthQ_I09": "string",
    "cthQ_D10": "string",
    "cthQ_T10": "string",
    "cthQ_I10": "string"
  },
  "objVN_EDA_HANG": [
    {
      "haG_CMD": "string",
      "haG_COC": "string",
      "haG_CMN": "string",
      "haG_QN1": 0,
      "haG_QT1": "string",
      "haG_QN2": 0,
      "haG_QT2": "string",
      "haG_BPR": 0,
      "haG_UPR": 0,
      "haG_UPC": "string",
      "haG_TSC": "string",
      "haG_BPC": "string",
      "haG_REG": 0,
      "haG_TDL": "string",
      "haG_TXR": 0,
      "haG_OL1": "string",
      "haG_OL2": "string",
      "haG_OL3": "string",
      "haG_OL4": "string",
      "haG_OL5": "string",
      "haG_RE": "string",
      "haG_TXD": "string",
      "haG_DPR": 0,
      "haG_TXN": "string",
      "haG_TXC": "string",
      "haG_TXA": 0,
      "haG_TXB": 0
    }
  ]
}
```
</details>


<details><summary>Trường – Toàn bộ trường (sheet EDA01) (214 trường · VNACCS_EDA v1.2.xlsx / EDA01)</summary>

| Chỉ tiêu | Key JSON | Kiểu | Độ dài | Mô tả | Bắt buộc | Req | Res | Ghi chú |
|---|---|---|---|---|---|---|---|---|
| USER_ID | `useR_ID` | Text | 50 | Tài khoản vnaccs | ✓ |  |  |  |
| PASSWORD | `password` | Text | 50 | Tài khoản vnaccs | ✓ |  |  |  |
| TERMINAL_ID | `terminaL_ID` | Text | 50 | Tài khoản vnaccs | ✓ |  |  |  |
| TERMINAL_ACCESS_KEY | `terminaL_ACCESS_KEY` | Text | 50 | Tài khoản vnaccs | ✓ |  |  |  |
| TK_ECN | `tK_ECN` | Decimal | 12 | Số tờ khai | ✓ |  |  |  |
| TK_FIC | `tK_FIC` | Text | 12 | Số tờ khai đầu tiên |  |  |  |  |
| TK_BNO | `tK_BNO` | Long Integer |  | Số nhánh của tờ khai chia nhỏ |  |  |  |  |
| TK_DNO | `tK_DNO` | Long Integer |  | Tổng số tờ khai chia nhỏ |  |  |  |  |
| TK_TDN | `tK_TDN` | Decimal | 12 | Số tờ khai tạm nhập tái xuất tương ứng | ✓ |  |  |  |
| TK_ECB | `tK_ECB` | Text | 5 | Mã loại hình | ✓ |  |  |  |
| TK_CCC | `tK_CCC` | Text | 1 | Mã phân loại hàng hóa |  |  |  |  |
| TK_CH | `tK_CH` | Text | 6 | Cơ quan Hải quan | ✓ |  |  |  |
| TK_MTC | `tK_MTC` | Text | 1 | Mã hiệu phương thức vận chuyển | ✓ |  |  |  |
| TK_ECD | `tK_ECD` | Date/Time | 8 | Ngày khai báo (Dự kiến) |  |  |  |  |
| TK_CHB | `tK_CHB` | Text | 2 | Nhóm xử lý hồ sơ | ✓ |  |  |  |
| TK_RID | `tK_RID` | Date/Time | 8 | Thời hạn tái nhập khẩu |  |  |  |  |
| TK_EPC | `tK_EPC` | Text | 13 | Mã người xuất khẩu | ✓ |  |  |  |
| TK_EPN | `tK_EPN` | Text | 100 | Tên người xuất khẩu | ✓ |  |  |  |
| TK_EPP | `tK_EPP` | Text | 7 | Mã bưu chính |  |  |  |  |
| TK_EPA | `tK_EPA` | Memo | - | Địa chỉ người xuất khẩu | ✓ |  |  |  |
| TK_EPT | `tK_EPT` | Text | 20 | Số điện thoại người xuất khẩu |  |  |  |  |
| TK_EXC | `tK_EXC` | Text | 13 | Mã người ủy thác xuất khẩu |  |  |  |  |
| TK_EXN | `tK_EXN` | Memo | - | Tên người ủy thác xuất khẩu |  |  |  |  |
| TK_CGC | `tK_CGC` | Text | 13 | Mã người nhập khẩu |  |  |  |  |
| TK_ECC | `tK_ECC` | Text | 5 | Mã đại lý Hải quan |  |  |  |  |
| TK_CGN | `tK_CGN` | Text | 70 | Tên người nhập khẩu | ✓ |  |  |  |
| TK_CGP | `tK_CGP` | Text | 9 | Mã bưu chính |  |  |  |  |
| TK_CGA | `tK_CGA` | Text | 35 | Địa chỉ 1(Street and number/P.O.BOX) | ✓ |  |  |  |
| TK_CAT | `tK_CAT` | Text | 35 | Địa chỉ 2(Street and number/P.O.BOX) | ✓ |  |  |  |
| TK_CAC | `tK_CAC` | Text | 35 | Địa chỉ 3(City name) |  |  |  |  |
| TK_CAS | `tK_CAS` | Text | 35 | Địa chỉ 4(Country sub-entity, name) |  |  |  |  |
| TK_CGK | `tK_CGK` | Text | 2 | Mã nước(Country, coded) | ✓ |  |  |  |
| TK_EKN | `tK_EKN` | Text | 35 | Số vận đơn (Số B/L, số AWB v.v. …) |  |  |  |  |
| TK_NO | `tK_NO` | Long Integer |  | Số kiện | ✓ |  |  |  |
| TK_NOT | `tK_NOT` | Text | 3 | Mã đơn vị tính | ✓ |  |  |  |
| TK_GW | `tK_GW` | Decimal | 28.3 | Tổng trọng lượng hàng (Gross) | ✓ |  |  |  |
| TK_GWT | `tK_GWT` | Text | 6 | Mã đơn vị tính trọng lượng (Gross) | ✓ |  |  |  |
| TK_ST | `tK_ST` | Text | 7 | Mã địa điểm lưu kho hàng chờ thông quan dự kiến | ✓ |  |  |  |
| TK_DSC | `tK_DSC` | Text | 6 | Mã địa điểm nhận hàng cuối cùng | ✓ |  |  |  |
| TK_DSN | `tK_DSN` | Text | 255 | Tên địa điểm nhận hàng cuối cùng | ✓ |  |  |  |
| TK_PSC | `tK_PSC` | Text | 6 | Mã địa điểm xếp hàng | ✓ |  |  |  |
| TK_PSN | `tK_PSN` | Text | 255 | Tên địa điểm xếp hàng | ✓ |  |  |  |
| TK_VSC | `tK_VSC` | Text | 9 | Mã phương tiện vận chuyển dự kiến |  |  |  |  |
| TK_VSN | `tK_VSN` | Text | 255 | Tên phương tiện vận chuyển dự kiến |  |  |  |  |
| TK_SYM | `tK_SYM` | Date/Time | 8 | Ngày hàng đi dự kiến | ✓ |  |  |  |
| TK_MRK | `tK_MRK` | Text | 140 | Ký hiệu và số hiệu |  |  |  |  |
| TK_SS1 | `tK_SS1` | Text | 4 | Phân loại giấy phép xuất khẩu |  |  |  |  |
| TK_SN1 | `tK_SN1` | Text | 20 | Số của giấy phép |  |  |  |  |
| TK_SS2 | `tK_SS2` | Text | 4 | Phân loại giấy phép xuất khẩu |  |  |  |  |
| TK_SN2 | `tK_SN2` | Text | 20 | Số của giấy phép |  |  |  |  |
| TK_SS3 | `tK_SS3` | Text | 4 | Phân loại giấy phép xuất khẩu |  |  |  |  |
| TK_SN3 | `tK_SN3` | Text | 20 | Số của giấy phép |  |  |  |  |
| TK_SS4 | `tK_SS4` | Text | 4 | Phân loại giấy phép xuất khẩu |  |  |  |  |
| TK_SN4 | `tK_SN4` | Text | 20 | Số của giấy phép |  |  |  |  |
| TK_SS5 | `tK_SS5` | Text | 4 | Phân loại giấy phép xuất khẩu |  |  |  |  |
| TK_SN5 | `tK_SN5` | Text | 20 | Số của giấy phép |  |  |  |  |
| TK_IV1 | `tK_IV1` | Text | 1 | Phân loại hình thức hóa đơn | ✓ |  |  |  |
| TK_IV3 | `tK_IV3` | Text | 35 | Số hóa đơn | ✓ |  |  |  |
| TK_IV2 | `tK_IV2` | Decimal | 12 | Số tiếp nhận hóa đơn điện tử |  |  |  |  |
| TK_IVD | `tK_IVD` | Date/Time | 8 | Ngày phát hành | ✓ |  |  |  |
| TK_BRC | `tK_BRC` | Text | 11 | Mã ngân hàng trả thuế thay |  |  |  |  |
| TK_IVP | `tK_IVP` | Text | 7 | Phương thức thanh toán |  |  |  |  |
| TK_BYA | `tK_BYA` | Long Integer |  | Năm phát hành hạn mức |  |  |  |  |
| TK_IP2 | `tK_IP2` | Text | 3 | Mã điều kiện giá hóa đơn |  |  |  |  |
| TK_BCM | `tK_BCM` | Text | 10 | Kí hiệu chứng từ hạn mức |  |  |  |  |
| TK_IP3 | `tK_IP3` | Text | 3 | Mã đồng tiền của hóa đơn | ✓ |  |  |  |
| TK_BCN | `tK_BCN` | Text | 10 | Số chứng từ hạn mức |  |  |  |  |
| TK_IP4 | `tK_IP4` | Decimal | 20.4 | Tổng trị giá hóa đơn | ✓ |  |  |  |
| TK_IP1 | `tK_IP1` | Text | 1 | Mã phân loại giá hóa đơn |  |  |  |  |
| TK_SBC | `tK_SBC` | Text | 11 | Mã ngân hàng bảo lãnh |  |  |  |  |
| TK_FCD | `tK_FCD` | Text | 3 | Mã đồng tiền của tổng trị giá tính thuế |  |  |  |  |
| TK_RYA | `tK_RYA` | Long Integer |  | Năm phát hành bảo lãnh | ✓ |  |  |  |
| TK_FKK | `tK_FKK` | Decimal | 20.4 | Tổng trị giá tính thuế |  |  |  |  |
| TK_SCM | `tK_SCM` | Text | 10 | Ký hiệu chứng từ bảo lãnh | ✓ |  |  |  |
| TK_SCN | `tK_SCN` | Text | 10 | Số chứng từ bảo lãnh | ✓ |  |  |  |
| TK_TP | `tK_TP` | Decimal | 28.4 | Tổng hệ số phân bổ trị giá tính thuế |  |  |  |  |
| TK_CNV | `tK_CNV` | Text | 1 | Phân loại không cần quy đổi VND | ✓ |  |  |  |
| TK_TPM | `tK_TPM` | Text | 1 | Người nộp thuế | ✓ |  |  |  |
| TK_ENC | `tK_ENC` | Text | 1 | Mã xác định thời hạn nộp thuế |  |  |  |  |
| TK_EA1 | `tK_EA1` | Text | 3 | Phân loại đính kèm khai báo điện tử |  |  |  |  |
| TK_EB1 | `tK_EB1` | Decimal | 12 | Số đính kèm khai báo điện tử |  |  |  |  |
| TK_EA2 | `tK_EA2` | Text | 3 | Phân loại đính kèm khai báo điện tử |  |  |  |  |
| TK_EB2 | `tK_EB2` | Decimal | 12 | Số đính kèm khai báo điện tử |  |  |  |  |
| TK_EA3 | `tK_EA3` | Text | 3 | Phân loại đính kèm khai báo điện tử |  |  |  |  |
| TK_EB3 | `tK_EB3` | Decimal | 12 | Số đính kèm khai báo điện tử |  |  |  |  |
| TK_NT2 | `tK_NT2` | Memo | - | Phần ghi chú |  |  |  |  |
| TK_REF | `tK_REF` | Text | 20 | Số quản lý của nội bộ doanh nghiệp |  |  |  |  |
| TK_DPD | `tK_DPD` | Date/Time | 8 | Ngày khởi hành vận chuyển |  |  |  |  |
| TK_ST1 | `tK_ST1` | Text | 7 | Địa điểm trung chuyển cho vận chuyển bảo thuế (khai báo gộp) |  |  |  |  |
| TK_AD1 | `tK_AD1` | Date/Time | 8 | Ngày dự kiến đến(Địa điểm trung chuyển) |  |  |  |  |
| TK_SD1 | `tK_SD1` | Date/Time | 8 | Ngày khởi hành vận chuyển(Địa điểm trung chuyển) |  |  |  |  |
| TK_ST2 | `tK_ST2` | Text | 7 | Địa điểm trung chuyển cho vận chuyển bảo thuế (khai báo gộp) |  |  |  |  |
| TK_AD2 | `tK_AD2` | Date/Time | 8 | Ngày dự kiến đến(Địa điểm trung chuyển) |  |  |  |  |
| TK_SD2 | `tK_SD2` | Date/Time | 8 | Ngày khởi hành vận chuyển(Địa điểm trung chuyển) |  |  |  |  |
| TK_ST3 | `tK_ST3` | Text | 7 | Địa điểm trung chuyển cho vận chuyển bảo thuế (khai báo gộp) |  |  |  |  |
| TK_AD3 | `tK_AD3` | Date/Time | 8 | Ngày dự kiến đến(Địa điểm trung chuyển) |  |  |  |  |
| TK_SD3 | `tK_SD3` | Date/Time | 8 | Ngày khởi hành vận chuyển(Địa điểm trung chuyển) |  |  |  |  |
| TK_ARP | `tK_ARP` | Text | 7 | Địa điểm đích cho vận chuyển bảo thuế (khai báo gộp) |  |  |  |  |
| TK_ADT | `tK_ADT` | Date/Time | 8 | Ngày dự kiến đến |  |  |  |  |
| CON_VC1 | `coN_VC1` | Text | 7 | Mã địa điểm xếp hàng lên xe chở hàng (Vanning) |  |  |  |  |
| CON_VC2 | `coN_VC2` | Text | 7 | Mã địa điểm xếp hàng lên xe chở hàng (Vanning) |  |  |  |  |
| CON_VC3 | `coN_VC3` | Text | 7 | Mã địa điểm xếp hàng lên xe chở hàng (Vanning) |  |  |  |  |
| CON_VC4 | `coN_VC4` | Text | 7 | Mã địa điểm xếp hàng lên xe chở hàng (Vanning) |  |  |  |  |
| CON_VC5 | `coN_VC5` | Text | 7 | Mã địa điểm xếp hàng lên xe chở hàng (Vanning) |  |  |  |  |
| CON_VN | `coN_VN` | Text | 70 | Tên địa điểm xếp hàng lên xe chở hàng (Vanning) |  |  |  |  |
| CON_VA | `coN_VA` | Memo | - | Địa chỉ địa điểm xếp hàng lên xe chở hàng (Vanning) |  |  |  |  |
| CON_C01 | `coN_C01` | Text | 12 | Số container |  |  |  |  |
| CON_C02 | `coN_C02` | Text | 12 | Số container |  |  |  |  |
| CON_C03 | `coN_C03` | Text | 12 | Số container |  |  |  |  |
| CON_C04 | `coN_C04` | Text | 12 | Số container |  |  |  |  |
| CON_C05 | `coN_C05` | Text | 12 | Số container |  |  |  |  |
| CON_C06 | `coN_C06` | Text | 12 | Số container |  |  |  |  |
| CON_C07 | `coN_C07` | Text | 12 | Số container |  |  |  |  |
| CON_C08 | `coN_C08` | Text | 12 | Số container |  |  |  |  |
| CON_C09 | `coN_C09` | Text | 12 | Số container |  |  |  |  |
| CON_C10 | `coN_C10` | Text | 12 | Số container |  |  |  |  |
| CON_C11 | `coN_C11` | Text | 12 | Số container |  |  |  |  |
| CON_C12 | `coN_C12` | Text | 12 | Số container |  |  |  |  |
| CON_C13 | `coN_C13` | Text | 12 | Số container |  |  |  |  |
| CON_C14 | `coN_C14` | Text | 12 | Số container |  |  |  |  |
| CON_C15 | `coN_C15` | Text | 12 | Số container |  |  |  |  |
| CON_C16 | `coN_C16` | Text | 12 | Số container |  |  |  |  |
| CON_C17 | `coN_C17` | Text | 12 | Số container |  |  |  |  |
| CON_C18 | `coN_C18` | Text | 12 | Số container |  |  |  |  |
| CON_C19 | `coN_C19` | Text | 12 | Số container |  |  |  |  |
| CON_C20 | `coN_C20` | Text | 12 | Số container |  |  |  |  |
| CON_C21 | `coN_C21` | Text | 12 | Số container |  |  |  |  |
| CON_C22 | `coN_C22` | Text | 12 | Số container |  |  |  |  |
| CON_C23 | `coN_C23` | Text | 12 | Số container |  |  |  |  |
| CON_C24 | `coN_C24` | Text | 12 | Số container |  |  |  |  |
| CON_C25 | `coN_C25` | Text | 12 | Số container |  |  |  |  |
| CON_C26 | `coN_C26` | Text | 12 | Số container |  |  |  |  |
| CON_C27 | `coN_C27` | Text | 12 | Số container |  |  |  |  |
| CON_C28 | `coN_C28` | Text | 12 | Số container |  |  |  |  |
| CON_C29 | `coN_C29` | Text | 12 | Số container |  |  |  |  |
| CON_C30 | `coN_C30` | Text | 12 | Số container |  |  |  |  |
| CON_C31 | `coN_C31` | Text | 12 | Số container |  |  |  |  |
| CON_C32 | `coN_C32` | Text | 12 | Số container |  |  |  |  |
| CON_C33 | `coN_C33` | Text | 12 | Số container |  |  |  |  |
| CON_C34 | `coN_C34` | Text | 12 | Số container |  |  |  |  |
| CON_C35 | `coN_C35` | Text | 12 | Số container |  |  |  |  |
| CON_C36 | `coN_C36` | Text | 12 | Số container |  |  |  |  |
| CON_C37 | `coN_C37` | Text | 12 | Số container |  |  |  |  |
| CON_C38 | `coN_C38` | Text | 12 | Số container |  |  |  |  |
| CON_C39 | `coN_C39` | Text | 12 | Số container |  |  |  |  |
| CON_C40 | `coN_C40` | Text | 12 | Số container |  |  |  |  |
| CON_C41 | `coN_C41` | Text | 12 | Số container |  |  |  |  |
| CON_C42 | `coN_C42` | Text | 12 | Số container |  |  |  |  |
| CON_C43 | `coN_C43` | Text | 12 | Số container |  |  |  |  |
| CON_C44 | `coN_C44` | Text | 12 | Số container |  |  |  |  |
| CON_C45 | `coN_C45` | Text | 12 | Số container |  |  |  |  |
| CON_C46 | `coN_C46` | Text | 12 | Số container |  |  |  |  |
| CON_C47 | `coN_C47` | Text | 12 | Số container |  |  |  |  |
| CON_C48 | `coN_C48` | Text | 12 | Số container |  |  |  |  |
| CON_C49 | `coN_C49` | Text | 12 | Số container |  |  |  |  |
| CON_C50 | `coN_C50` | Text | 12 | Số container |  |  |  |  |
| CTHQ_CCM | `cthQ_CCM` | Text | 1 | Phân loại chỉ thị của Hải quan |  |  |  |  |
| CTHQ_D01 | `cthQ_D01` | Date/Time | 8 | Ngày chỉ thị của Hải quan |  |  |  |  |
| CTHQ_T01 | `cthQ_T01` | Text | 120 | Tên chỉ thị của Hải quan |  |  |  |  |
| CTHQ_I01 | `cthQ_I01` | Memo | - | Nội dung chỉ thị của Hải quan |  |  |  |  |
| CTHQ_D02 | `cthQ_D02` | Date/Time | 8 | Ngày chỉ thị của Hải quan |  |  |  |  |
| CTHQ_T02 | `cthQ_T02` | Text | 120 | Tên chỉ thị của Hải quan |  |  |  |  |
| CTHQ_I02 | `cthQ_I02` | Memo | - | Nội dung chỉ thị của Hải quan |  |  |  |  |
| CTHQ_D03 | `cthQ_D03` | Date/Time | 8 | Ngày chỉ thị của Hải quan |  |  |  |  |
| CTHQ_T03 | `cthQ_T03` | Text | 120 | Tên chỉ thị của Hải quan |  |  |  |  |
| CTHQ_I03 | `cthQ_I03` | Memo | - | Nội dung chỉ thị của Hải quan |  |  |  |  |
| CTHQ_D04 | `cthQ_D04` | Date/Time | 8 | Ngày chỉ thị của Hải quan |  |  |  |  |
| CTHQ_T04 | `cthQ_T04` | Text | 120 | Tên chỉ thị của Hải quan |  |  |  |  |
| CTHQ_I04 | `cthQ_I04` | Memo | - | Nội dung chỉ thị của Hải quan |  |  |  |  |
| CTHQ_D05 | `cthQ_D05` | Date/Time | 8 | Ngày chỉ thị của Hải quan |  |  |  |  |
| CTHQ_T05 | `cthQ_T05` | Text | 120 | Tên chỉ thị của Hải quan |  |  |  |  |
| CTHQ_I05 | `cthQ_I05` | Memo | - | Nội dung chỉ thị của Hải quan |  |  |  |  |
| CTHQ_D06 | `cthQ_D06` | Date/Time | 8 | Ngày chỉ thị của Hải quan |  |  |  |  |
| CTHQ_T06 | `cthQ_T06` | Text | 120 | Tên chỉ thị của Hải quan |  |  |  |  |
| CTHQ_I06 | `cthQ_I06` | Memo | - | Nội dung chỉ thị của Hải quan |  |  |  |  |
| CTHQ_D07 | `cthQ_D07` | Date/Time | 8 | Ngày chỉ thị của Hải quan |  |  |  |  |
| CTHQ_T07 | `cthQ_T07` | Text | 120 | Tên chỉ thị của Hải quan |  |  |  |  |
| CTHQ_I07 | `cthQ_I07` | Memo | - | Nội dung chỉ thị của Hải quan |  |  |  |  |
| CTHQ_D08 | `cthQ_D08` | Date/Time | 8 | Ngày chỉ thị của Hải quan |  |  |  |  |
| CTHQ_T08 | `cthQ_T08` | Text | 120 | Tên chỉ thị của Hải quan |  |  |  |  |
| CTHQ_I08 | `cthQ_I08` | Memo | - | Nội dung chỉ thị của Hải quan |  |  |  |  |
| CTHQ_D09 | `cthQ_D09` | Date/Time | 8 | Ngày chỉ thị của Hải quan |  |  |  |  |
| CTHQ_T09 | `cthQ_T09` | Text | 120 | Tên chỉ thị của Hải quan |  |  |  |  |
| CTHQ_I09 | `cthQ_I09` | Memo | - | Nội dung chỉ thị của Hải quan |  |  |  |  |
| CTHQ_D10 | `cthQ_D10` | Date/Time | 8 | Ngày chỉ thị của Hải quan |  |  |  |  |
| CTHQ_T10 | `cthQ_T10` | Text | 120 | Tên chỉ thị của Hải quan |  |  |  |  |
| CTHQ_I10 | `cthQ_I10` | Memo | - | Nội dung chỉ thị của Hải quan |  |  |  |  |
| HAG_CMD | `haG_CMD` | Text | 12 | Mã số hàng hóa | ✓ |  |  |  |
| HAG_COC | `haG_COC` | Text | 255 | Mã quản lý riêng |  |  |  |  |
| HAG_CMN | `haG_CMN` | TEXT | 200 | Mô tả hàng hóa | ✓ |  |  |  |
| HAG_QN1 | `haG_QN1` | Decimal | 20.8 | Số lượng (1) | ✓ |  |  |  |
| HAG_QT1 | `haG_QT1` | Text | 4 | Mã đơn vị tính (1) | ✓ |  |  |  |
| HAG_QN2 | `haG_QN2` | Decimal | 20.4 | Số lượng (2) |  |  |  |  |
| HAG_QT2 | `haG_QT2` | Text | 4 | Mã đơn vị tính (2) |  |  |  |  |
| HAG_BPR | `haG_BPR` | Decimal | 20.4 | Trị giá hóa đơn | ✓ |  |  |  |
| HAG_UPR | `haG_UPR` | Decimal | 20.8 | Đơn giá hóa đơn | ✓ |  |  |  |
| HAG_UPC | `haG_UPC` | Text | 3 | Mã đồng tiền của đơn giá hóa đơn | ✓ |  |  |  |
| HAG_TSC | `haG_TSC` | Text | 4 | Price quantity unit | ✓ |  |  |  |
| HAG_BPC | `haG_BPC` | Text | 3 | Mã đồng tiền của giá tính thuế(S) |  |  |  |  |
| HAG_REG | `haG_REG` | Decimal | 16 | Số tiền giảm thuế xuất khẩu | ✓ |  |  |  |
| HAG_TDL | `haG_TDL` | Text | 2 | Số thứ tự của dòng hàng trên tờ khai tạm nhập tái xuất tương ứng |  |  |  |  |
| HAG_TXR | `haG_TXR` | Decimal | 12 | Danh mục miễn thuế xuất khẩu |  |  |  |  |
| HAG_OL1 | `haG_OL1` | Text | 2 | Mã văn bản pháp quy khác |  |  |  |  |
| HAG_OL2 | `haG_OL2` | Text | 2 | Mã văn bản pháp quy khác |  |  |  |  |
| HAG_OL3 | `haG_OL3` | Text | 2 | Mã văn bản pháp quy khác |  |  |  |  |
| HAG_OL4 | `haG_OL4` | Text | 2 | Mã văn bản pháp quy khác |  |  |  |  |
| HAG_OL5 | `haG_OL5` | Text | 2 | Mã văn bản pháp quy khác |  |  |  |  |
| HAG_RE | `haG_RE` | Text | 5 | Mã miễn / Giảm / Không chịu thuế xuất khẩu |  |  |  |  |
| HAG_TXD | `haG_TXD` | Text | 3 | Mã đồng tiền của mức thuế tuyệt đối |  |  |  |  |
| HAG_DPR | `haG_DPR` | Decimal | 28.4 | Trị giá tính thuế |  |  |  |  |
| HAG_TXN | `haG_TXN` | Text | 12 | Danh mục miễn thuế xuất khẩu |  |  |  |  |
| HAG_TXC | `haG_TXC` | Text | 4 | Mã đơn vị tính thuế tuyệt đối |  |  |  |  |
| HAG_TXA | `haG_TXA` | Decimal | 18.4 | Thuế suất |  |  |  |  |
| HAG_TXB | `haG_TXB` | Decimal | 18.4 | Mức thuế tuyệt đối |  |  |  |  |
</details>


#### EDE – Đăng ký sửa đổi tờ khai xuất (chính thức)

- **Endpoint**: `POST {{FPT_BASE_URL}}/api/EDE` · xác thực: Bearer token (từ /api/auth/login)
- **Mục đích**: Đăng ký chính thức bản sửa đổi (VAE2LE0/VAE3LE0…).
- **Khi nào gọi**: Sau EDA01.
- **Bước tiếp theo**: VNACCSREP, IEX
- **Phản hồi**: envelope, dữ liệu ở `objEDA`
- **Mã thông điệp**: `VAE2LE0` Tờ khai bổ sung hàng hóa xuất khẩu (người khai Hải quan thực hiện) (P); `VAE3LE0` Tờ khai bổ sung hàng hóa xuất khẩu (người khai Hải quan thực hiện) (P); `VAE2RE0` Tờ khai bổ sung hàng hóa xuất kho ngoại quan (người khai hải quan thực hiện) (P); `VAE3RE0` Tờ khai bổ sung hàng hóa xuất kho ngoại quan (người khai hải quan thực hiện) (P); `VAE2LY0` Tờ khai bổ sung hàng hóa xuất khẩu (cơ quan Hải quan thực hiện) (P); `VAE3LY0` Tờ khai bổ sung hàng hóa xuất khẩu (cơ quan Hải quan thực hiện) (P); `VAE2RY0` Tờ khai bổ sung hàng hóa xuất kho ngoại quan (cơ quan Hải quan thực hiện) (P); `VAE3RY0` Tờ khai bổ sung hàng hóa xuất kho ngoại quan (cơ quan Hải quan thực hiện) (P); `VAE8000` Bản chỉ thị sửa đổi của Hải quan (P); `VAE0LC0` Tham chiếu thông tin tờ khai xuất khẩu (C)

<details><summary>Body mẫu (Postman, đã che mật khẩu, cắt base64) – đầy đủ: samples/EDE.request.json</summary>

```json
{
  "objVNACCS_ACCOUNT": {
    "useR_ID": "***",
    "password": "***",
    "terminaL_ID": "***",
    "terminaL_ACCESS_KEY": "***"
  },
  "tK_ECN": 306974147120
}
```
</details>


<details><summary>Trường – Body (5 trường · VNACCS_EDA v1.2.xlsx / EDE)</summary>

| Chỉ tiêu | Key JSON | Kiểu | Độ dài | Mô tả | Bắt buộc | Req | Res | Ghi chú |
|---|---|---|---|---|---|---|---|---|
| USER_ID | `useR_ID` | Text | 50 | Tài khoản vnaccs | ✓ |  |  |  |
| PASSWORD | `password` | Text | 50 | Tài khoản vnaccs | ✓ |  |  |  |
| TERMINAL_ID | `terminaL_ID` | Text | 50 | Tài khoản vnaccs | ✓ |  |  |  |
| TERMINAL_ACCESS_KEY | `terminaL_ACCESS_KEY` | Text | 50 | Tài khoản vnaccs | ✓ |  |  |  |
| TK_ECN | `tK_ECN` | Decimal | 12 | Số tờ khai | ✓ |  |  |  |
</details>


#### IEX – Tham chiếu (tra cứu) tờ khai xuất

- **Endpoint**: `POST {{FPT_BASE_URL}}/api/IEX` · xác thực: Bearer token (từ /api/auth/login)
- **Mục đích**: Lấy thông tin + trạng thái tờ khai xuất (VAE0LC0 "Tham chiếu thông tin tờ khai xuất khẩu").
- **Khi nào gọi**: Bất kỳ lúc nào đã có số tờ khai.
- **Body**: Tài khoản VNACCS + `tK_ECN` (không phải tK_SOTK).
- **Phản hồi**: envelope, dữ liệu ở `objEDA`

<details><summary>Body mẫu (Postman, đã che mật khẩu, cắt base64) – đầy đủ: samples/IEX.request.json</summary>

```json
{
  "objVNACCS_ACCOUNT": {
    "useR_ID": "***",
    "password": "***",
    "terminaL_ID": "***",
    "terminaL_ACCESS_KEY": "***"
  },
  "tK_ECN": 306989502100
}
```
</details>


<details><summary>Trường – objVN_EDA_TRANGTHAI (9 trường · VNACCS_EDA v1.2.xlsx / VN_EDA_TRANGTHAI)</summary>

| Chỉ tiêu | Key JSON | Kiểu | Độ dài | Mô tả | Bắt buộc | Req | Res | Ghi chú |
|---|---|---|---|---|---|---|---|---|
| TK_ID | `tK_ID` | Long Integer |  | Tờ khai ID |  |  |  |  |
| TK_AD4 | `tK_AD4` | Text | 255 | Giờ hoàn thành kiểm tra |  |  |  |  |
| TK_K86 | `tK_K86` | Date/Time | 8 | Ngày cấp phép |  |  |  |  |
| TK_AD5 | `tK_AD5` | Text | 255 | Giờ cấp phép |  |  |  |  |
| TK_K87 | `tK_K87` | Text | 255 | Tên trưởng đơn vị Hải quan |  |  |  |  |
| TK_CCD | `tK_CCD` | Date/Time | 8 | Ngày hoàn thành kiểm tra |  |  |  |  |
| TK_LUONG | `tK_LUONG` | Long Integer |  | Luồng ID |  |  |  |  |
| TK_TRANGTHAI | `tK_TRANGTHAI` | Text | 255 | Trạng Thái ID |  |  |  |  |
| TK_THONGQUAN | `tK_THONGQUAN` | Long Integer |  | Thông quan ID |  |  |  |  |
</details>


### Sửa đổi sau thông quan (AMA/AMB/AMC)

#### AMA – Khai tạm tờ khai bổ sung sau thông quan

- **Endpoint**: `POST {{FPT_BASE_URL}}/api/AMA` · xác thực: Bearer token (từ /api/auth/login)
- **Mục đích**: Khai bổ sung cho tờ khai đã thông quan (không sửa tờ khai gốc). Phản hồi VAL8000 (chưa đăng ký) kèm số tờ khai bổ sung tK_SYN.
- **Khi nào gọi**: Sau thông quan, trong thời hạn (60 ngày – TT121 Điều 20).
- **Bước tiếp theo**: AMB, AMC
- **Phản hồi**: envelope, dữ liệu ở `objAMA`
- **Mã thông điệp**: `VAL8000` Tờ khai bổ sung sau thông quan (chưa đăng ký) (P)

<details><summary>Body mẫu (Postman, đã che mật khẩu, cắt base64) – đầy đủ: samples/AMA.request.json</summary>

```json
{
  "objVNACCS_ACCOUNT": {
    "useR_ID": "***",
    "password": "***",
    "terminaL_ID": "***",
    "terminaL_ACCESS_KEY": "***"
  },
  "objVN_AMA": {
    "tK_ADD": null,
    "tK_AD2": null,
    "tK_AD3": "",
    "tK_SYN": null,
    "tK_A02": "",
    "tK_AD1": "",
    "tK_CHS": "28PC",
    "tK_CHB": "00",
    "tK_YNK": "I",
    "tK_ICN": 104265243240,
    "tK_ICB": "E21",
    "tK_IDD": "25/09/2021",
    "tK_ADE": "",
    "tK_CTO": "",
    "tK_IPD": "25/09/2021",
    "tK_TTC": "VND",
    "tK_RED": "",
    "tK_BRC": "",
    "tK_IMC": "2700672473",
    "tK_IMN": "Công Ty TNHH Daekwang Vina",
    "tK_BYA": null,
    "tK_BCM": "",
    "tK_IMY": "(+084)",
    "tK_BCN": "",
    "tK_IMA": "THÔN XUÂN LONG, XÃ GIA SƠN, HUYỆN NHO QUAN, NINH BÌNH",
    "tK_IMT": "3.661 199",
    "tK_SBC": "",
    "tK_A12": "",
    "tK_RYA": null,
    "tK_A13": "",
    "tK_SCM": "",
    "tK_A14": "",
    "tK_REC": "4",
    "tK_SCN": "",
    "tK_A16": "",
    "tK_ENC": "D",
    "tK_ADS": "",
    "tK_ADT": null,
    "tK_ADU": null,
    "tK_REF": "",
    "tK_CDB": "",
    "tK_RTB": null,
    "tK_NTB": "01/DK-ARO/2021#&26082021#&Shipper: JYJ APPAREL CO.,LTD",
    "tK_CDA": "",
    "tK_RTA": null,
    "tK_NTA": "01/DK-ARO/2021#&26082021#&Shipper: JYJ APPAREL CO.,LTD",
    "tK_ADB": "",
    "tK_A23": null,
    "tK_ADN": "",
    "tK_KA1": "",
    "tK_KB1": "",
    "tK_KU1": "",
    "tK_KC1": null,
    "tK_KW1": "",
    "tK_KA2": "",
    "tK_KB2": "",
    "tK_KU2": "",
    "tK_KC2": null,
    "tK_KW2": "",
    "tK_KA3": "",
    "tK_KB3": "",
    "tK_KU3": "",
    "tK_KC3": null,
    "tK_KW3": "",
    "tK_KA4": "",
    "tK_KB4": "",
    "tK_KU4": "",
    "tK_KC4": null,
    "tK_KW4": "",
    "tK_KA5": "",
    "tK_KB5": "",
    "tK_KU5": "",
    "tK_KC5": null,
    "tK_KW5": "",
    "tK_A24": null,
    "tK_A25": null,
    "tK_ADO": "",
    "tK_ADF": "",
    "tK_ADP": ""
  },
  "objVN_AMA_HANG": [
    {
      "haG_RAN": "13",
      "haG_MK1": "V",
      "haG_MK2": "",
      "haG_A26": "",
      "haG_A28": "",
      "haG_CMB": "Khóa kéo có răng bằng kim loại cơ bản , dùng làm khóa quần áo ECO COMPANY CO.,LTD, mới 100%",
      "haG_ORB": "KR",
      "haG_CMA": "Móc treo bằng nhựa , dùng treo quần áo ECO COMPANY CO.,LTD, mới 100%",
      "haG_ORA": "KR",
      "haG_MK3": "",
      "haG_MKB": 6344800,
      "haG_MKQ": 2800,
      "haG_MKC": "PCE",
      "haG_MKT": "96071100",
      "haG_MKR": "0%",
      "haG_MKA": "0",
      "haG_A45": "",
      "haG_AKB": 6344800,
      "haG_AKQ": 2800,
      "haG_AKC": "PCE",
      "haG_AKT": "39262090",
      "haG_AKR": "0%",
      "haG_AKA": "0",
      "haG_MK4": "",
      "haG_A52": "",
      "haG_ADC": "",
      "haG_A53": null,
      "haG_KD1": "",
      "haG_KE1": "",
      "haG_MB1": 6344800,
      "haG_MQ1": null,
      "haG_MC1": "",
      "haG_KI1": "",
      "haG_MR1": "0%",
      "haG_MA1": "0",
      "haG_MK5": "",
      "haG_KL1": "",
      "haG_AB1": 6344800,
      "haG_AQ1": null,
      "haG_AC1": "",
      "haG_AK1": "V",
      "haG_AR1": "0%",
      "haG_AA1": "0",
      "haG_KS1": "",
      "haG_KV1": "",
      "haG_KT1": null,
      "haG_KD2": "",
      "haG_KE2": "",
      "haG_MB2": null,
      "haG_MQ2": null,
      "haG_MC2": "",
      "haG_KI2": "",
      "haG_MR2": "",
      "haG_MA2": "",
      "haG_KL2": "",
      "haG_AB2": null,
      "haG_AQ2": null,
      "haG_AC2": "",
      "haG_AK2": "",
      "haG_AR2": "",
      "haG_AA2": "",
      "haG_KS2": "",
      "haG_KV2": "",
      "haG_KT2": null,
      "haG_KD3": "",
      "haG_KE3": "",
      "haG_MB3": null,
      "haG_MQ3": null,
      "haG_MC3": "",
      "haG_KI3": "",
      "haG_MR3": "",
      "haG_MA3": "",
      "haG_KL3": "",
      "haG_AB3": null,
      "haG_AQ3": null,
      "haG_AC3": "",
      "haG_AK3": "",
      "haG_AR3": "",
      "haG_AA3": "",
      "haG_KS3": "",
      "haG_KV3": "",
      "haG_KT3": null,
      "haG_KD4": "",
      "haG_KE4": "",
      "haG_MB4": null,
      "haG_MQ4": null,
      "haG_MC4": "",
      "haG_KI4": "",
      "haG_MR4": "",
      "haG_MA4": "",
      "haG_KL4": "",
      "haG_AB4": null,
      "haG_AQ4": null,
      "haG_AC4": "",
      "haG_AK4": "",
      "haG_AR4": "",
      "haG_AA4": "",
      "haG_KS4": "",
      "haG_KV4": "",
      "haG_KT4": null,
      "haG_KD5": "",
      "haG_KE5": "",
      "haG_MB5": null,
      "haG_MQ5": null,
      "haG_MC5": "",
      "haG_KI5": "",
      "haG_MR5": "",
      "haG_MA5": "",
      "haG_KL5": "",
      "haG_AB5": null,
      "haG_AQ5": null,
      "haG_AC5": "",
      "haG_AK5": "",
      "haG_AR5": "",
      "haG_AA5": "",
      "haG_KS5": "",
      "haG_KV5": "",
      "haG_KT5": null,
      "haG_MMA": "",
      "haG_AMA": ""
    }
  ]
}
```
</details>


<details><summary>Trường – objVN_AMA (81 trường · VNACCS_AMA v1.4.xlsx / VN_AMA)</summary>

| Chỉ tiêu | Key JSON | Kiểu | Độ dài | Mô tả | Bắt buộc | Req | Res | Ghi chú |
|---|---|---|---|---|---|---|---|---|
| TK_ID | `tK_ID` | Long Integer |  | Tờ khai bổ sung ID |  |  |  |  |
| TK_ADD | `tK_ADD` | Decimal | 12 | Số thông báo |  |  | ✓ |  |
| TK_AD2 | `tK_AD2` | Date/Time | 8 | Ngày hoàn thành kiểm tra |  |  | ✓ |  |
| TK_AD3 | `tK_AD3` | Text | 6 | Giờ hoàn thành kiểm tra |  |  | ✓ |  |
| TK_SYN | `tK_SYN` | Decimal | 12 | Số tờ khai bổ sung |  | ✓ | ✓ |  |
| TK_A02 | `tK_A02` | Date/Time | 8 | Ngày đăng ký khai bổ sung |  |  | ✓ |  |
| TK_AD1 | `tK_AD1` | Text | 6 | Giờ đăng ký khai bổ sung |  |  | ✓ |  |
| TK_CHS | `tK_CHS` | Text | 6 | Mã Cơ quan Hải quan |  | ✓ |  |  |
| TK_CHB | `tK_CHB` | Text | 2 | Nhóm xử lý hồ sơ |  | ✓ | ✓ |  |
| TK_YNK | `tK_YNK` | Text | 1 | Phân loại xuất nhập khẩu |  | ✓ | ✓ | I: Nhập<br>E: Xuất |
| TK_ICN | `tK_ICN` | Decimal | 12 | Số tờ khai(số tờ khai xuất, tờ khai nhập, …) |  | ✓ | ✓ |  |
| TK_ICB | `tK_ICB` | Text | 3 | Mã loại hình |  | ✓ | ✓ |  |
| TK_IDD | `tK_IDD` | Date/Time | 8 | Ngày khai báo xuất nhập khẩu |  | ✓ | ✓ |  |
| TK_ADE | `tK_ADE` | Text | 1 | Dấu hiệu báo quá 60 ngày |  |  | ✓ |  |
| TK_CTO | `tK_CTO` | Text | 1 | Mã hết thời hạn |  |  | ✓ |  |
| TK_IPD | `tK_IPD` | Date/Time | 8 | Ngày cấp phép xuất nhập khẩu |  | ✓ | ✓ |  |
| TK_TTC | `tK_TTC` | Text | 3 | Mã tiền tệ của tiền thuế |  | ✓ | ✓ |  |
| TK_RED | `tK_RED` | Date/Time | 8 | Thời hạn tái nhập/ tái xuất |  | ✓ | ✓ |  |
| TK_BRC | `tK_BRC` | Text | 11 | Mã ngân hàng trả thuế thay |  | ✓ |  |  |
| TK_IMC | `tK_IMC` | Text | 13 | Mã người khai |  | ✓ | ✓ |  |
| TK_IMN | `tK_IMN` | Memo | - | Tên người khai |  | ✓ | ✓ |  |
| TK_BYA | `tK_BYA` | Long Integer | 4 | Năm phát hành hạn mức |  | ✓ |  |  |
| TK_BCM | `tK_BCM` | Text | 10 | Kí hiệu chứng từ phát hành hạn mức |  | ✓ |  |  |
| TK_IMY | `tK_IMY` | Text | 7 | Mã bưu chính |  | ✓ | ✓ |  |
| TK_BCN | `tK_BCN` | Text | 10 | Số chứng từ phát hành hạn mức |  | ✓ |  |  |
| TK_IMA | `tK_IMA` | Memo | - | Địa chỉ của người khai |  | ✓ | ✓ |  |
| TK_IMT | `tK_IMT` | Text | 20 | Số điện thoại của người khai |  | ✓ | ✓ |  |
| TK_SBC | `tK_SBC` | Text | 11 | Mã ngân hàng bảo lãnh |  | ✓ |  |  |
| TK_A12 | `tK_A12` | Text | 5 | Mã đại lý Hải quan |  |  | ✓ |  |
| TK_RYA | `tK_RYA` | Long Integer | 4 | Năm phát hành bảo lãnh |  | ✓ |  |  |
| TK_A13 | `tK_A13` | Text | 50 | Tên đại lý Hải quan |  |  | ✓ |  |
| TK_SCM | `tK_SCM` | Text | 10 | Ký hiệu phát hành chứng từ bảo lãnh |  | ✓ |  |  |
| TK_A14 | `tK_A14` | Text | 5 | Mã nhân viên Hải quan |  |  | ✓ |  |
| TK_REC | `tK_REC` | Text | 1 | Mã lý do khai bổ sung |  | ✓ | ✓ |  |
| TK_SCN | `tK_SCN` | Text | 10 | Số hiệu phát hành chứng từ bảo lãnh |  | ✓ |  |  |
| TK_A16 | `tK_A16` | Text | 1 | Phân loại nộp thuế |  |  | ✓ |  |
| TK_ENC | `tK_ENC` | Text | 1 | Mã xác định thời hạn nộp thuế |  | ✓ | ✓ |  |
| TK_ADS | `tK_ADS` | Date/Time | 8 | Ngày hiệu lực của chứng từ |  |  | ✓ |  |
| TK_ADT | `tK_ADT` | Long Integer |  | Thời hạn nộp thuế |  |  | ✓ |  |
| TK_ADU | `tK_ADU` | Long Integer |  | GTGT |  |  | ✓ |  |
| TK_REF | `tK_REF` | Text | 20 | Số quản lý trong nội bộ doanh nghiệp |  | ✓ | ✓ |  |
| TK_CDB | `tK_CDB` | Text | 3 | Mã tiền tệ trước khi khai bổ sung |  | ✓ | ✓ |  |
| TK_RTB | `tK_RTB` | Decimal | 17.4 | Tỷ giá hối đoái trước khi khai bổ sung |  | ✓ | ✓ |  |
| TK_NTB | `tK_NTB` | Memo | - | Ghi chú nội dung liên quan trước khi khai bổ sung |  | ✓ | ✓ |  |
| TK_CDA | `tK_CDA` | Text | 3 | Mã tiền tệ sau khi khai bổ sung |  | ✓ | ✓ |  |
| TK_RTA | `tK_RTA` | Decimal | 17.4 | Tỷ giá hối đoái sau khi khai bổ sung |  | ✓ | ✓ |  |
| TK_NTA | `tK_NTA` | Memo | - | Ghi chú nội dung liên quan sau khi khai bổ sung |  | ✓ | ✓ |  |
| TK_ADB | `tK_ADB` | Text | 1 | Biểu thị số tiền tăng giảm(Tổng số tiền tăng giảm thuế xuất nhập khẩu) |  |  | ✓ |  |
| TK_A23 | `tK_A23` | Decimal | 11 | Tổng số tiền tăng giảm thuế xuất nhập khẩu |  |  | ✓ |  |
| TK_ADN | `tK_ADN` | Text | 3 | Mã tiền tệ của tiền thuế(Tổng số tiền tăng giảm thuế xuất nhập khẩu) |  |  |  |  |
| TK_KA1 | `tK_KA1` | Text | 1 | Mã khoản mục tiếp nhận tổng số tiền tăng giảm thuế và thu khác |  |  | ✓ |  |
| TK_KB1 | `tK_KB1` | Text | 27 | Tên khoản mục tiếp nhận tổng số tiền tăng giảm thuế và thu khác |  |  | ✓ |  |
| TK_KU1 | `tK_KU1` | Text | 1 | Biểu thị số tiền tăng giảm(Tổng số tiền tăng giảm thuế và thu khác) |  |  | ✓ |  |
| TK_KC1 | `tK_KC1` | Decimal | 11 | Tổng số tiền tăng giảm thuế và thu khác |  |  | ✓ |  |
| TK_KW1 | `tK_KW1` | Text | 3 | Mã tiền tệ của tiền thuế(Tổng số tiền tăng giảm thuế và thu khác) |  |  | ✓ |  |
| TK_KA2 | `tK_KA2` | Text | 1 | Mã khoản mục tiếp nhận tổng số tiền tăng giảm thuế và thu khác |  |  | ✓ |  |
| TK_KB2 | `tK_KB2` | Text | 27 | Tên khoản mục tiếp nhận tổng số tiền tăng giảm thuế và thu khác |  |  | ✓ |  |
| TK_KU2 | `tK_KU2` | Text | 1 | Biểu thị số tiền tăng giảm(Tổng số tiền tăng giảm thuế và thu khác) |  |  | ✓ |  |
| TK_KC2 | `tK_KC2` | Decimal | 11 | Tổng số tiền tăng giảm thuế và thu khác |  |  | ✓ |  |
| TK_KW2 | `tK_KW2` | Text | 3 | Mã tiền tệ của tiền thuế(Tổng số tiền tăng giảm thuế và thu khác) |  |  | ✓ |  |
| TK_KA3 | `tK_KA3` | Text | 1 | Mã khoản mục tiếp nhận tổng số tiền tăng giảm thuế và thu khác |  |  | ✓ |  |
| TK_KB3 | `tK_KB3` | Text | 27 | Tên khoản mục tiếp nhận tổng số tiền tăng giảm thuế và thu khác |  |  | ✓ |  |
| TK_KU3 | `tK_KU3` | Text | 1 | Biểu thị số tiền tăng giảm(Tổng số tiền tăng giảm thuế và thu khác) |  |  | ✓ |  |
| TK_KC3 | `tK_KC3` | Decimal | 11 | Tổng số tiền tăng giảm thuế và thu khác |  |  | ✓ |  |
| TK_KW3 | `tK_KW3` | Text | 3 | Mã tiền tệ của tiền thuế(Tổng số tiền tăng giảm thuế và thu khác) |  |  | ✓ |  |
| TK_KA4 | `tK_KA4` | Text | 1 | Mã khoản mục tiếp nhận tổng số tiền tăng giảm thuế và thu khác |  |  | ✓ |  |
| TK_KB4 | `tK_KB4` | Text | 27 | Tên khoản mục tiếp nhận tổng số tiền tăng giảm thuế và thu khác |  |  | ✓ |  |
| TK_KU4 | `tK_KU4` | Text | 1 | Biểu thị số tiền tăng giảm(Tổng số tiền tăng giảm thuế và thu khác) |  |  | ✓ |  |
| TK_KC4 | `tK_KC4` | Decimal | 11 | Tổng số tiền tăng giảm thuế và thu khác |  |  | ✓ |  |
| TK_KW4 | `tK_KW4` | Text | 3 | Mã tiền tệ của tiền thuế(Tổng số tiền tăng giảm thuế và thu khác) |  |  | ✓ |  |
| TK_KA5 | `tK_KA5` | Text | 1 | Mã khoản mục tiếp nhận tổng số tiền tăng giảm thuế và thu khác |  |  | ✓ |  |
| TK_KB5 | `tK_KB5` | Text | 27 | Tên khoản mục tiếp nhận tổng số tiền tăng giảm thuế và thu khác |  |  | ✓ |  |
| TK_KU5 | `tK_KU5` | Text | 1 | Biểu thị số tiền tăng giảm(Tổng số tiền tăng giảm thuế và thu khác) |  |  | ✓ |  |
| TK_KC5 | `tK_KC5` | Decimal | 11 | Tổng số tiền tăng giảm thuế và thu khác |  |  | ✓ |  |
| TK_KW5 | `tK_KW5` | Text | 3 | Mã tiền tệ của tiền thuế(Tổng số tiền tăng giảm thuế và thu khác) |  |  | ✓ |  |
| TK_A24 | `tK_A24` | Long Integer | 4 | Tổng số trang của tờ khai bổ sung |  |  | ✓ |  |
| TK_A25 | `tK_A25` | Long Integer | 4 | Tổng số dòng hàng của tờ khai bổ sung |  |  | ✓ |  |
| TK_ADO | `tK_ADO` | Memo | - | Lý do |  |  | ✓ |  |
| TK_ADF | `tK_ADF` | Text | 108 | Tên của người phụ trách |  |  | ✓ |  |
| TK_ADP | `tK_ADP` | Text | 108 | Tên trưởng đơn vị Hải quan |  |  | ✓ |  |
| TK_A00 | `tK_A00` | Text | 10 | Tên viết tắt Cơ quan Hải quan |  |  | ✓ |  |
</details>


<details><summary>Trường – objVN_AMA_HANG[] (120 trường · VNACCS_AMA v1.4.xlsx / VN_AMA_HANG)</summary>

| Chỉ tiêu | Key JSON | Kiểu | Độ dài | Mô tả | Bắt buộc | Req | Res | Ghi chú |
|---|---|---|---|---|---|---|---|---|
| HAG_ID | `haG_ID` | Long Integer |  | Hàng ID |  |  |  |  |
| TK_ID | `tK_ID` | Long Integer |  | Tờ khai ID |  |  |  | VN_AMA |
| HAG_RAN | `haG_RAN` | Text | 2 | Số thứ tự dòng/hàng trên tờ khai gốc |  | ✓ | ✓ |  |
| HAG_MK1 | `haG_MK1` | Text | 10 | Mã áp dụng thuế suất trước khi khai bổ sung (thuế và thu khác) |  | ✓ | ✓ |  |
| HAG_MK2 | `haG_MK2` | Text | 10 | Mã áp dụng thuế suất trước khi khai bổ sung (thuế và thu khác) |  | ✓ | ✓ |  |
| HAG_A26 | `haG_A26` | Text | 2 | Số dòng |  |  | ✓ |  |
| HAG_A28 | `haG_A28` | Text | 2 | Số thứ tự dòng/hàng trên tờ khai gốc |  |  |  |  |
| HAG_CMB | `haG_CMB` | Memo | - | Mô tả hàng hóa trước khi khai bổ sung |  | ✓ | ✓ |  |
| HAG_ORB | `haG_ORB` | Text | 2 | Mã nước xuất xứ trước khi khai bổ sung |  | ✓ | ✓ |  |
| HAG_CMA | `haG_CMA` | Memo | - | Mô tả hàng hóa sau khi khai bổ sung |  | ✓ | ✓ |  |
| HAG_ORA | `haG_ORA` | Text | 2 | Mã nước xuất xứ sau khi khai bổ sung |  | ✓ | ✓ |  |
| HAG_MK3 | `haG_MK3` | Text | 10 | Mã áp dụng thuế suất trước khi khai bổ sung (thuế và thu khác) |  | ✓ | ✓ |  |
| HAG_MKB | `haG_MKB` | Decimal | 25.4 | Trị giá tính thuế trước khi khai bổ sung |  | ✓ | ✓ |  |
| HAG_MKQ | `haG_MKQ` | Decimal | 20.4 | Số lượng tính thuế trước khi khai bổ sung |  | ✓ | ✓ |  |
| HAG_MKC | `haG_MKC` | Text | 4 | Mã đơn vị tính của số lượng tính thuếtrước khai bổ sung |  | ✓ | ✓ |  |
| HAG_MKT | `haG_MKT` | Text | 12 | Mã số hàng hóa trước khi khai bổ sung |  | ✓ | ✓ |  |
| HAG_MKR | `haG_MKR` | Text | 30 | Thuế suất trước khi khai bổ sung |  | ✓ | ✓ |  |
| HAG_MKA | `haG_MKA` | Text | 16 | Số tiền thuế trước khi khai bổ sung |  | ✓ | ✓ |  |
| HAG_A45 | `haG_A45` | Text | 1 | Hiển thị miễn thuế trước  khi khai bổ sung |  |  | ✓ |  |
| HAG_AKB | `haG_AKB` | Decimal | 25.4 | Trị giá tính thuế sau khi khai bổ sung |  | ✓ | ✓ |  |
| HAG_AKQ | `haG_AKQ` | Decimal | 20.4 | Số lượng tính thuế sau khi khai bổ sung |  | ✓ | ✓ |  |
| HAG_AKC | `haG_AKC` | Text | 4 | Mã đơn vị tính số lượng tính thuế sau khi khai bổ sung |  | ✓ | ✓ |  |
| HAG_AKT | `haG_AKT` | Text | 12 | Mã số hàng hóa sau khi khai bổ sung |  | ✓ | ✓ |  |
| HAG_AKR | `haG_AKR` | Text | 30 | Thuế suất sau khi khai bổ sung |  | ✓ | ✓ |  |
| HAG_AKA | `haG_AKA` | Text | 16 | Số tiền thuế sau khi khai bổ sung |  | ✓ | ✓ |  |
| HAG_MK4 | `haG_MK4` | Text | 10 | Mã áp dụng thuế suất trước khi khai bổ sung (thuế và thu khác) |  | ✓ | ✓ |  |
| HAG_MK5 | `haG_MK5` | Text | 10 | Mã áp dụng thuế suất trước khi khai bổ sung (thuế và thu khác) |  | ✓ | ✓ |  |
| HAG_A52 | `haG_A52` | Text | 1 | Hiển thị miễn thuế sau khi khai bổ sung |  |  | ✓ |  |
| HAG_ADC | `haG_ADC` | Text | 1 | Biểu thị số tiền tăng giảm(Thuế xuất nhập khẩu) |  |  | ✓ |  |
| HAG_A53 | `haG_A53` | Decimal | 24.4 | Số tiền tăng giảm thuế |  |  | ✓ |  |
| HAG_KD1 | `haG_KD1` | Text | 1 | Mã khoản mục tiếp nhận tổng số tiền tăng giảm thuế và thu khác |  |  | ✓ |  |
| HAG_KE1 | `haG_KE1` | Text | 27 | Tên khoản mục tiếp nhận tổng số tiền tăng giảm thuế và thu khác |  |  | ✓ |  |
| HAG_MB1 | `haG_MB1` | Decimal | 25.4 | Trị giá tính thuế trước khi khai bổ sung (thuế và thu khác) |  | ✓ | ✓ |  |
| HAG_MQ1 | `haG_MQ1` | Decimal | 20.4 | Số lượng tính thuế trước khi khai bổ sung (thuế và thu khác) |  | ✓ | ✓ |  |
| HAG_MC1 | `haG_MC1` | Text | 4 | Mã đơn vị tính số lượng tính thuế trước khi khai bổ sung (thuế và thu khác) |  | ✓ | ✓ |  |
| HAG_KI1 | `haG_KI1` | Text | 10 | Mã áp dụng thuế suất trước khi khai bổ sung ( thuế và thu khác) |  |  |  |  |
| HAG_MR1 | `haG_MR1` | Text | 25 | Thuế suất trước khi khai bổ sung (thuế và thu khác) |  | ✓ | ✓ |  |
| HAG_MA1 | `haG_MA1` | Text | 16 | Số tiền thuế trước khi khai bổ sung (thuế và thu khác) |  | ✓ | ✓ |  |
| HAG_KL1 | `haG_KL1` | Text | 1 | Hiển thị miễn thuế và thu khác trước khi khai bổ sung |  |  | ✓ |  |
| HAG_AB1 | `haG_AB1` | Decimal | 25.4 | Trị giá tính thuế sau khi khai bổ sung (thuế và thu khác) |  | ✓ | ✓ |  |
| HAG_AQ1 | `haG_AQ1` | Decimal | 20.4 | Số lượng tính thuế sau khi khai bổ sung ( thuế và thu khác) |  | ✓ | ✓ |  |
| HAG_AC1 | `haG_AC1` | Text | 4 | Mã đơn vị tính số lượng tính thuế sau khi khai bổ sung (thuế và thu khác) |  | ✓ | ✓ |  |
| HAG_AK1 | `haG_AK1` | Text | 10 | Mã áp dụng thuế suất sau khi khai bổ sung (thuế và thu khác) |  | ✓ | ✓ |  |
| HAG_AR1 | `haG_AR1` | Text | 25 | Thuế suất sau khi khai bổ sung (thuế và thu khác) |  | ✓ | ✓ |  |
| HAG_AA1 | `haG_AA1` | Text | 16 | Số tiền thuế sau khi khai bổ sung (thuế và thu khác) |  | ✓ | ✓ |  |
| HAG_KS1 | `haG_KS1` | Text | 1 | Hiển thị miễn thuế và thu khác sau khi khai bổ sung |  |  | ✓ |  |
| HAG_KV1 | `haG_KV1` | Text | 1 | Biểu thị số tiền tăng giảm( Thuế và thu khác) |  |  | ✓ |  |
| HAG_KT1 | `haG_KT1` | Decimal | 24.4 | Số tiền tăng giảm thuế và thu khác |  |  | ✓ |  |
| HAG_KD2 | `haG_KD2` | Text | 1 | Mã khoản mục tiếp nhận tổng số tiền tăng giảm thuế và thu khác |  |  | ✓ |  |
| HAG_KE2 | `haG_KE2` | Text | 27 | Tên khoản mục tiếp nhận tổng số tiền tăng giảm thuế và thu khác |  |  | ✓ |  |
| HAG_MB2 | `haG_MB2` | Decimal | 25.4 | Trị giá tính thuế trước khi khai bổ sung (thuế và thu khác) |  | ✓ | ✓ |  |
| HAG_MQ2 | `haG_MQ2` | Decimal | 20.4 | Số lượng tính thuế trước khi khai bổ sung (thuế và thu khác) |  | ✓ | ✓ |  |
| HAG_MC2 | `haG_MC2` | Text | 4 | Mã đơn vị tính số lượng tính thuế trước khi khai bổ sung (thuế và thu khác) |  | ✓ | ✓ |  |
| HAG_KI2 | `haG_KI2` | Text | 10 | Mã áp dụng thuế suất trước khi khai bổ sung ( thuế và thu khác) |  |  |  |  |
| HAG_MR2 | `haG_MR2` | Text | 25 | Thuế suất trước khi khai bổ sung (thuế và thu khác) |  | ✓ | ✓ |  |
| HAG_MA2 | `haG_MA2` | Text | 16 | Số tiền thuế trước khi khai bổ sung (thuế và thu khác) |  | ✓ | ✓ |  |
| HAG_KL2 | `haG_KL2` | Text | 1 | Hiển thị miễn thuế và thu khác trước khi khai bổ sung |  |  | ✓ |  |
| HAG_AB2 | `haG_AB2` | Decimal | 25.4 | Trị giá tính thuế sau khi khai bổ sung (thuế và thu khác) |  | ✓ | ✓ |  |
| HAG_AQ2 | `haG_AQ2` | Decimal | 20.4 | Số lượng tính thuế sau khi khai bổ sung ( thuế và thu khác) |  | ✓ | ✓ |  |
| HAG_AC2 | `haG_AC2` | Text | 4 | Mã đơn vị tính số lượng tính thuế sau khi khai bổ sung (thuế và thu khác) |  | ✓ | ✓ |  |
| HAG_AK2 | `haG_AK2` | Text | 10 | Mã áp dụng thuế suất sau khi khai bổ sung (thuế và thu khác) |  | ✓ | ✓ |  |
| HAG_AR2 | `haG_AR2` | Text | 25 | Thuế suất sau khi khai bổ sung (thuế và thu khác) |  | ✓ | ✓ |  |
| HAG_AA2 | `haG_AA2` | Text | 16 | Số tiền thuế sau khi khai bổ sung (thuế và thu khác) |  | ✓ | ✓ |  |
| HAG_KS2 | `haG_KS2` | Text | 1 | Hiển thị miễn thuế và thu khác sau khi khai bổ sung |  |  | ✓ |  |
| HAG_KV2 | `haG_KV2` | Text | 1 | Biểu thị số tiền tăng giảm( Thuế và thu khác) |  |  | ✓ |  |
| HAG_KT2 | `haG_KT2` | Decimal | 24.4 | Số tiền tăng giảm thuế và thu khác |  |  | ✓ |  |
| HAG_KD3 | `haG_KD3` | Text | 1 | Mã khoản mục tiếp nhận tổng số tiền tăng giảm thuế và thu khác |  |  | ✓ |  |
| HAG_KE3 | `haG_KE3` | Text | 27 | Tên khoản mục tiếp nhận tổng số tiền tăng giảm thuế và thu khác |  |  | ✓ |  |
| HAG_MB3 | `haG_MB3` | Decimal | 25.4 | Trị giá tính thuế trước khi khai bổ sung (thuế và thu khác) |  | ✓ | ✓ |  |
| HAG_MQ3 | `haG_MQ3` | Decimal | 20.4 | Số lượng tính thuế trước khi khai bổ sung (thuế và thu khác) |  | ✓ | ✓ |  |
| HAG_MC3 | `haG_MC3` | Text | 4 | Mã đơn vị tính số lượng tính thuế trước khi khai bổ sung (thuế và thu khác) |  | ✓ | ✓ |  |
| HAG_KI3 | `haG_KI3` | Text | 10 | Mã áp dụng thuế suất trước khi khai bổ sung ( thuế và thu khác) |  |  |  |  |
| HAG_MR3 | `haG_MR3` | Text | 25 | Thuế suất trước khi khai bổ sung (thuế và thu khác) |  | ✓ | ✓ |  |
| HAG_MA3 | `haG_MA3` | Text | 16 | Số tiền thuế trước khi khai bổ sung (thuế và thu khác) |  | ✓ | ✓ |  |
| HAG_KL3 | `haG_KL3` | Text | 1 | Hiển thị miễn thuế và thu khác trước khi khai bổ sung |  |  | ✓ |  |
| HAG_AB3 | `haG_AB3` | Decimal | 25.4 | Trị giá tính thuế sau khi khai bổ sung (thuế và thu khác) |  | ✓ | ✓ |  |
| HAG_AQ3 | `haG_AQ3` | Decimal | 20.4 | Số lượng tính thuế sau khi khai bổ sung ( thuế và thu khác) |  | ✓ | ✓ |  |
| HAG_AC3 | `haG_AC3` | Text | 4 | Mã đơn vị tính số lượng tính thuế sau khi khai bổ sung (thuế và thu khác) |  | ✓ | ✓ |  |
| HAG_AK3 | `haG_AK3` | Text | 10 | Mã áp dụng thuế suất sau khi khai bổ sung (thuế và thu khác) |  | ✓ | ✓ |  |
| HAG_AR3 | `haG_AR3` | Text | 25 | Thuế suất sau khi khai bổ sung (thuế và thu khác) |  | ✓ | ✓ |  |
| HAG_AA3 | `haG_AA3` | Text | 16 | Số tiền thuế sau khi khai bổ sung (thuế và thu khác) |  | ✓ | ✓ |  |
| HAG_KS3 | `haG_KS3` | Text | 1 | Hiển thị miễn thuế và thu khác sau khi khai bổ sung |  |  | ✓ |  |
| HAG_KV3 | `haG_KV3` | Text | 1 | Biểu thị số tiền tăng giảm( Thuế và thu khác) |  |  | ✓ |  |
| HAG_KT3 | `haG_KT3` | Decimal | 24.4 | Số tiền tăng giảm thuế và thu khác |  |  | ✓ |  |
| HAG_KD4 | `haG_KD4` | Text | 1 | Mã khoản mục tiếp nhận tổng số tiền tăng giảm thuế và thu khác |  |  | ✓ |  |
| HAG_KE4 | `haG_KE4` | Text | 27 | Tên khoản mục tiếp nhận tổng số tiền tăng giảm thuế và thu khác |  |  | ✓ |  |
| HAG_MB4 | `haG_MB4` | Decimal | 25.4 | Trị giá tính thuế trước khi khai bổ sung (thuế và thu khác) |  | ✓ | ✓ |  |
| HAG_MQ4 | `haG_MQ4` | Decimal | 20.4 | Số lượng tính thuế trước khi khai bổ sung (thuế và thu khác) |  | ✓ | ✓ |  |
| HAG_MC4 | `haG_MC4` | Text | 4 | Mã đơn vị tính số lượng tính thuế trước khi khai bổ sung (thuế và thu khác) |  | ✓ | ✓ |  |
| HAG_KI4 | `haG_KI4` | Text | 10 | Mã áp dụng thuế suất trước khi khai bổ sung ( thuế và thu khác) |  |  |  |  |
| HAG_MR4 | `haG_MR4` | Text | 25 | Thuế suất trước khi khai bổ sung (thuế và thu khác) |  | ✓ | ✓ |  |
| HAG_MA4 | `haG_MA4` | Text | 16 | Số tiền thuế trước khi khai bổ sung (thuế và thu khác) |  | ✓ | ✓ |  |
| HAG_KL4 | `haG_KL4` | Text | 1 | Hiển thị miễn thuế và thu khác trước khi khai bổ sung |  |  | ✓ |  |
| HAG_AB4 | `haG_AB4` | Decimal | 25.4 | Trị giá tính thuế sau khi khai bổ sung (thuế và thu khác) |  | ✓ | ✓ |  |
| HAG_AQ4 | `haG_AQ4` | Decimal | 20.4 | Số lượng tính thuế sau khi khai bổ sung ( thuế và thu khác) |  | ✓ | ✓ |  |
| HAG_AC4 | `haG_AC4` | Text | 4 | Mã đơn vị tính số lượng tính thuế sau khi khai bổ sung (thuế và thu khác) |  | ✓ | ✓ |  |
| HAG_AK4 | `haG_AK4` | Text | 10 | Mã áp dụng thuế suất sau khi khai bổ sung (thuế và thu khác) |  | ✓ | ✓ |  |
| HAG_AR4 | `haG_AR4` | Text | 25 | Thuế suất sau khi khai bổ sung (thuế và thu khác) |  | ✓ | ✓ |  |
| HAG_AA4 | `haG_AA4` | Text | 16 | Số tiền thuế sau khi khai bổ sung (thuế và thu khác) |  | ✓ | ✓ |  |
| HAG_KS4 | `haG_KS4` | Text | 1 | Hiển thị miễn thuế và thu khác sau khi khai bổ sung |  |  | ✓ |  |
| HAG_KV4 | `haG_KV4` | Text | 1 | Biểu thị số tiền tăng giảm( Thuế và thu khác) |  |  | ✓ |  |
| HAG_KT4 | `haG_KT4` | Decimal | 24.4 | Số tiền tăng giảm thuế và thu khác |  |  | ✓ |  |
| HAG_KD5 | `haG_KD5` | Text | 1 | Mã khoản mục tiếp nhận tổng số tiền tăng giảm thuế và thu khác |  |  | ✓ |  |
| HAG_KE5 | `haG_KE5` | Text | 27 | Tên khoản mục tiếp nhận tổng số tiền tăng giảm thuế và thu khác |  |  | ✓ |  |
| HAG_MB5 | `haG_MB5` | Decimal | 25.4 | Trị giá tính thuế trước khi khai bổ sung (thuế và thu khác) |  | ✓ | ✓ |  |
| HAG_MQ5 | `haG_MQ5` | Decimal | 20.4 | Số lượng tính thuế trước khi khai bổ sung (thuế và thu khác) |  | ✓ | ✓ |  |
| HAG_MC5 | `haG_MC5` | Text | 4 | Mã đơn vị tính số lượng tính thuế trước khi khai bổ sung (thuế và thu khác) |  | ✓ | ✓ |  |
| HAG_KI5 | `haG_KI5` | Text | 10 | Mã áp dụng thuế suất trước khi khai bổ sung ( thuế và thu khác) |  |  |  |  |
| HAG_MR5 | `haG_MR5` | Text | 25 | Thuế suất trước khi khai bổ sung (thuế và thu khác) |  | ✓ | ✓ |  |
| HAG_MA5 | `haG_MA5` | Text | 16 | Số tiền thuế trước khi khai bổ sung (thuế và thu khác) |  | ✓ | ✓ |  |
| HAG_KL5 | `haG_KL5` | Text | 1 | Hiển thị miễn thuế và thu khác trước khi khai bổ sung |  |  | ✓ |  |
| HAG_AB5 | `haG_AB5` | Decimal | 25.4 | Trị giá tính thuế sau khi khai bổ sung (thuế và thu khác) |  | ✓ | ✓ |  |
| HAG_AQ5 | `haG_AQ5` | Decimal | 20.4 | Số lượng tính thuế sau khi khai bổ sung ( thuế và thu khác) |  | ✓ | ✓ |  |
| HAG_AC5 | `haG_AC5` | Text | 4 | Mã đơn vị tính số lượng tính thuế sau khi khai bổ sung (thuế và thu khác) |  | ✓ | ✓ |  |
| HAG_AK5 | `haG_AK5` | Text | 10 | Mã áp dụng thuế suất sau khi khai bổ sung (thuế và thu khác) |  | ✓ | ✓ |  |
| HAG_AR5 | `haG_AR5` | Text | 25 | Thuế suất sau khi khai bổ sung (thuế và thu khác) |  | ✓ | ✓ |  |
| HAG_AA5 | `haG_AA5` | Text | 16 | Số tiền thuế sau khi khai bổ sung (thuế và thu khác) |  | ✓ | ✓ |  |
| HAG_KS5 | `haG_KS5` | Text | 1 | Hiển thị miễn thuế và thu khác sau khi khai bổ sung |  |  | ✓ |  |
| HAG_KV5 | `haG_KV5` | Text | 1 | Biểu thị số tiền tăng giảm( Thuế và thu khác) |  |  | ✓ |  |
| HAG_KT5 | `haG_KT5` | Decimal | 24.4 | Số tiền tăng giảm thuế và thu khác |  |  | ✓ |  |
</details>


<details><summary>Trường – objVN_AMA_TRANGTHAI (chỉ phản hồi) (4 trường · VNACCS_AMA v1.4.xlsx / VN_AMA_TRANGTHAI)</summary>

| Chỉ tiêu | Key JSON | Kiểu | Độ dài | Mô tả | Bắt buộc | Req | Res | Ghi chú |
|---|---|---|---|---|---|---|---|---|
| TK_ID | `tK_ID` | Long Integer | 4 | Tờ khai ID |  |  |  | VN_AMA |
| TK_THOIGIANCAPPHEP | `tK_THOIGIANCAPPHEP` | Date/Time | 8 | Thời gian cấp phép |  |  |  |  |
| TK_TRANGTHAI | `tK_TRANGTHAI` | Text | 255 | Trạng thái tờ khai ID |  |  |  | VN_A_TK_TRANGTHAI |
| TK_KETQUAXYLY | `tK_KETQUAXYLY` | Long Integer | 4 | 0: Chưa duyệt<br>1: Đã duyệt |  |  |  |  |
</details>


#### AMB – Gọi tờ khai bổ sung đã khai tạm để sửa

- **Endpoint**: `POST {{FPT_BASE_URL}}/api/AMB` · xác thực: Bearer token (từ /api/auth/login)
- **Mục đích**: Lấy lại tờ khai bổ sung (VAL8010) để sửa rồi gửi AMA lại.
- **Khi nào gọi**: Sau AMA, trước AMC.
- **Bước tiếp theo**: AMA
- **Body**: Tài khoản VNACCS + `tK_SYN` (số tờ khai bổ sung, number).
- **Phản hồi**: envelope, dữ liệu ở `objAMA`
- **Mã thông điệp**: `VAL8010` Khai Báo Trước Thông Tin Sửa Đổi (C)

<details><summary>Body mẫu (Postman, đã che mật khẩu, cắt base64) – đầy đủ: samples/AMB.request.json</summary>

```json
{
  "objVNACCS_ACCOUNT": {
    "useR_ID": "***",
    "password": "***",
    "terminaL_ID": "***",
    "terminaL_ACCESS_KEY": "***"
  },
  "tK_SYN": 0
}
```
</details>


#### AMC – Đăng ký tờ khai bổ sung (chính thức)

- **Endpoint**: `POST {{FPT_BASE_URL}}/api/AMC` · xác thực: Bearer token (từ /api/auth/login)
- **Mục đích**: Đăng ký tờ khai bổ sung (VAL8020). Kết quả Hải quan: VAL8030/8040 (giảm/tăng thuế), VAL8050 (chấp nhận, không đổi thuế), VAL8060 (không chấp nhận).
- **Khi nào gọi**: Sau AMA.
- **Bước tiếp theo**: VNACCSREP
- **Body**: Tài khoản VNACCS + `tK_SYN`.
- **Phản hồi**: envelope, dữ liệu ở `objAMA`
- **Mã thông điệp**: `VAL8020` Tờ khai bổ sung sau thông quan (đã đăng ký) (P); `VAL8030` Tờ khai bổ sung sau thông quan (được chấp nhận) (P); `VAL8040` Tờ khai bổ sung sau thông quan (được chấp nhận) (P); `VAL8050` Tờ khai bổ sung sau thông quan (được chấp nhận) (P); `VAL8060` Tờ khai bổ sung sau thông quan (thông báo không chấp nhận) (P)

<details><summary>Body mẫu (Postman, đã che mật khẩu, cắt base64) – đầy đủ: samples/AMC.request.json</summary>

```json
{
  "objVNACCS_ACCOUNT": {
    "useR_ID": "***",
    "password": "***",
    "terminaL_ID": "***",
    "terminaL_ACCESS_KEY": "***"
  },
  "tK_SYN": 730276752550
}
```
</details>


### Hồ sơ đính kèm & chứng từ bổ sung

#### KyFile – Ký số file đính kèm

- **Endpoint**: `POST {{FPT_BASE_URL}}/api/KyFile` · xác thực: Bearer token (từ /api/auth/login)
- **Mục đích**: Gửi file (base64) để hệ thống ký số theo mã doanh nghiệp trước khi đính kèm (HYS / chứng từ V5).
- **Khi nào gọi**: Trước hys/V5 khi file cần chữ ký số của doanh nghiệp.
- **Bước tiếp theo**: hys
- **Body**: `mA_DV` (MST), `useR_ID` (user VNACCS), `filE_TEN`, `filE_BASE64`. Không có tài khoản VNACCS đầy đủ trong body.
- **Ghi chú phản hồi**: Chưa có mẫu phản hồi – dự kiến trả file đã ký (base64). Cần FPT xác nhận.

<details><summary>Body mẫu (Postman, đã che mật khẩu, cắt base64) – đầy đủ: samples/KyFile.request.json</summary>

```json
{
  "mA_DV": "4100811111001",
  "useR_ID": "***",
  "filE_TEN": "HC YG25080-1.pdf",
  "filE_BASE64": "JVBERi0xLjQKJeLjz9MKMSAwIG9iago8PAovVGl0…(base64/chuỗi dài 195808 ký tự)"
}
```
</details>


#### hys – Khai hồ sơ đính kèm điện tử (HYS)

- **Endpoint**: `POST {{FPT_BASE_URL}}/api/hys` · xác thực: Bearer token (từ /api/auth/login)
- **Mục đích**: Gửi file đính kèm theo phân loại thủ tục (tK_TSB: A01 tờ khai trị giá, A02 danh sách container…). Hải quan trả số tiếp nhận tK_JNO (12 số) để ghi vào ô đính kèm của tờ khai. REP_VNACCS: VAL0020.
- **Khi nào gọi**: Trước IDA/EDA (số HYS ghi vào chỉ tiêu đính kèm), hoặc khi Hải quan yêu cầu.
- **Body**: Danh sách file theo Excel là `lisT_FILE` (LIST_FILE) – Postman ghi `objVN_HYS.lisT_FILE_HYS` nhưng Postman có thể cũ, **theo Excel**. Mỗi file < 2MB. Đường dẫn Postman viết thường `/api/hys` (server không phân biệt hoa thường).
- **Phản hồi**: envelope, dữ liệu ở `vaL0020`
- **Mã thông điệp**: `VAL0020` Bản lưu thông tin tờ khai phổ thông (P)

<details><summary>Body mẫu (Postman, đã che mật khẩu, cắt base64) – đầy đủ: samples/hys.request.json</summary>

```json
{
  "objVNACCS_ACCOUNT": {
    "useR_ID": "***",
    "password": "***",
    "terminaL_ID": "***",
    "terminaL_ACCESS_KEY": "***"
  },
  "objVN_HYS": {
    "tK_TNM": "Danh sách container chất lên tàu",
    "tK_SNM": "Nguyễn Duy Hoà",
    "tK_SAD": "TỔ 7, KHU PHỐ CÔNG CHÁNH",
    "tK_CH": "60CB",
    "tK_CHB": "00",
    "tK_TSB": "A02",
    "tK_STL": "",
    "tK_REF": "",
    "tK_KJJ": "",
    "lisT_FILE_HYS": [
      {
        "filE_NAME": "TEST.XLSX",
        "filE_BASE64": "UEsDBBQABgAIAAAAIQDIo800dgEAAAQFAAATAN0B…(base64/chuỗi dài 99920 ký tự)"
      }
    ]
  }
}
```
</details>


<details><summary>Trường – objVN_HYS (16 trường · VNACCS_HYS v1.2.xlsx / HYS)</summary>

| Chỉ tiêu | Key JSON | Kiểu | Độ dài | Mô tả | Bắt buộc | Req | Res | Ghi chú |
|---|---|---|---|---|---|---|---|---|
| USER_ID | `useR_ID` | Text | 50 | Tài khoản vnaccs | ✓ | ✓ | ✓ |  |
| PASSWORD | `password` | Text | 50 | Tài khoản vnaccs | ✓ | ✓ | ✓ |  |
| TERMINAL_ID | `terminaL_ID` | Text | 50 | Tài khoản vnaccs | ✓ | ✓ | ✓ |  |
| TERMINAL_ACCESS_KEY | `terminaL_ACCESS_KEY` | Text | 50 | Tài khoản vnaccs | ✓ | ✓ | ✓ |  |
| TK_CH | `tK_CH` | Text | 6 | Mã chi cục | ✓ | ✓ | ✓ |  |
| TK_CHB | `tK_CHB` | Text | 2 | Mã đội thủ tục |  | ✓ | ✓ |  |
| TK_TSB | `tK_TSB` | Text | 3 | Phân loại thủ tục | ✓ | ✓ | ✓ |  |
| TK_STL | `tK_STL` | Text | 20 | Số điện thoại |  | ✓ | ✓ |  |
| TK_REF | `tK_REF` | Text | 20 | Số quản lý nội bộ |  | ✓ | ✓ |  |
| TK_KJJ | `tK_KJJ` | Text | 332 | Ghi chú |  | ✓ | ✓ |  |
| LIST_FILE | `lisT_FILE` | List |  | List file đính kèm (dung lượng nhỏ hơn 2mb) | ✓ | ✓ |  |  |
| TK_JNO | `tK_JNO` | Text | 12 | Số tiếp nhận đính kèm HYS |  |  | ✓ |  |
| TK_TNM | `tK_TNM` | Text | 70 | Tên thủ tục |  |  | ✓ |  |
| TK_YMD | `tK_YMD` | Datetime | 8 | Ngày tiếp nhận |  |  | ✓ |  |
| TK_SNM | `tK_SNM` | Text | 100 | Tên công ty |  |  | ✓ |  |
| TK_SAD | `tK_SAD` | Text | 100 | Địa chỉ công ty |  |  | ✓ |  |

Danh mục / ghi chú kèm theo: Danh mục TK_TSB (Phân loại thủ tục); Mã – Tên; A01 – Tờ khai trị giá đính kèm; A02 – Danh sách conternai chất lên tàu; A03 – Danh mục máy móc thiết bị đồng bộ; A04 – DM vật tư, thiết bị NK đóng mới, sửa chữa, bảo dưỡng đầu máy, toa xe; A05 – DM vật tư, thiết bị NK phục vụ sản xuất sản phẩm cơ khí trọng điểm; A06 – Chứng thư bảo lãnh chung trong khai báo xuất nhập khẩu; A08 – Chứng thu bảo lãnh riêng trong khai báo xuất nhập khẩu; A12 – Quyết định giảm thuế; A13 – Tờ khai khoản thu đóng góp bắt buộc; A20 – Hợp đồng thuê kho ngoại quan; A21 – Quyết định buộc tái xuất của cơ quan có thẩm quyền; A22 – Các thông tin liên quan đến vận chuyển kết hợp phải khai đính kèm theo hướng dẫn; A30 – Thông tin phương tiện giao thông đường bộ nhập khẩu; A99 – Loại khác
</details>


<details><summary>Trường – lisT_FILE_HYS[] (2 trường · VNACCS_HYS v1.2.xlsx / LIST_FILE)</summary>

| Chỉ tiêu | Key JSON | Kiểu | Độ dài | Mô tả | Bắt buộc | Req | Res | Ghi chú |
|---|---|---|---|---|---|---|---|---|
| FILE_NAME | `filE_NAME` | Text | 255 | Tên file | ✓ |  |  |  |
| FILE_BASE64 | `filE_BASE64` | Text | max | Base64 | ✓ |  |  |  |
</details>


#### V5Bill – Bổ sung chứng từ – Vận đơn

- **Endpoint**: `POST {{FPT_BASE_URL}}/api/V5Bill` · xác thực: Bearer token (từ /api/auth/login)
- **Mục đích**: Đính kèm vận đơn (file + thông tin) cho tờ khai đã có số. Phản hồi REF_ID để hỏi kết quả.
- **Khi nào gọi**: Sau khi tờ khai có số (IDA/EDA/AMA).
- **Bước tiếp theo**: V5Response
- **Body**: Key trong Postman viết HOA (VD_SO, TK_SOTK…) khác các API khác (camel kiểu tK_…) – server .NET thường không phân biệt hoa thường, nhưng nên gửi đúng như mẫu.

<details><summary>Body mẫu (Postman, đã che mật khẩu, cắt base64) – đầy đủ: samples/V5Bill.request.json</summary>

```json
{
  "VD_SO": "TEST",
  "VD_NGAY": "10/11/2024",
  "VD_LOAI": "1",
  "VD_NUOCCAPCO": "VN",
  "VD_DDCHUYENTAI_QUACANH": "",
  "VD_GHICHU": "",
  "VD_FILE": "UEsDBBQABgAIAHULRFexzfyiiAEAAPIGAAATAN0B…(base64/chuỗi dài 27892 ký tự)",
  "VD_NAME": "TEST.XLSX",
  "MA_DV": "0101020683",
  "TEN_DV": "0101020683",
  "TK_MAHQ": "60CB",
  "TK_SOTK": "102569571230",
  "TK_NGAYDK": "10/11/2024",
  "TK_MALH": "A11",
  "MA_DAI_LY": "",
  "TEN_DAI_LY": "",
  "TK_LOAI": "1",
  "USER_ID": "***"
}
```
</details>


<details><summary>Trường – Body (18 trường · BO SUNG CHUNG TU v1.4.xlsx / VẬN ĐƠN)</summary>

| Chỉ tiêu | Key JSON | Kiểu | Độ dài | Mô tả | Bắt buộc | Req | Res | Ghi chú |
|---|---|---|---|---|---|---|---|---|
| VD_SO | `vD_SO` | Text(35) |  | Số vận đơn | ✓ |  |  |  |
| VD_NGAY | `vD_NGAY` | Datetime |  | Ngày vận đơn | ✓ |  |  | dd/MM/yyyy |
| VD_LOAI | `vD_LOAI` | Text(1) |  | Loại vận đơn | ✓ |  |  | 1: Đường Biển<br>2: Đường Không<br>3: Đường Bộ<br>4: Đường Sắt<br>5: Đường Sông<br>9:Loại khác |
| VD_NUOCCAPCO | `vD_NUOCCAPCO` | Text(2) |  | Nước phát hành vận đơn | ✓ |  |  | Nuoc.xls |
| VD_DDCHUYENTAI_QUACANH | `vD_DDCHUYENTAI_QUACANH` | Text(200) |  | Địa điểm chuyển tải quá cảnh |  |  |  |  |
| VD_GHICHU | `vD_GHICHU` | Text(255) |  | Ghi chú |  |  |  |  |
| VD_FILE | `vD_FILE` | base64 |  | File đính kèm | ✓ |  |  | pdf, xlsx, docx dưới 1mb |
| VD_NAME | `vD_NAME` | Text(50) |  | Tên file đính kèm | ✓ |  |  |  |
| MA_DV | `mA_DV` | Text(13) |  | Mã số thuế khai báo | ✓ |  |  |  |
| TEN_DV | `teN_DV` | Text(200) |  | Tên doanh nghiệp khai báo | ✓ |  |  |  |
| TK_MAHQ | `tK_MAHQ` | Text(4) |  | Mã chi cục Hải quan khai báo | ✓ |  |  |  |
| TK_SOTK | `tK_SOTK` | Text(12) |  | Số tờ khai VNACCS | ✓ |  |  |  |
| TK_NGAYDK | `tK_NGAYDK` | Datetime |  | Ngày đăng ký tờ khai | ✓ |  |  | dd/MM/yyyy |
| TK_MALH | `tK_MALH` | Text(5) |  | Mã loại hình tờ khai | ✓ |  |  |  |
| MA_DAI_LY | `mA_DAI_LY` | Text(13) |  | Mã số thuế đại lý đại diện khai báo |  |  |  | Dùng chữ ký số đại lý khai cho doanh nghiệp |
| TEN_DAI_LY | `teN_DAI_LY` | Text(200) |  | Tên đại lý đại diện khai báo |  |  |  | Dùng chữ ký số đại lý khai cho doanh nghiệp |
| TK_LOAI | `tK_LOAI` | Text(1) |  | Loại tờ khai VNACCS |  |  |  | 1: IDA,EDA<br>2: AMA<br>3: TEA |
| USER_ID | `useR_ID` | Text(10) |  | User id tài khoản vnaccs |  |  |  |  |
</details>


#### V5Invoice – Bổ sung chứng từ – Hóa đơn

- **Endpoint**: `POST {{FPT_BASE_URL}}/api/V5Invoice` · xác thực: Bearer token (từ /api/auth/login) · ⚠️ không có trong Postman (theo Excel)
- **Mục đích**: Đính kèm hóa đơn cho tờ khai đã có số.
- **Khi nào gọi**: Sau khi tờ khai có số.
- **Bước tiếp theo**: V5Response

<details><summary>Trường – Body (15 trường · BO SUNG CHUNG TU v1.4.xlsx / HÓA ĐƠN)</summary>

| Chỉ tiêu | Key JSON | Kiểu | Độ dài | Mô tả | Bắt buộc | Req | Res | Ghi chú |
|---|---|---|---|---|---|---|---|---|
| HDN_SO | `hdN_SO` | Text(35) |  | Số hóa đơn | ✓ |  |  |  |
| HDN_NGAYPH | `hdN_NGAYPH` | Datetime |  | Ngày hóa đơn | ✓ |  |  | dd/MM/yyyy |
| HDN_GHICHU | `hdN_GHICHU` | Text(200) |  | Ghi chú |  |  |  |  |
| HDN_FILE | `hdN_FILE` | base64 |  | File đính kèm | ✓ |  |  | pdf, xlsx, docx dưới 1mb |
| HDN_NAME | `hdN_NAME` | Text(50) |  | Tên file đính kèm | ✓ |  |  |  |
| MA_DV | `mA_DV` | Text(13) |  | Mã số thuế khai báo | ✓ |  |  |  |
| TEN_DV | `teN_DV` | Text(200) |  | Tên doanh nghiệp khai báo | ✓ |  |  |  |
| TK_MAHQ | `tK_MAHQ` | Text(4) |  | Mã chi cục Hải quan khai báo | ✓ |  |  |  |
| TK_SOTK | `tK_SOTK` | Text(12) |  | Số tờ khai VNACCS | ✓ |  |  |  |
| TK_NGAYDK | `tK_NGAYDK` | Datetime |  | Ngày đăng ký tờ khai | ✓ |  |  | dd/MM/yyyy |
| TK_MALH | `tK_MALH` | Text(5) |  | Mã loại hình tờ khai | ✓ |  |  |  |
| MA_DAI_LY | `mA_DAI_LY` | Text(13) |  | Mã số thuế đại lý đại diện khai báo |  |  |  | Dùng chữ ký số đại lý khai cho doanh nghiệp |
| TEN_DAI_LY | `teN_DAI_LY` | Text(200) |  | Tên đại lý đại diện khai báo |  |  |  | Dùng chữ ký số đại lý khai cho doanh nghiệp |
| TK_LOAI | `tK_LOAI` | Text(1) |  | Loại tờ khai VNACCS |  |  |  | 1: IDA,EDA<br>2: AMA<br>3: TEA |
| USER_ID | `useR_ID` | Text(10) |  | User id tài khoản vnaccs |  |  |  |  |
</details>


#### V5Permit – Bổ sung chứng từ – Giấy phép

- **Endpoint**: `POST {{FPT_BASE_URL}}/api/V5Permit` · xác thực: Bearer token (từ /api/auth/login) · ⚠️ không có trong Postman (theo Excel)
- **Mục đích**: Đính kèm giấy phép.
- **Khi nào gọi**: Sau khi tờ khai có số.
- **Bước tiếp theo**: V5Response

<details><summary>Trường – Body (19 trường · BO SUNG CHUNG TU v1.4.xlsx / GIẤY PHÉP)</summary>

| Chỉ tiêu | Key JSON | Kiểu | Độ dài | Mô tả | Bắt buộc | Req | Res | Ghi chú |
|---|---|---|---|---|---|---|---|---|
| GP_SO | `gP_SO` | Text(35) |  | Số giấy phép | ✓ |  |  |  |
| GP_NGAYCAP | `gP_NGAYCAP` | Datetime |  | Ngày cấp | ✓ |  |  | dd/MM/yyyy |
| GP_NGAYHH | `gP_NGAYHH` | Datetime |  | Ngày hết hạn | ✓ |  |  | dd/MM/yyyy |
| GP_NGUOICAP | `gP_NGUOICAP` | Text(50) |  | Người cấp | ✓ |  |  |  |
| LOAI_MA | `loaI_MA` | Text(10) |  | Loại giấy giấy phép | ✓ |  |  | 811: Giap phép xuất khẩu<br>911: Giấy phép nhập khẩu |
| GP_NOICAP | `gP_NOICAP` | Text(200) |  | Nơi cấp giấy phép | ✓ |  |  |  |
| GP_GHICHU | `gP_GHICHU` | Text(255) |  | Ghi chú |  |  |  |  |
| GP_FILE | `gP_FILE` | base64 |  | File đính kèm | ✓ |  |  | pdf, xlsx, docx dưới 1mb |
| GP_NAME | `gP_NAME` | Text(50) |  | Tên file đính kèm | ✓ |  |  |  |
| MA_DV | `mA_DV` | Text(13) |  | Mã số thuế khai báo | ✓ |  |  |  |
| TEN_DV | `teN_DV` | Text(200) |  | Tên doanh nghiệp khai báo | ✓ |  |  |  |
| TK_MAHQ | `tK_MAHQ` | Text(4) |  | Mã chi cục Hải quan khai báo | ✓ |  |  |  |
| TK_SOTK | `tK_SOTK` | Text(12) |  | Số tờ khai VNACCS | ✓ |  |  |  |
| TK_NGAYDK | `tK_NGAYDK` | Datetime |  | Ngày đăng ký tờ khai | ✓ |  |  | dd/MM/yyyy |
| TK_MALH | `tK_MALH` | Text(5) |  | Mã loại hình tờ khai | ✓ |  |  |  |
| MA_DAI_LY | `mA_DAI_LY` | Text(13) |  | Mã số thuế đại lý đại diện khai báo |  |  |  | Dùng chữ ký số đại lý khai cho doanh nghiệp |
| TEN_DAI_LY | `teN_DAI_LY` | Text(200) |  | Tên đại lý đại diện khai báo |  |  |  | Dùng chữ ký số đại lý khai cho doanh nghiệp |
| TK_LOAI | `tK_LOAI` | Text(1) |  | Loại tờ khai VNACCS |  |  |  | 1: IDA,EDA<br>2: AMA<br>3: TEA |
| USER_ID | `useR_ID` | Text(10) |  | User id tài khoản vnaccs |  |  |  |  |
</details>


#### V5Contract – Bổ sung chứng từ – Hợp đồng

- **Endpoint**: `POST {{FPT_BASE_URL}}/api/V5Contract` · xác thực: Bearer token (từ /api/auth/login) · ⚠️ không có trong Postman (theo Excel)
- **Mục đích**: Đính kèm hợp đồng.
- **Khi nào gọi**: Sau khi tờ khai có số.
- **Bước tiếp theo**: V5Response

<details><summary>Trường – Body (17 trường · BO SUNG CHUNG TU v1.4.xlsx / HỢP ĐỒNG)</summary>

| Chỉ tiêu | Key JSON | Kiểu | Độ dài | Mô tả | Bắt buộc | Req | Res | Ghi chú |
|---|---|---|---|---|---|---|---|---|
| HD_SO | `hD_SO` | Text(35) |  | Số hợp đồng | ✓ |  |  |  |
| HD_NGAY_KY | `hD_NGAY_KY` | Datetime |  | Ngày ký hợp đồng | ✓ |  |  | dd/MM/yyyy |
| HD_NGAYHH | `hD_NGAYHH` | Datetime |  | Hạn thanh toán | ✓ |  |  | dd/MM/yyyy |
| HD_TONG_TRIGIA | `hD_TONG_TRIGIA` | Float |  | Tổng trị giá | ✓ |  |  |  |
| HD_GHICHU | `hD_GHICHU` | Text(200) |  | Ghi chú |  |  |  |  |
| HD_FILE | `hD_FILE` | base64 |  | File đính kèm | ✓ |  |  | pdf, xlsx, docx dưới 1mb |
| HD_NAME | `hD_NAME` | Text(50) |  | Tên file đính kèm | ✓ |  |  |  |
| MA_DV | `mA_DV` | Text(13) |  | Mã số thuế khai báo | ✓ |  |  |  |
| TEN_DV | `teN_DV` | Text(200) |  | Tên doanh nghiệp khai báo | ✓ |  |  |  |
| TK_MAHQ | `tK_MAHQ` | Text(4) |  | Mã chi cục Hải quan khai báo | ✓ |  |  |  |
| TK_SOTK | `tK_SOTK` | Text(12) |  | Số tờ khai VNACCS | ✓ |  |  |  |
| TK_NGAYDK | `tK_NGAYDK` | Datetime |  | Ngày đăng ký tờ khai | ✓ |  |  | dd/MM/yyyy |
| TK_MALH | `tK_MALH` | Text(5) |  | Mã loại hình tờ khai | ✓ |  |  |  |
| MA_DAI_LY | `mA_DAI_LY` | Text(13) |  | Mã số thuế đại lý đại diện khai báo |  |  |  | Dùng chữ ký số đại lý khai cho doanh nghiệp |
| TEN_DAI_LY | `teN_DAI_LY` | Text(200) |  | Tên đại lý đại diện khai báo |  |  |  | Dùng chữ ký số đại lý khai cho doanh nghiệp |
| TK_LOAI | `tK_LOAI` | Text(1) |  | Loại tờ khai VNACCS |  |  |  | 1: IDA,EDA<br>2: AMA<br>3: TEA |
| USER_ID | `useR_ID` | Text(10) |  | User id tài khoản vnaccs |  |  |  |  |
</details>


#### V5Co – Bổ sung chứng từ – C/O

- **Endpoint**: `POST {{FPT_BASE_URL}}/api/V5Co` · xác thực: Bearer token (từ /api/auth/login) · ⚠️ không có trong Postman (theo Excel)
- **Mục đích**: Đính kèm giấy chứng nhận xuất xứ.
- **Khi nào gọi**: Sau khi tờ khai có số.
- **Bước tiếp theo**: V5Response

<details><summary>Trường – Body (19 trường · BO SUNG CHUNG TU v1.4.xlsx / CO)</summary>

| Chỉ tiêu | Key JSON | Kiểu | Độ dài | Mô tả | Bắt buộc | Req | Res | Ghi chú |
|---|---|---|---|---|---|---|---|---|
| CO_SO | `cO_SO` | Text(35) |  | Số CO | ✓ |  |  |  |
| CO_NGAYCAP | `cO_NGAYCAP` | Datetime |  | Ngày cấp CO | ✓ |  |  | dd/MM/yyyy |
| LOAI_MA | `loaI_MA` | Text(5) |  | Loại CO | ✓ |  |  | D: Hiệp định Thương mại hàng hóa ASEAN (ATIGA)<br>E: Khu vực Mậu dịch Tự do ASEAN - Trung Quốc<br>AK: Khu vực Mậu dịch Tự do ASEAN - Hàn Quốc<br>AANZ: Hiệp định Khu vực Thương mại tự do ASEAN - Úc - Niu Di lân<br>AI: Hiệp định Thương mại Hàng hoá ASEAN - Ấn Độ<br>AJ: Hiệp định Đối tác kinh tế toàn diện ASEAN - Nhật Bản<br>JV: Hiệp định đối tác kinh tế Việt Nam - Nhật Bản<br>S: Áp dụng đối với các mặt hàng được áp dụng ưu đãi thuế suất thuế nhập khẩu Việt - Lào<br>X: Áp dụng đối với hàng hoá có xuất xứ Campuchia<br>VC: Hiệp định Thương mại tự do Việt Nam - Chi Lê<br>KV: Hiệp định Thương mại tự do Việt Nam - Hàn Quốc<br>EAV: Hiệp định Thương mại tự do Việt Nam - Liên minh kinh tế Á-Âu và các nước thành viên<br>861: Loại khác |
| CO_NUOCCAP | `cO_NUOCCAP` | Text(2) |  | Nước phát hành | ✓ |  |  | Nuoc.xls |
| CO_TOCHUCCAP | `cO_TOCHUCCAP` | Text(100) |  | Tổ chức cấp | ✓ |  |  |  |
| CO_NGUOICAP | `cO_NGUOICAP` | Text(100) |  | Người cấp | ✓ |  |  |  |
| CO_GHICHU | `cO_GHICHU` | Text(200) |  | Ghi chú |  |  |  |  |
| CO_FILE | `cO_FILE` | base64 |  | File đính kèm | ✓ |  |  | pdf, xlsx, docx dưới 1mb |
| CO_NAME | `cO_NAME` | Text(50) |  | Tên file đính kèm | ✓ |  |  |  |
| MA_DV | `mA_DV` | Text(13) |  | Mã số thuế khai báo | ✓ |  |  |  |
| TEN_DV | `teN_DV` | Text(200) |  | Tên doanh nghiệp khai báo | ✓ |  |  |  |
| TK_MAHQ | `tK_MAHQ` | Text(4) |  | Mã chi cục Hải quan khai báo | ✓ |  |  |  |
| TK_SOTK | `tK_SOTK` | Text(12) |  | Số tờ khai VNACCS | ✓ |  |  |  |
| TK_NGAYDK | `tK_NGAYDK` | Datetime |  | Ngày đăng ký tờ khai | ✓ |  |  | dd/MM/yyyy |
| TK_MALH | `tK_MALH` | Text(5) |  | Mã loại hình tờ khai | ✓ |  |  |  |
| MA_DAI_LY | `mA_DAI_LY` | Text(13) |  | Mã số thuế đại lý đại diện khai báo |  |  |  | Dùng chữ ký số đại lý khai cho doanh nghiệp |
| TEN_DAI_LY | `teN_DAI_LY` | Text(200) |  | Tên đại lý đại diện khai báo |  |  |  | Dùng chữ ký số đại lý khai cho doanh nghiệp |
| TK_LOAI | `tK_LOAI` | Text(1) |  | Loại tờ khai VNACCS |  |  |  | 1: IDA,EDA<br>2: AMA<br>3: TEA |
| USER_ID | `useR_ID` | Text(10) |  | User id tài khoản vnaccs |  |  |  |  |
</details>


#### V5Container – Bổ sung chứng từ – Container

- **Endpoint**: `POST {{FPT_BASE_URL}}/api/V5Container` · xác thực: Bearer token (từ /api/auth/login) · ⚠️ không có trong Postman (theo Excel)
- **Mục đích**: Đính kèm chứng từ container.
- **Khi nào gọi**: Sau khi tờ khai có số.
- **Bước tiếp theo**: V5Response

<details><summary>Trường – Body (13 trường · BO SUNG CHUNG TU v1.4.xlsx / CONTAINER)</summary>

| Chỉ tiêu | Key JSON | Kiểu | Độ dài | Mô tả | Bắt buộc | Req | Res | Ghi chú |
|---|---|---|---|---|---|---|---|---|
| CON_FILE | `coN_FILE` | base64 |  | File đính kèm | ✓ |  |  | pdf, xlsx, docx dưới 1mb |
| CON_NAME | `coN_NAME` | Text(50) |  | Tên file đính kèm | ✓ |  |  |  |
| CON_GHICHU | `coN_GHICHU` | Text(200) |  | Ghi chú |  |  |  |  |
| TK_SOTK | `tK_SOTK` | Text(12) |  | Số tờ khai VNACCS | ✓ |  |  |  |
| TK_NGAYDK | `tK_NGAYDK` | Datetime |  | Ngày đăng ký tờ khai | ✓ |  |  | dd/MM/yyyy |
| TK_MALH | `tK_MALH` | Text(5) |  | Mã loại hình tờ khai | ✓ |  |  |  |
| MA_DV | `mA_DV` | Text(13) |  | Mã số thuế khai báo | ✓ |  |  |  |
| TEN_DV | `teN_DV` | Text(200) |  | Tên doanh nghiệp khai báo | ✓ |  |  |  |
| TK_MAHQ | `tK_MAHQ` | Text(4) |  | Mã chi cục Hải quan khai báo | ✓ |  |  |  |
| MA_DAI_LY | `mA_DAI_LY` | Text(13) |  | Mã số thuế đại lý đại diện khai báo |  |  |  | Dùng chữ ký số đại lý khai cho doanh nghiệp |
| TEN_DAI_LY | `teN_DAI_LY` | Text(200) |  | Tên đại lý đại diện khai báo |  |  |  | Dùng chữ ký số đại lý khai cho doanh nghiệp |
| TK_LOAI | `tK_LOAI` | Text(1) |  | Loại tờ khai VNACCS |  |  |  | 1: IDA,EDA<br>2: AMA<br>3: TEA |
| USER_ID | `useR_ID` | Text(10) |  | User id tài khoản vnaccs |  |  |  |  |
</details>


#### V5OtherDoc – Bổ sung chứng từ – Chứng từ khác

- **Endpoint**: `POST {{FPT_BASE_URL}}/api/V5OtherDoc` · xác thực: Bearer token (từ /api/auth/login) · ⚠️ không có trong Postman (theo Excel)
- **Mục đích**: Đính kèm chứng từ khác.
- **Khi nào gọi**: Sau khi tờ khai có số.
- **Bước tiếp theo**: V5Response

<details><summary>Trường – Body (18 trường · BO SUNG CHUNG TU v1.4.xlsx / CHỨNG TỪ KHÁC)</summary>

| Chỉ tiêu | Key JSON | Kiểu | Độ dài | Mô tả | Bắt buộc | Req | Res | Ghi chú |
|---|---|---|---|---|---|---|---|---|
| CTK_SO | `ctK_SO` | Text(35) |  | Số chứng từ | ✓ |  |  |  |
| CTK_NGAY | `ctK_NGAY` | Datetime |  | Ngày chứng từ | ✓ |  |  | dd/MM/yyyy |
| CTK_TEN | `ctK_TEN` | Text(100) |  | Tên chứng từ | ✓ |  |  | dd/MM/yyyy |
| CTK_NOIPHATHANH | `ctK_NOIPHATHANH` | Text(100) |  | Nơi phát hành | ✓ |  |  |  |
| CTK_LOAICT | `ctK_LOAICT` |  |  | Loại chứng từ | ✓ |  |  | 1, Bảng kê chi tiết hàng hóa<br>2, Thông tin giấy chứng nhận kiểm tra chuyên ngành<br>3, Chứng từ chứng minh tổ chức, cá nhân đủ điều kiện xuất khẩu, nhập khẩu hàng hóa theo quy định của pháp luật về đầu tư<br>4, Hợp đồng ủy thác<br>5, Chứng từ xác định hàng hóa nhập khẩu được áp dụng thuế suất thuế GTGT 5%<br>9, Chứng từ khác |
| CTK_GHICHU | `ctK_GHICHU` | Text(200) |  | Ghi chú |  |  |  |  |
| CTK_FILE | `ctK_FILE` | base64 |  | File đính kèm | ✓ |  |  | pdf, xlsx, docx dưới 1mb |
| CTK_NAME | `ctK_NAME` | Text(50) |  | Tên file đính kèm | ✓ |  |  |  |
| MA_DV | `mA_DV` | Text(13) |  | Mã số thuế khai báo | ✓ |  |  |  |
| TEN_DV | `teN_DV` | Text(200) |  | Tên doanh nghiệp khai báo | ✓ |  |  |  |
| TK_MAHQ | `tK_MAHQ` | Text(4) |  | Mã chi cục Hải quan khai báo | ✓ |  |  |  |
| TK_SOTK | `tK_SOTK` | Text(12) |  | Số tờ khai VNACCS | ✓ |  |  |  |
| TK_NGAYDK | `tK_NGAYDK` | Datetime |  | Ngày đăng ký tờ khai | ✓ |  |  | dd/MM/yyyy |
| TK_MALH | `tK_MALH` | Text(5) |  | Mã loại hình tờ khai | ✓ |  |  |  |
| MA_DAI_LY | `mA_DAI_LY` | Text(13) |  | Mã số thuế đại lý đại diện khai báo |  |  |  | Dùng chữ ký số đại lý khai cho doanh nghiệp |
| TEN_DAI_LY | `teN_DAI_LY` | Text(200) |  | Tên đại lý đại diện khai báo |  |  |  | Dùng chữ ký số đại lý khai cho doanh nghiệp |
| TK_LOAI | `tK_LOAI` | Text(1) |  | Loại tờ khai VNACCS |  |  |  | 1: IDA,EDA<br>2: AMA<br>3: TEA |
| USER_ID | `useR_ID` | Text(10) |  | User id tài khoản vnaccs |  |  |  |  |
</details>


#### V5Response – Hỏi kết quả chứng từ bổ sung V5

- **Endpoint**: `POST {{FPT_BASE_URL}}/api/V5Response` · xác thực: Bearer token (từ /api/auth/login)
- **Mục đích**: Hỏi kết quả theo REF_ID + loại chứng từ (LOAI_CT: GP/HD/HDN/CO/VD…). Trả số tiếp nhận SO_TN, TRANG_THAI (0 nhập mới, 10 từ chối, 11 chưa có phản hồi…), KET_QUA.
- **Khi nào gọi**: Sau mỗi V5…, lặp tới khi có số tiếp nhận hoặc bị từ chối.

<details><summary>Body mẫu (Postman, đã che mật khẩu, cắt base64) – đầy đủ: samples/V5Response.request.json</summary>

```json
{
  "reF_ID": "88208B02-657A-40D8-80C8-43A1C99B47AE",
  "loaI_CT": "VD",
  "tK_LOAI": "1",
  "tK_SOTK": "102569571230",
  "tK_NGAYDK": "10/11/2024",
  "tK_MALH": "A11",
  "tK_MAHQ": "60C1",
  "mA_DV": "4100811111001",
  "teN_DV": "0101020683",
  "mA_DAI_LY": "",
  "teN_DAI_LY": "",
  "useR_ID": "***"
}
```
</details>


<details><summary>Trường – Body + phản hồi (18 trường · BO SUNG CHUNG TU v1.4.xlsx / HỎI KQ V5 Đính kèm CTBS)</summary>

| Chỉ tiêu | Key JSON | Kiểu | Độ dài | Mô tả | Bắt buộc | Req | Res | Ghi chú |
|---|---|---|---|---|---|---|---|---|
| TK_SOTK | `tK_SOTK` | Text(12) |  | Số tờ khai VNACCS | ✓ | ✓ | ✓ |  |
| TK_NGAYDK | `tK_NGAYDK` | Datetime |  | Ngày đăng ký tờ khai | ✓ | ✓ | ✓ | dd/MM/yyyy |
| TK_MALH | `tK_MALH` | Text(5) |  | Mã loại hình tờ khai | ✓ | ✓ | ✓ |  |
| TK_MAHQ | `tK_MAHQ` | Text(4) |  | Mã chi cục Hải quan khai báo | ✓ | ✓ | ✓ |  |
| MA_DV | `mA_DV` | Text(13) |  | Mã số thuế khai báo | ✓ | ✓ | ✓ |  |
| TEN_DV | `teN_DV` | Text(200) |  | Tên doanh nghiệp khai báo | ✓ | ✓ | ✓ |  |
| MA_DAI_LY | `mA_DAI_LY` | Text(13) |  | Mã số thuế đại lý đại diện khai báo |  | ✓ | ✓ | Dùng chữ ký số đại lý khai cho doanh nghiệp |
| TEN_DAI_LY | `teN_DAI_LY` | Text(200) |  | Tên đại lý đại diện khai báo |  | ✓ | ✓ | Dùng chữ ký số đại lý khai cho doanh nghiệp |
| REF_ID | `reF_ID` | Text(50) |  | Số tham chiếu được trả từ hệ thống | ✓ | ✓ | ✓ |  |
| LOAI_CT | `loaI_CT` | Text(5) |  | Loại chứng từ | ✓ | ✓ | ✓ | GiayPhep: GP<br>HopDong: HD<br>HoaDon: HDN<br>CO: CO<br>VanDon: VD<br>Container: CON<br>ChungTuKhac: CTK |
| SO_TN | `sO_TN` | Text(20) |  | Số tiếp nhận |  |  | ✓ |  |
| NGAY_TN | `ngaY_TN` | Datetime |  | Ngày tiếp nhận |  |  | ✓ | dd/MM/yyyy |
| NAM_TN | `naM_TN` | Text(4) |  | Năm tiếp nhận |  |  | ✓ |  |
| TRANG_THAI | `tranG_THAI` | Text(2) |  | Trạng thái tiếp nhận |  |  | ✓ | 0: Nhập mới<br>10: Từ chối<br>11: Chưa có phản hồi<br>12: Hải quan chấp nhận |
| KET_QUA | `keT_QUA` | Text(255) |  | Kết quả trả về từ hệ thống |  |  | ✓ |  |
| TK_LOAI | `tK_LOAI` | Text(1) |  | Loại tờ khai VNACCS | ✓ | ✓ | ✓ | 1: IDA,EDA<br>2: AMA<br>3: TEA |
| USER_ID | `useR_ID` | Text(10) |  | User id tài khoản vnaccs | ✓ | ✓ | ✓ |  |
| errorList | `errorList` | List |  | Lỗi xử lý từ API |  |  | ✓ |  |
</details>


<details><summary>Trường – errorList[] (6 trường · BO SUNG CHUNG TU v1.4.xlsx / errorList)</summary>

| Chỉ tiêu | Key JSON | Kiểu | Độ dài | Mô tả | Bắt buộc | Req | Res | Ghi chú |
|---|---|---|---|---|---|---|---|---|
| errorCode | `errorCode` | Text(12) |  | Mã lỗi |  |  | ✓ |  |
| indexCode | `indexCode` | Text(50) |  | Mã chỉ tiêu lỗi |  |  | ✓ |  |
| nameCode | `nameCode` | Text(200) |  | Tên chỉ tiêu lỗi |  |  | ✓ |  |
| errorContent | `errorContent` | Text(max) |  | Nội dung chi tiết lỗi |  |  | ✓ |  |
| proposedSolution | `proposedSolution` | Text(max) |  | Hướng dẫn cách khắc phục |  |  | ✓ |  |
| rowPosition | `rowPosition` | Text(12) |  | Vị trí dòng hàng lỗi nếu có |  |  | ✓ |  |
</details>


### Vận đơn, định danh, container

#### V5IdentifierReq – Khai báo định danh hàng hóa

- **Endpoint**: `POST {{FPT_BASE_URL}}/api/V5IdentifierReq` · xác thực: Bearer token (từ /api/auth/login)
- **Mục đích**: Xin số định danh hàng hóa (thay số vận đơn cho hàng không có vận đơn / theo quy định). Phản hồi REF_ID.
- **Khi nào gọi**: Trước khi khai tờ khai cần số định danh.
- **Bước tiếp theo**: V5IdentifierRes

<details><summary>Body mẫu (Postman, đã che mật khẩu, cắt base64) – đầy đủ: samples/V5IdentifierReq.request.json</summary>

```json
{
  "mA_DV": "4100811111001",
  "teN_DV": "test",
  "loaI_DT": "1",
  "loaI_HH": "2",
  "mA_HQ": "60CB",
  "mA_DAI_LY": "",
  "teN_DAI_LY": "",
  "useR_ID": "***"
}
```
</details>


<details><summary>Trường – Body (8 trường · KHAI BAO LAY MA DINH DANH v1.1.xlsx / Khai định danh)</summary>

| Chỉ tiêu | Key JSON | Kiểu | Độ dài | Mô tả | Bắt buộc | Req | Res | Ghi chú |
|---|---|---|---|---|---|---|---|---|
| LOAI_DT | `loaI_DT` | Text(1) |  | Loại đối tượng | ✓ |  |  | 1: Doanh nghiệp xuất nhập khẩu<br>2: Doanh nghiệp kho, bãi, cảng |
| LOAI_HH | `loaI_HH` | Text(1) |  | Loại hàng hóa | ✓ |  |  | 1: Nhập khẩu<br>2: Xuất khẩu<br>3: Hàng nội địa (không XNK) |
| MA_DV | `mA_DV` | Text(13) |  | Mã số thuế khai báo | ✓ |  |  |  |
| TEN_DV | `teN_DV` | Text(200) |  | Tên doanh nghiệp khai báo | ✓ |  |  |  |
| MA_DAI_LY | `mA_DAI_LY` | Text(13) |  | Mã số thuế đại lý đại diện khai báo |  |  |  | Dùng chữ ký số đại lý khai cho doanh nghiệp |
| TEN_DAI_LY | `teN_DAI_LY` | Text(200) |  | Tên đại lý đại diện khai báo |  |  |  | Dùng chữ ký số đại lý khai cho doanh nghiệp |
| MA_HQ | `mA_HQ` | Text(4) |  | Mã chi cục Hải quan khai báo | ✓ |  |  |  |
| USER_ID | `useR_ID` | Text(10) |  | User id tài khoản vnaccs |  |  |  | Dùng để ký số qua cổng ký |
</details>


#### V5IdentifierRes – Hỏi kết quả khai báo định danh

- **Endpoint**: `POST {{FPT_BASE_URL}}/api/V5IdentifierRes` · xác thực: Bearer token (từ /api/auth/login)
- **Mục đích**: Theo REF_ID: trả số định danh SO_DD, ngày, ảnh QR (CODE_CONTENT base64), trạng thái tiếp nhận.
- **Khi nào gọi**: Sau V5IdentifierReq, lặp tới khi có kết quả.

<details><summary>Body mẫu (Postman, đã che mật khẩu, cắt base64) – đầy đủ: samples/V5IdentifierRes.request.json</summary>

```json
{
  "mA_HQ": "string",
  "mA_DV": "string",
  "teN_DV": "string",
  "mA_DAI_LY": "string",
  "teN_DAI_LY": "string",
  "reF_ID": "string",
  "useR_ID": "***"
}
```
</details>


<details><summary>Trường – Body + phản hồi (16 trường · KHAI BAO LAY MA DINH DANH v1.1.xlsx / Hỏi kết quả phản hồi định danh)</summary>

| Chỉ tiêu | Key JSON | Kiểu | Độ dài | Mô tả | Bắt buộc | Req | Res | Ghi chú |
|---|---|---|---|---|---|---|---|---|
| MA_HQ | `mA_HQ` | Text(4) |  | Mã chi cục Hải quan khai báo | ✓ | ✓ | ✓ |  |
| MA_DV | `mA_DV` | Text(13) |  | Mã số thuế khai báo | ✓ | ✓ | ✓ |  |
| TEN_DV | `teN_DV` | Text(200) |  | Tên doanh nghiệp khai báo | ✓ | ✓ | ✓ |  |
| MA_DAI_LY | `mA_DAI_LY` | Text(13) |  | Mã số thuế đại lý đại diện khai báo |  | ✓ | ✓ | Dùng chữ ký số đại lý khai cho doanh nghiệp |
| TEN_DAI_LY | `teN_DAI_LY` | Text(200) |  | Tên đại lý đại diện khai báo |  | ✓ | ✓ | Dùng chữ ký số đại lý khai cho doanh nghiệp |
| REF_ID | `reF_ID` | Text(50) |  | Số tham chiếu được trả từ hệ thống | ✓ | ✓ | ✓ |  |
| SO_TN | `sO_TN` | Text(20) |  | Số tiếp nhận |  |  | ✓ |  |
| NGAY_TN | `ngaY_TN` | Datetime |  | Ngày tiếp nhận |  |  | ✓ | dd/MM/yyyy |
| NAM_TN | `naM_TN` | Text(4) |  | Năm tiếp nhận |  |  | ✓ |  |
| SO_DD | `sO_DD` | Text(20) |  | Số địnhh danh |  |  | ✓ |  |
| NGAY_DD | `ngaY_DD` | Datetime |  | Ngày định danh |  |  | ✓ |  |
| CODE_CONTENT | `codE_CONTENT` | Text(max) |  | Base64 QR Code định danh |  |  | ✓ |  |
| TRANG_THAI | `tranG_THAI` | Text(2) |  | Trạng thái tiếp nhận |  |  | ✓ | 0: Nhập mới<br>10: Từ chối<br>11: Chưa có phản hồi<br>12: Hải quan chấp nhận (có số tiếp nhận)<br>15: Hải quan đã duyệt (có mã định danh) |
| KET_QUA | `keT_QUA` | Text(255) |  | Kết quả trả về từ hệ thống |  |  | ✓ |  |
| USER_ID | `useR_ID` | Text(10) |  | User id tài khoản vnaccs | ✓ | ✓ | ✓ |  |
| errorList | `errorList` | List |  | Lỗi xử lý từ API |  |  | ✓ |  |
</details>


<details><summary>Trường – errorList[] (6 trường · KHAI BAO LAY MA DINH DANH v1.1.xlsx / errorList)</summary>

| Chỉ tiêu | Key JSON | Kiểu | Độ dài | Mô tả | Bắt buộc | Req | Res | Ghi chú |
|---|---|---|---|---|---|---|---|---|
| errorCode | `errorCode` | Text(12) |  | Mã lỗi |  |  | ✓ |  |
| indexCode | `indexCode` | Text(50) |  | Mã chỉ tiêu lỗi |  |  | ✓ |  |
| nameCode | `nameCode` | Text(200) |  | Tên chỉ tiêu lỗi |  |  | ✓ |  |
| errorContent | `errorContent` | Text(max) |  | Nội dung chi tiết lỗi |  |  | ✓ |  |
| proposedSolution | `proposedSolution` | Text(max) |  | Hướng dẫn cách khắc phục |  |  | ✓ |  |
| rowPosition | `rowPosition` | Text(12) |  | Vị trí dòng hàng lỗi nếu có |  |  | ✓ |  |
</details>


#### TachVanDonReq – Khai báo tách vận đơn

- **Endpoint**: `POST {{FPT_BASE_URL}}/api/TachVanDonReq` · xác thực: Bearer token (từ /api/auth/login)
- **Mục đích**: Tách một vận đơn gốc thành nhiều vận đơn nhánh (hàng container hoặc hàng lẻ) – nhập khẩu.
- **Khi nào gọi**: Trước khi khai tờ khai theo vận đơn nhánh.
- **Bước tiếp theo**: TachVanDonRes

<details><summary>Body mẫu (Postman, đã che mật khẩu, cắt base64) – đầy đủ: samples/TachVanDonReq.request.json</summary>

```json
{
  "mA_HQ": "88AB",
  "mA_DV": "123",
  "teN_DV": "Tên đơn vị",
  "mA_DAI_LY": "",
  "teN_DAI_LY": "",
  "tvD_VD_GOC": "VANDON",
  "tvD_VD_GOC_NGAY": "12/12/2025",
  "tvD_NGUOIPHATHANH": "Người phát hành",
  "tvD_VDNHANH_SOLUONG": 2,
  "tvD_LOAI": 1,
  "tvD_LOAIHANG": 1,
  "useR_ID": "***",
  "tvdN_HANG": [
    {
      "tvdN_STT": 1,
      "tvdN_VD_NHANH": "VANDON-01",
      "tvdN_NGUOIGUI_TEN": "người gửi",
      "tvdN_NGUOIGUI_DIACHI": "địa chỉ người gửi",
      "tvdN_NGUOINHAN_TEN": "người nhận",
      "tvdN_NGUOINHAN_DIACHI": "địa chỉ người nhận",
      "tvdN_CONT_LUONG": 1,
      "tvdN_LUONG": 1,
      "tvdN_LUONG_DVT": "CT",
      "tvdN_TRONGLUONG": 5,
      "tvdN_TRONGLUONG_DVT": "TNE",
      "tvdnC_HANG": [
        {
          "tvdnC_SOCONT": "SOCONT1",
          "tvdnC_SOSEAL": "SOESAL1"
        }
      ]
    },
    {
      "tvdN_STT": 2,
      "tvdN_VD_NHANH": "VANDON-02",
      "tvdN_NGUOIGUI_TEN": "người gửi",
      "tvdN_NGUOIGUI_DIACHI": "địa chỉ người gửi",
      "tvdN_NGUOINHAN_TEN": "người nhận",
      "tvdN_NGUOINHAN_DIACHI": "địa chỉ người nhận",
      "tvdN_CONT_LUONG": 1,
      "tvdN_LUONG": 1,
      "tvdN_LUONG_DVT": "CT",
      "tvdN_TRONGLUONG": 3,
      "tvdN_TRONGLUONG_DVT": "TNE",
      "tvdnC_HANG": [
        {
          "tvdnC_SOCONT": "SOCONT2",
          "tvdnC_SOSEAL": "SOESAL2"
        }
      ]
    }
  ]
}
```
</details>


<details><summary>Trường – Body – hàng container (25 trường · TACH VAN DON.xlsx / Khai báo tách bill hàng cont)</summary>

| Chỉ tiêu | Key JSON | Kiểu | Độ dài | Mô tả | Bắt buộc | Req | Res | Ghi chú |
|---|---|---|---|---|---|---|---|---|
| MA_DV | `mA_DV` | Text(13) |  | Mã số thuế khai báo | ✓ |  |  |  |
| TEN_DV | `teN_DV` | Text(200) |  | Tên doanh nghiệp khai báo | ✓ |  |  |  |
| MA_HQ | `mA_HQ` | Text(4) |  | Mã chi cục Hải quan khai báo | ✓ |  |  |  |
| TVD_VD_GOC | `tvD_VD_GOC` | Text(35) |  | Số vận đơn gốc | ✓ |  |  |  |
| TVD_VD_GOC_NGAY | `tvD_VD_GOC_NGAY` | Datetime |  | Ngày vận đơn | ✓ |  |  | dd/MM/yyyy |
| TVD_NGUOIPHATHANH | `tvD_NGUOIPHATHANH` | Text(50) |  | Người phát hành | ✓ |  |  |  |
| TVD_VDNHANH_SOLUONG | `tvD_VDNHANH_SOLUONG` | Interger |  | Số lượng vận đơn nhánh cần tách | ✓ |  |  |  |
| TVD_LOAI | `tvD_LOAI` | Interger |  | Phân loại tách vận đơn | ✓ |  |  | 1: Tách vận đơn cơ học<br>2: Tách vận đơn lý thuyết<br><br>Lưu ý:<br>1: Tách vận đơn cơ học (áp dụng khi hàng hóa có thể tách biệt theo đơn vị tính khai báo, có thể khai báo và lấy hàng đơn lẻ theo từng vận đơn mà không ảnh hưởng đến lượng hàng còn lại của vận đơn gốc. Ví dụ 1 vận đơn gốc có 2 container hàng hóa, container 1 chứa mặt hàng A, container 2 chứa mặt hàng B thì có thể lấy tách thành 2 vận đơn để khai báo 2 tờ khai riêng biệt với mặt hàng A để lấy container 1 trước, mặt hàng B sau...)<br><br>2: Tách vận đơn lý thuyết (áp dụng trong trường hợp không thể tách biệt hàng hóa được đóng trong phương tiện chứa hàng theo vận đơn (container, kiện...) khi tách vận đơn và việc tách vận đơn chỉ phục vụ việc khai hải quan, khi lấy hàng phải lấy toàn bộ hàng hóa thuộc tất cả các vận đơn đã tách. |
| TVD_LOAIHANG | `tvD_LOAIHANG` | Interger |  | Loại hàng | ✓ |  |  | 1: Hàng container |
| MA_DAI_LY | `mA_DAI_LY` | Text(13) |  | Mã số thuế đại lý đại diện khai báo |  |  |  | Dùng chữ ký số đại lý khai cho doanh nghiệp |
| TEN_DAI_LY | `teN_DAI_LY` | Text(200) |  | Tên đại lý đại diện khai báo |  |  |  | Dùng chữ ký số đại lý khai cho doanh nghiệp |
| USER_ID | `useR_ID` | Text(10) |  | User id tài khoản vnaccs | ✓ |  |  |  |
| TVDN_STT | `tvdN_STT` | Interger |  | Số thứ tự  vận đơn nhánh | ✓ |  |  | lặp lại |
| TVDN_VD_NHANH | `tvdN_VD_NHANH` | Text(35) |  | Số vận đơn nhánh | ✓ |  |  | lặp lại |
| TVDN_NGUOIGUI_TEN | `tvdN_NGUOIGUI_TEN` | Text(100) |  | Tên người gửi | ✓ |  |  | lặp lại |
| TVDN_NGUOIGUI_DIACHI | `tvdN_NGUOIGUI_DIACHI` | Text(200) |  | Địa chỉ người gửi | ✓ |  |  | lặp lại |
| TVDN_NGUOINHAN_TEN | `tvdN_NGUOINHAN_TEN` | Text(100) |  | Tên người nhận | ✓ |  |  | lặp lại |
| TVDN_NGUOINHAN_DIACHI | `tvdN_NGUOINHAN_DIACHI` | Text(200) |  | Địa chỉ người nhận | ✓ |  |  | lặp lại |
| TVDN_CONT_LUONG | `tvdN_CONT_LUONG` | Interger |  | Số lượng container | ✓ |  |  | lặp lại |
| TVDN_LUONG | `tvdN_LUONG` | Interger |  | Số lượng kiện | ✓ |  |  | lặp lại |
| TVDN_LUONG_DVT | `tvdN_LUONG_DVT` | Text(3) |  | Đơn vị tính kiện | ✓ |  |  | lặp lại |
| TVDN_TRONGLUONG | `tvdN_TRONGLUONG` | float |  | Trọng lượng hàng | ✓ |  |  | lặp lại |
| TVDN_TRONGLUONG_DVT | `tvdN_TRONGLUONG_DVT` | Text(3) |  | Đơn vị tính trọng lượng | ✓ |  |  | lặp lại |
| TVDNC_SOCONT | `tvdnC_SOCONT` | Text(35) |  | Số container | ✓ |  |  | lặp lại |
| TVDNC_SOSEAL | `tvdnC_SOSEAL` | Text(100) |  | Số seal | ✓ |  |  | lặp lại |

Danh mục / ghi chú kèm theo: VÍ DỤ TÁCH VẬN ĐƠN; Số vận đơn: VANDON; Số lượng vận đơn nhánh cần tách: 2; Số vận đơn nhánh được tách lần lượt:; VANDON-01; VANDON-02
</details>


<details><summary>Trường – Body – hàng lẻ (22 trường · TACH VAN DON.xlsx / Khai báo tách bill hàng lẻ)</summary>

| Chỉ tiêu | Key JSON | Kiểu | Độ dài | Mô tả | Bắt buộc | Req | Res | Ghi chú |
|---|---|---|---|---|---|---|---|---|
| MA_DV | `mA_DV` | Text(13) |  | Mã số thuế khai báo | ✓ |  |  |  |
| TEN_DV | `teN_DV` | Text(200) |  | Tên doanh nghiệp khai báo | ✓ |  |  |  |
| MA_HQ | `mA_HQ` | Text(4) |  | Mã chi cục Hải quan khai báo | ✓ |  |  |  |
| TVD_VD_GOC | `tvD_VD_GOC` | Text(35) |  | Số vận đơn gốc | ✓ |  |  |  |
| TVD_VD_GOC_NGAY | `tvD_VD_GOC_NGAY` | Datetime |  | Ngày vận đơn | ✓ |  |  | dd/MM/yyyy |
| TVD_NGUOIPHATHANH | `tvD_NGUOIPHATHANH` | Text(50) |  | Người phát hành | ✓ |  |  |  |
| TVD_VDNHANH_SOLUONG | `tvD_VDNHANH_SOLUONG` | Interger |  | Số lượng vận đơn nhánh cần tách | ✓ |  |  |  |
| TVD_LOAI | `tvD_LOAI` | Interger |  | Phân loại tách vận đơn | ✓ |  |  | 1: Tách vận đơn cơ học<br>2: Tách vận đơn lý thuyết<br><br>Lưu ý:<br>1: Tách vận đơn cơ học (áp dụng khi hàng hóa có thể tách biệt theo đơn vị tính khai báo, có thể khai báo và lấy hàng đơn lẻ theo từng vận đơn mà không ảnh hưởng đến lượng hàng còn lại của vận đơn gốc. Ví dụ 1 vận đơn gốc có 2 container hàng hóa, container 1 chứa mặt hàng A, container 2 chứa mặt hàng B thì có thể lấy tách thành 2 vận đơn để khai báo 2 tờ khai riêng biệt với mặt hàng A để lấy container 1 trước, mặt hàng B sau...)<br><br>2: Tách vận đơn lý thuyết (áp dụng trong trường hợp không thể tách biệt hàng hóa được đóng trong phương tiện chứa hàng theo vận đơn (container, kiện...) khi tách vận đơn và việc tách vận đơn chỉ phục vụ việc khai hải quan, khi lấy hàng phải lấy toàn bộ hàng hóa thuộc tất cả các vận đơn đã tách. |
| TVD_LOAIHANG | `tvD_LOAIHANG` | Interger |  | Loại hàng | ✓ |  |  | 0: Hàng rời |
| MA_DAI_LY | `mA_DAI_LY` | Text(13) |  | Mã số thuế đại lý đại diện khai báo |  |  |  | Dùng chữ ký số đại lý khai cho doanh nghiệp |
| TEN_DAI_LY | `teN_DAI_LY` | Text(200) |  | Tên đại lý đại diện khai báo |  |  |  | Dùng chữ ký số đại lý khai cho doanh nghiệp |
| USER_ID | `useR_ID` | Text(10) |  | User id tài khoản vnaccs | ✓ |  |  |  |
| TVDN_STT | `tvdN_STT` | Interger |  | Số thứ tự  vận đơn nhánh | ✓ |  |  | lặp lại |
| TVDN_VD_NHANH | `tvdN_VD_NHANH` | Text(35) |  | Số vận đơn nhánh | ✓ |  |  | lặp lại |
| TVDN_NGUOIGUI_TEN | `tvdN_NGUOIGUI_TEN` | Text(100) |  | Tên người gửi | ✓ |  |  | lặp lại |
| TVDN_NGUOIGUI_DIACHI | `tvdN_NGUOIGUI_DIACHI` | Text(200) |  | Địa chỉ người gửi | ✓ |  |  | lặp lại |
| TVDN_NGUOINHAN_TEN | `tvdN_NGUOINHAN_TEN` | Text(100) |  | Tên người nhận | ✓ |  |  | lặp lại |
| TVDN_NGUOINHAN_DIACHI | `tvdN_NGUOINHAN_DIACHI` | Text(200) |  | Địa chỉ người nhận | ✓ |  |  | lặp lại |
| TVDN_LUONG | `tvdN_LUONG` | Interger |  | Số lượng kiện | ✓ |  |  | lặp lại |
| TVDN_LUONG_DVT | `tvdN_LUONG_DVT` | Text(3) |  | Đơn vị tính kiện | ✓ |  |  | lặp lại |
| TVDN_TRONGLUONG | `tvdN_TRONGLUONG` | float |  | Trọng lượng hàng | ✓ |  |  | lặp lại |
| TVDN_TRONGLUONG_DVT | `tvdN_TRONGLUONG_DVT` | Text(3) |  | Đơn vị tính trọng lượng | ✓ |  |  | lặp lại |

Danh mục / ghi chú kèm theo: VÍ DỤ TÁCH VẬN ĐƠN; Số vận đơn: VANDON; Số lượng vận đơn nhánh cần tách: 2; Số vận đơn nhánh được tách lần lượt:; VANDON-01; VANDON-02
</details>


#### TachVanDonRes – Hỏi kết quả tách vận đơn

- **Endpoint**: `POST {{FPT_BASE_URL}}/api/TachVanDonRes` · xác thực: Bearer token (từ /api/auth/login)
- **Mục đích**: Theo REF_ID: số tiếp nhận, trạng thái, kết quả.
- **Khi nào gọi**: Sau TachVanDonReq.

<details><summary>Body mẫu (Postman, đã che mật khẩu, cắt base64) – đầy đủ: samples/TachVanDonRes.request.json</summary>

```json
{
  "mA_HQ": "88AB",
  "mA_DV": "123",
  "teN_DV": "Tên đơn vị",
  "mA_DAI_LY": "",
  "teN_DAI_LY": "",
  "reF_ID": "42D20957-BE82-4343-85D0-6A3D88AB2C7A",
  "useR_ID": "***"
}
```
</details>


<details><summary>Trường – Body + phản hồi (13 trường · TACH VAN DON.xlsx / Phản hồi)</summary>

| Chỉ tiêu | Key JSON | Kiểu | Độ dài | Mô tả | Bắt buộc | Req | Res | Ghi chú |
|---|---|---|---|---|---|---|---|---|
| MA_HQ | `mA_HQ` | Text(4) |  | Mã chi cục Hải quan khai báo | ✓ | ✓ | ✓ |  |
| MA_DV | `mA_DV` | Text(13) |  | Mã số thuế khai báo | ✓ | ✓ | ✓ |  |
| TEN_DV | `teN_DV` | Text(200) |  | Tên doanh nghiệp khai báo | ✓ | ✓ | ✓ |  |
| MA_DAI_LY | `mA_DAI_LY` | Text(13) |  | Mã số thuế đại lý đại diện khai báo |  | ✓ | ✓ | Dùng chữ ký số đại lý khai cho doanh nghiệp |
| TEN_DAI_LY | `teN_DAI_LY` | Text(200) |  | Tên đại lý đại diện khai báo |  | ✓ | ✓ | Dùng chữ ký số đại lý khai cho doanh nghiệp |
| REF_ID | `reF_ID` | Text(50) |  | Số tham chiếu được trả từ hệ thống | ✓ | ✓ | ✓ |  |
| SO_TN | `sO_TN` | Text(20) |  | Số tiếp nhận |  |  | ✓ |  |
| NGAY_TN | `ngaY_TN` | Datetime |  | Ngày tiếp nhận |  |  | ✓ | dd/MM/yyyy |
| NAM_TN | `naM_TN` | Text(4) |  | Năm tiếp nhận |  |  | ✓ |  |
| TRANG_THAI | `tranG_THAI` | Text(2) |  | Trạng thái tiếp nhận |  |  | ✓ | 0: Nhập mới<br>10: Từ chối<br>11: Chưa có phản hồi<br>12: Hải quan chấp nhận |
| KET_QUA | `keT_QUA` | Text(255) |  | Kết quả trả về từ hệ thống |  |  | ✓ |  |
| USER_ID | `useR_ID` | Text(10) |  | User id tài khoản vnaccs | ✓ | ✓ | ✓ |  |
| errorList | `errorList` | List |  | Lỗi xử lý từ API |  |  | ✓ |  |
</details>


#### ContainerReq – Khai báo danh sách container

- **Endpoint**: `POST {{FPT_BASE_URL}}/api/ContainerReq` · xác thực: Bearer token (từ /api/auth/login)
- **Mục đích**: Bản cũ (file KHAI BAO DS CONT, không số phiên bản) – **dùng V5ContainerReq (Excel v1.1)** thay thế. Giữ ở đây vì Postman còn API này.
- **Khi nào gọi**: Không dùng cho tích hợp mới.
- **Bước tiếp theo**: ContainerRes

<details><summary>Body mẫu (Postman, đã che mật khẩu, cắt base64) – đầy đủ: samples/ContainerReq.request.json</summary>

```json
{
  "tK_SOTK": "1234567890",
  "tK_NGAYDK": "12/12/2025",
  "tK_MALH": "A12",
  "tK_MAHQ": "88AB",
  "mA_DV": "123",
  "teN_DV": "Tên đơn vị",
  "mA_DAI_LY": "",
  "teN_DAI_LY": "",
  "useR_ID": "***",
  "hanG_CONT": [
    {
      "vD_SO": "VANDON",
      "coN_SO": "SOCONT",
      "seL_SO": "SOSEAL",
      "ghI_CHU": ""
    }
  ]
}
```
</details>


<details><summary>Trường – Body (15 trường · KHAI BAO DS CONT.xlsx / Request)</summary>

| Chỉ tiêu | Key JSON | Kiểu | Độ dài | Mô tả | Bắt buộc | Req | Res | Ghi chú |
|---|---|---|---|---|---|---|---|---|
| MA_DV | `mA_DV` | Text(13) |  | Mã số thuế khai báo | ✓ |  |  |  |
| TEN_DV | `teN_DV` | Text(200) |  | Tên doanh nghiệp khai báo | ✓ |  |  |  |
| TK_MAHQ | `tK_MAHQ` | Text(4) |  | Mã chi cục Hải quan khai báo | ✓ |  |  |  |
| TK_SOTK | `tK_SOTK` | Text(12) |  | Số tờ khai VNACCS | ✓ |  |  |  |
| TK_NGAYDK | `tK_NGAYDK` | Datetime |  | Ngày đăng ký tờ khai | ✓ |  |  | dd/MM/yyyy |
| TK_MALH | `tK_MALH` | Text(5) |  | Mã loại hình tờ khai | ✓ |  |  |  |
| MA_DAI_LY | `mA_DAI_LY` | Text(13) |  | Mã số thuế đại lý đại diện khai báo |  |  |  | Dùng chữ ký số đại lý khai cho doanh nghiệp |
| TEN_DAI_LY | `teN_DAI_LY` | Text(200) |  | Tên đại lý đại diện khai báo |  |  |  | Dùng chữ ký số đại lý khai cho doanh nghiệp |
| CTHQ_CCM | `cthQ_CCM` | Text(1) |  | Phân loại chỉ thị hải quan |  |  |  |  |
| CTHQ_D01 | `cthQ_D01` | Datetime |  | Ngày chỉ thị của Hải quan |  |  |  |  |
| VD_SO | `vD_SO` | Text(35) |  | Số vận đơn | ✓ |  |  | lặp lại |
| CON_SO | `coN_SO` | Text(35) |  | Số container | ✓ |  |  | lặp lại |
| SEL_SO | `seL_SO` | Text(35) |  | Số seal |  |  |  | lặp lại |
| GHI_CHU | `ghI_CHU` | Text(255) |  | Ghi chú |  |  |  | lặp lại |
| USER_ID | `useR_ID` | Text(10) |  | User id tài khoản vnaccs | ✓ |  |  |  |
</details>


#### ContainerRes – Hỏi kết quả khai danh sách container

- **Endpoint**: `POST {{FPT_BASE_URL}}/api/ContainerRes` · xác thực: Bearer token (từ /api/auth/login)
- **Mục đích**: Theo REF_ID: số tiếp nhận, trạng thái.
- **Khi nào gọi**: Sau ContainerReq.

<details><summary>Body mẫu (Postman, đã che mật khẩu, cắt base64) – đầy đủ: samples/ContainerRes.request.json</summary>

```json
{
  "reF_ID": "42D20957-BE82-4343-85D0-6A3D88AB2C7A",
  "tK_SOTK": "1234567890",
  "tK_NGAYDK": "12/12/2025",
  "tK_MALH": "A12",
  "tK_MAHQ": "88AB",
  "mA_DV": "123",
  "teN_DV": "Tên đơn vị",
  "mA_DAI_LY": "",
  "teN_DAI_LY": "",
  "useR_ID": "***",
  "hanG_CONT": [
    {
      "vD_SO": "VANDON",
      "coN_SO": "SOCONT",
      "seL_SO": "SOSEAL",
      "ghI_CHU": ""
    }
  ]
}
```
</details>


<details><summary>Trường – Body + phản hồi (16 trường · KHAI BAO DS CONT.xlsx / Response)</summary>

| Chỉ tiêu | Key JSON | Kiểu | Độ dài | Mô tả | Bắt buộc | Req | Res | Ghi chú |
|---|---|---|---|---|---|---|---|---|
| TK_SOTK | `tK_SOTK` | Text(12) |  | Số tờ khai VNACCS | ✓ | ✓ | ✓ |  |
| TK_NGAYDK | `tK_NGAYDK` | Datetime |  | Ngày đăng ký tờ khai | ✓ | ✓ | ✓ | dd/MM/yyyy |
| TK_MALH | `tK_MALH` | Text(5) |  | Mã loại hình tờ khai | ✓ | ✓ | ✓ |  |
| TK_MAHQ | `tK_MAHQ` | Text(4) |  | Mã chi cục Hải quan khai báo | ✓ | ✓ | ✓ |  |
| MA_DV | `mA_DV` | Text(13) |  | Mã số thuế khai báo | ✓ | ✓ | ✓ |  |
| TEN_DV | `teN_DV` | Text(200) |  | Tên doanh nghiệp khai báo | ✓ | ✓ | ✓ |  |
| MA_DAI_LY | `mA_DAI_LY` | Text(13) |  | Mã số thuế đại lý đại diện khai báo |  | ✓ | ✓ | Dùng chữ ký số đại lý khai cho doanh nghiệp |
| TEN_DAI_LY | `teN_DAI_LY` | Text(200) |  | Tên đại lý đại diện khai báo |  | ✓ | ✓ | Dùng chữ ký số đại lý khai cho doanh nghiệp |
| REF_ID | `reF_ID` | Text(50) |  | Số tham chiếu được trả từ hệ thống | ✓ | ✓ | ✓ |  |
| SO_TN | `sO_TN` | Text(20) |  | Số tiếp nhận |  |  | ✓ |  |
| NGAY_TN | `ngaY_TN` | Datetime |  | Ngày tiếp nhận |  |  | ✓ | dd/MM/yyyy |
| NAM_TN | `naM_TN` | Text(4) |  | Năm tiếp nhận |  |  | ✓ |  |
| TRANG_THAI | `tranG_THAI` | Text(2) |  | Trạng thái tiếp nhận |  |  | ✓ | 0: Nhập mới<br>10: Từ chối<br>11: Chưa có phản hồi<br>12: Hải quan chấp nhận |
| KET_QUA | `keT_QUA` | Text(255) |  | Kết quả trả về từ hệ thống |  |  | ✓ |  |
| USER_ID | `useR_ID` | Text(10) |  | User id tài khoản vnaccs | ✓ | ✓ | ✓ |  |
| errorList | `errorList` | List |  | Lỗi xử lý từ API |  |  | ✓ |  |
</details>


#### V5ContainerReq – Khai danh sách container (bản V5)

- **Endpoint**: `POST {{FPT_BASE_URL}}/api/V5ContainerReq` · xác thực: Bearer token (từ /api/auth/login) · ⚠️ không có trong Postman (theo Excel)
- **Mục đích**: Khai danh sách container/seal theo vận đơn cho tờ khai đã có số – **bản dùng** (Excel v1.1; số seal bắt buộc). Postman chỉ có bản cũ ContainerReq.
- **Khi nào gọi**: Sau khi có số tờ khai.
- **Bước tiếp theo**: V5ContainerRes

<details><summary>Trường – Body (13 trường · KHAI BAO DANH SACH CONTAINER v1.1.xlsx / Khai danh sách container)</summary>

| Chỉ tiêu | Key JSON | Kiểu | Độ dài | Mô tả | Bắt buộc | Req | Res | Ghi chú |
|---|---|---|---|---|---|---|---|---|
| TK_SOTK | `tK_SOTK` | Text(12) |  | Số tờ khai VNACCS | ✓ | ✓ | ✓ |  |
| TK_NGAYDK | `tK_NGAYDK` | Datetime |  | Ngày đăng ký tờ khai | ✓ | ✓ | ✓ | dd/MM/yyyy |
| TK_MALH | `tK_MALH` | Text(5) |  | Mã loại hình tờ khai | ✓ | ✓ | ✓ |  |
| TK_MAHQ | `tK_MAHQ` | Text(4) |  | Mã chi cục Hải quan khai báo | ✓ | ✓ | ✓ |  |
| MA_DV | `mA_DV` | Text(13) |  | Mã số thuế khai báo | ✓ | ✓ | ✓ |  |
| TEN_DV | `teN_DV` | Text(200) |  | Tên doanh nghiệp khai báo | ✓ | ✓ | ✓ |  |
| MA_DAI_LY | `mA_DAI_LY` | Text(13) |  | Mã số thuế đại lý đại diện khai báo |  | ✓ | ✓ | Dùng chữ ký số đại lý khai cho doanh nghiệp |
| TEN_DAI_LY | `teN_DAI_LY` | Text(200) |  | Tên đại lý đại diện khai báo |  | ✓ | ✓ | Dùng chữ ký số đại lý khai cho doanh nghiệp |
| VD_SO | `vD_SO` | Text(35) |  | Số vận đơn | ✓ | ✓ |  | Dòng hàng - Cho phép lặp lại |
| CON_SO | `coN_SO` | Text(50) |  | Số Cont | ✓ | ✓ |  | Dòng hàng - Cho phép lặp lại |
| SEL_SO | `seL_SO` | Text(50) |  | Số seal | ✓ | ✓ |  | Dòng hàng - Cho phép lặp lại |
| GHI_CHU | `ghI_CHU` | Text(255) |  | Ghi chú |  | ✓ |  | Dòng hàng - Cho phép lặp lại |
| USER_ID | `useR_ID` | Text(10) |  | User id tài khoản vnaccs | ✓ | ✓ | ✓ | User id tài khoản vnaccs |
</details>


#### V5ContainerRes – Hỏi kết quả khai danh sách container (bản V5)

- **Endpoint**: `POST {{FPT_BASE_URL}}/api/V5ContainerRes` · xác thực: Bearer token (từ /api/auth/login) · ⚠️ không có trong Postman (theo Excel)
- **Mục đích**: Theo REF_ID.
- **Khi nào gọi**: Sau V5ContainerReq.

<details><summary>Trường – Body + phản hồi (16 trường · KHAI BAO DANH SACH CONTAINER v1.1.xlsx / Hỏi kết quả danh sách container)</summary>

| Chỉ tiêu | Key JSON | Kiểu | Độ dài | Mô tả | Bắt buộc | Req | Res | Ghi chú |
|---|---|---|---|---|---|---|---|---|
| TK_SOTK | `tK_SOTK` | Text(12) |  | Số tờ khai VNACCS | ✓ | ✓ | ✓ |  |
| TK_NGAYDK | `tK_NGAYDK` | Datetime |  | Ngày đăng ký tờ khai | ✓ | ✓ | ✓ | dd/MM/yyyy |
| TK_MALH | `tK_MALH` | Text(5) |  | Mã loại hình tờ khai | ✓ | ✓ | ✓ |  |
| TK_MAHQ | `tK_MAHQ` | Text(4) |  | Mã chi cục Hải quan khai báo | ✓ | ✓ | ✓ |  |
| MA_DV | `mA_DV` | Text(13) |  | Mã số thuế khai báo | ✓ | ✓ | ✓ |  |
| TEN_DV | `teN_DV` | Text(200) |  | Tên doanh nghiệp khai báo | ✓ | ✓ | ✓ |  |
| MA_DAI_LY | `mA_DAI_LY` | Text(13) |  | Mã số thuế đại lý đại diện khai báo |  | ✓ | ✓ | Dùng chữ ký số đại lý khai cho doanh nghiệp |
| TEN_DAI_LY | `teN_DAI_LY` | Text(200) |  | Tên đại lý đại diện khai báo |  | ✓ | ✓ | Dùng chữ ký số đại lý khai cho doanh nghiệp |
| REF_ID | `reF_ID` | Text(50) |  | Số tham chiếu được trả từ hệ thống | ✓ | ✓ | ✓ |  |
| SO_TN | `sO_TN` | Text(20) |  | Số tiếp nhận |  |  | ✓ |  |
| NGAY_TN | `ngaY_TN` | Datetime |  | Ngày tiếp nhận |  |  | ✓ | dd/MM/yyyy |
| NAM_TN | `naM_TN` | Text(4) |  | Năm tiếp nhận |  |  | ✓ |  |
| TRANG_THAI | `tranG_THAI` | Text(2) |  | Trạng thái tiếp nhận |  |  | ✓ | 0: Nhập mới<br>10: Từ chối<br>11: Chưa có phản hồi<br>12: Hải quan chấp nhận |
| KET_QUA | `keT_QUA` | Text(255) |  | Kết quả trả về từ hệ thống |  |  | ✓ |  |
| USER_ID | `useR_ID` | Text(10) |  | User id tài khoản vnaccs | ✓ | ✓ | ✓ |  |
| errorList | `errorList` | List |  | Lỗi xử lý từ API |  |  | ✓ |  |
</details>


<details><summary>Trường – errorList[] (6 trường · KHAI BAO DANH SACH CONTAINER v1.1.xlsx / errorList)</summary>

| Chỉ tiêu | Key JSON | Kiểu | Độ dài | Mô tả | Bắt buộc | Req | Res | Ghi chú |
|---|---|---|---|---|---|---|---|---|
| errorCode | `errorCode` | Text(12) |  | Mã lỗi |  |  | ✓ |  |
| indexCode | `indexCode` | Text(50) |  | Mã chỉ tiêu lỗi |  |  | ✓ |  |
| nameCode | `nameCode` | Text(200) |  | Tên chỉ tiêu lỗi |  |  | ✓ |  |
| errorContent | `errorContent` | Text(max) |  | Nội dung chi tiết lỗi |  |  | ✓ |  |
| proposedSolution | `proposedSolution` | Text(max) |  | Hướng dẫn cách khắc phục |  |  | ✓ |  |
| rowPosition | `rowPosition` | Text(12) |  | Vị trí dòng hàng lỗi nếu có |  |  | ✓ |  |
</details>


#### KVGS – Thông tin qua khu vực giám sát (mã vạch container)

- **Endpoint**: `POST {{FPT_BASE_URL}}/api/KVGS` · xác thực: Bearer token (từ /api/auth/login)
- **Mục đích**: Lấy thông tin để đưa hàng/container qua khu vực giám sát hải quan (danh sách container + mã vạch) theo số tờ khai.
- **Khi nào gọi**: Sau thông quan / giải phóng hàng.
- **Body**: `TK_SOTK`, `TK_NGAYDK` (dd/MM/yyyy), `TK_MAHQ`, `MA_DV` – không có tài khoản VNACCS.
- **Ghi chú phản hồi**: Chưa có đặc tả phản hồi trong bộ tài liệu.

<details><summary>Body mẫu (Postman, đã che mật khẩu, cắt base64) – đầy đủ: samples/KVGS.request.json</summary>

```json
{
  "TK_SOTK": "307072510200",
  "TK_NGAYDK": "14/01/2025",
  "TK_MAHQ": "01NV",
  "MA_DV": "0106502680"
}
```
</details>


### In tờ khai / thông điệp

#### PrintObjectRefIDA – In tờ khai nhập từ object

- **Endpoint**: `POST {{FPT_BASE_URL}}/api/PrintObjectRefIDA` · xác thực: Bearer token (từ /api/auth/login)
- **Mục đích**: Gửi object tờ khai nhập (như phản hồi IDA/IID: objVN_IDA, _VANDON, _KTG, _THUE, _TRANGTHAI, _CTHQ, _HANG) → nhận bản in.
- **Khi nào gọi**: Khi cần bản in tờ khai theo mẫu Hải quan.
- **Ghi chú phản hồi**: Chưa có mẫu phản hồi (dự kiến file in base64 / XPS / PDF).

<details><summary>Body mẫu (Postman, đã che mật khẩu, cắt base64) – đầy đủ: samples/PrintObjectRefIDA.request.json</summary>

```json
{
  "objVN_IDA": {
    "tK_ID": null,
    "tK_ICB": "A12",
    "tK_CCC": null,
    "tK_MTC": "2",
    "tK_SKB": "4",
    "tK_ICN": 107953274920,
    "tK_JKN": null,
    "tK_FIC": null,
    "tK_BNO": null,
    "tK_DNO": null,
    "tK_TDN": null,
    "tK_A06": " 1",
    "tK_A00": "8452",
    "tK_A07": "CCHQTN",
    "tK_CHB": "00",
    "tK_A09": "03/02/2026",
    "tK_AD11": "085457",
    "tK_AD21": null,
    "tK_AD31": null,
    "tK_RED": null,
    "tK_AAA": null,
    "tK_IMC": "4100811111001",
    "tK_IMN": "Nguyễn Duy Hoà",
    "tK_IMY": "(+084)",
    "tK_IMA": "THON XUAN LONG, XA GIA SON, HUYEN NHO QUAN, TINH NINH BINH, VIET NAM",
    "tK_IMT": "0909090909",
    "tK_NMC": null,
    "tK_NMN": null,
    "tK_EPC": null,
    "tK_EPN": "DAEKWANG VINA CO.,LTD",
    "tK_EPY": null,
    "tK_EPA": "#25. DAESEONG-RO 181BEON-GIL",
    "tK_EP2": "HANAM-SI,",
    "tK_EP3": "GYEONGGI-DO,",
    "tK_EP4": "KOREA",
    "tK_EPO": "KR",
    "tK_ENM": null,
    "tK_A37": null,
    "tK_A38": null,
    "tK_A39": null,
    "tK_OL1": "MO",
    "tK_OL2": null,
    "tK_OL3": null,
    "tK_OL4": null,
    "tK_OL5": null,
    "tK_IV1": "A",
    "tK_IV3": "YJ-181015-01",
    "tK_IV2": null,
    "tK_IVD": "30/09/2025",
    "tK_IVP": "KC",
    "tK_IP1": "A",
    "tK_IP2": "FOB",
    "tK_IP3": "USD",
    "tK_IP4": 29820,
    "tK_A86": 778300800,
    "tK_TP": 29820,
    "tK_A97": null,
    "tK_N4": null,
    "tK_SS1": null,
    "tK_SN1": null,
    "tK_SS2": null,
    "tK_SN2": null,
    "tK_SS3": null,
    "tK_SN3": null,
    "tK_SS4": null,
    "tK_SN4": null,
    "tK_SS5": null,
    "tK_SN5": null,
    "tK_ENC": "D",
    "tK_TPM": "1",
    "tK_BP": null,
    "tK_B08": "A",
    "tK_B12": "3",
    "tK_B13": "1",
    "tK_EA1": null,
    "tK_EB1": null,
    "tK_EA2": null,
    "tK_EB2": null,
    "tK_EA3": null,
    "tK_EB3": null,
    "tK_NT2": "HD: YJC-180629-01, ngay 29/06/2018;",
    "tK_REF": null,
    "tK_B16": "00002",
    "tK_ADY": null,
    "tK_ADZ": null,
    "tK_B23": null,
    "tK_KN1": null,
    "tK_KO1": null,
    "tK_KP1": null,
    "tK_KN2": null,
    "tK_KO2": null,
    "tK_KP2": null,
    "tK_KN3": null,
    "tK_KO3": null,
    "tK_KP3": null,
    "tK_KN4": null,
    "tK_KO4": null,
    "tK_KP4": null,
    "tK_KN5": null,
    "tK_KO5": null,
    "tK_KP5": null,
    "tK_KN6": null,
    "tK_KO6": null,
    "tK_KP6": null,
    "tK_DPD": null,
    "tK_ST1": null,
    "tK_AD1": null,
    "tK_SD1": null,
    "tK_ST2": null,
    "tK_AD2": null,
    "tK_SD2": null,
    "tK_ST3": null,
    "tK_AD3": null,
    "tK_SD3": null,
    "tK_ARP": null,
    "tK_ADT": null,
    "tK_RYA": null,
    "tK_SBC": null,
    "tK_BCN": null,
    "tK_SCN": null,
    "tK_SCM": null,
    "tK_ICC": null,
    "tK_ICD": null,
    "tK_CH": null,
    "tK_BCM": null,
    "tK_BYA": null,
    "tK_BRC": null,
    "tK_TRANGTHAI": null,
    "tK_LUONG": null,
    "tK_THONGQUAN": null,
    "edI_ID": null,
    "hD_ID": null,
    "tK_NGAYHT": null,
    "tK_LOAIHINHTK": null
  },
  "objVN_IDA_VANDON": {
    "isView": false,
    "vD_ID": null,
    "tK_ID": null,
    "vD_BL1": "ASA",
    "vD_BL2": null,
    "vD_BL3": null,
    "vD_BL4": null,
    "vD_BL5": null,
    "vD_NO": "208",
    "vD_NOT": "CT",
    "vD_GW": 7553.3,
    "vD_GWT": "KGM",
    "vD_COC": "1",
    "vD_ST": "03CCS04",
    "vD_A51": "CANG PTSC DINH VU M2",
    "vD_DST": "VNPTS",
    "vD_DSN": "PTSC DINH VU",
    "vD_PSC": "CNNGB",
    "vD_PSN": "NINGBO",
    "vD_VSC": "9999",
    "vD_VSN": "KUO LUNG 1841S",
    "vD_ARR": "03/02/2026",
    "vD_MRK": null,
    "vD_ISD": null,
    "vD_DINHDANH": false,
    "vD_DINHDANH3952": false,
    "vD_HW1": null,
    "vD_HW2": null,
    "vD_HW3": null,
    "vD_HW4": null,
    "vD_HW5": null,
    "vD_COHAWB": false,
    "vD_DINHDANHTEMP": null,
    "vD_YEAR1": null,
    "vD_YEAR2": null,
    "vD_YEAR3": null,
    "vD_YEAR4": null,
    "vD_YEAR5": null
  },
  "objVN_IDA_KTG": {
    "isView": false,
    "ktG_ID": null,
    "tK_ID": null,
    "ktG_VD1": "6",
    "ktG_VD2": null,
    "ktG_A93": null,
    "ktG_A94": null,
    "ktG_A95": null,
    "ktG_VCC": null,
    "ktG_VPC": null,
    "ktG_FR1": "A",
    "ktG_FR2": "USD",
    "ktG_FR3": 300,
    "ktG_IN1": "D",
    "ktG_IN2": null,
    "ktG_IN3": null,
    "ktG_IN4": null,
    "ktG_VR1": null,
    "ktG_VI1": null,
    "ktG_VC1": null,
    "ktG_VP1": null,
    "ktG_VT1": null,
    "ktG_VR2": null,
    "ktG_VI2": null,
    "ktG_VC2": null,
    "ktG_VP2": null,
    "ktG_VT2": null,
    "ktG_VR3": null,
    "ktG_VI3": null,
    "ktG_VC3": null,
    "ktG_VP3": null,
    "ktG_VT3": null,
    "ktG_VR4": null,
    "ktG_VI4": null,
    "ktG_VC4": null,
    "ktG_VP4": null,
    "ktG_VT4": null,
    "ktG_VR5": null,
    "ktG_VI5": null,
    "ktG_VC5": null,
    "ktG_VP5": null,
    "ktG_VT5": null,
    "ktG_VLD": "03022026#&PHUONG THUC THANH TOAN: TT"
  },
  "objVN_IDA_THUE": {
    "isView": false,
    "thuE_ID": null,
    "tK_ID": null,
    "thuE_KF1": "V",
    "thuE_KG1": "Thuế GTGT",
    "thuE_KH1": 77830080,
    "thuE_KI1": "1",
    "thuE_KF2": null,
    "thuE_KG2": null,
    "thuE_KH2": null,
    "thuE_KI2": null,
    "thuE_KF3": null,
    "thuE_KG3": null,
    "thuE_KH3": null,
    "thuE_KI3": null,
    "thuE_KF4": null,
    "thuE_KG4": null,
    "thuE_KH4": null,
    "thuE_KI4": null,
    "thuE_KF5": null,
    "thuE_KG5": null,
    "thuE_KH5": null,
    "thuE_KI5": null,
    "thuE_KF6": null,
    "thuE_KG6": null,
    "thuE_KH6": null,
    "thuE_KI6": null,
    "thuE_B02": 77830080,
    "thuE_B03": null,
    "thuE_KJ1": "USD",
    "thuE_KK1": 25840,
    "thuE_KJ2": null,
    "thuE_KK2": null,
    "thuE_KJ3": null,
    "thuE_KK3": null,
    "thuE_NK": null,
    "thuE_TV": null,
    "thuE_PBDX": null,
    "thuE_TTDB": null,
    "thuE_MT": null,
    "thuE_VAT": null,
    "thuE_TONG": null
  },
  "objVN_IDA_TRANGTHAI": {
    "isView": false,
    "tK_ID": null,
    "tK_ADY": null,
    "tK_ADZ": null,
    "tK_C20": null,
    "tK_C21": null,
    "tK_AD4": null,
    "tK_C22": "03/02/2026",
    "tK_AD5": "085457",
  
```
</details>


#### PrintObjectRef – In tờ khai xuất từ object

- **Endpoint**: `POST {{FPT_BASE_URL}}/api/PrintObjectRef` · xác thực: Bearer token (từ /api/auth/login)
- **Mục đích**: Như trên cho tờ khai xuất (objVN_EDA, _CON, _TRANGTHAI, _CTHQ, _HANG).
- **Khi nào gọi**: Khi cần bản in.
- **Ghi chú phản hồi**: Chưa có mẫu phản hồi.

<details><summary>Body mẫu (Postman, đã che mật khẩu, cắt base64) – đầy đủ: samples/PrintObjectRef.request.json</summary>

```json
{
  "objVN_EDA": {
    "isView": false,
    "tK_ID": "TFECUSTEST01",
    "hD_ID": null,
    "tK_ECN": 307149098930,
    "tK_JKN": null,
    "tK_FIC": null,
    "tK_BNO": null,
    "tK_DNO": null,
    "tK_TDN": null,
    "tK_K07": null,
    "tK_ECB": "B11",
    "tK_CCC": "B",
    "tK_CH": null,
    "tK_MTC": "3",
    "tK_K01": "5512",
    "tK_K08": "KYHAQN",
    "tK_ECD": null,
    "tK_CHB": "00",
    "tK_K10": null,
    "tK_RT1": null,
    "tK_AD21": null,
    "tK_AD31": null,
    "tK_RID": null,
    "tK_AAA": null,
    "tK_EPC": "4100811111001",
    "tK_EPN": "Nguyễn Duy Hoà",
    "tK_EPP": "(+84)",
    "tK_EPA": "123 NAM KỲ KHỞI NGHĨA QUẬN 1 TPHCM",
    "tK_EPT": "0909113113",
    "tK_EXC": null,
    "tK_EXN": null,
    "tK_CGC": null,
    "tK_ECC": null,
    "tK_CGN": "O.D.S COMPANY.,LTD",
    "tK_CGP": "(+856)",
    "tK_CGA": "2 FLOOR, 44, JANGHAN-RO,",
    "tK_CAT": "DONGDAEMOON-GU,",
    "tK_CAC": "SEOUL,",
    "tK_CAS": "SOUTH KOREA",
    "tK_CGK": "KR",
    "tK_K32": null,
    "tK_K33": null,
    "tK_K34": null,
    "tK_EKN": "BL232322442223",
    "tK_NO": "23",
    "tK_NOT": "PK",
    "tK_GW": 600,
    "tK_GWT": "KGM",
    "tK_ST": "27PCC81",
    "tK_K42": "CTY KIM GIANG",
    "tK_DSC": "KRINC",
    "tK_DSN": "INCHEON",
    "tK_PSC": "VNGEE",
    "tK_PSN": "GREEN PORT (HP)",
    "tK_VSC": "9999",
    "tK_VSN": "PEGASUS PETA 0021N",
    "tK_SYM": "18/02/2025",
    "tK_MRK": "FILTER FABRIC IS A SPECIALTY FABRIC THAT IS RECOGNIZED FOR ITS DURABILITY AND USEFULNESS ITS RESISTANT TO BOTH HEAT AND CHEMICALS 33333333",
    "tK_SS1": "AG01",
    "tK_SN1": "39922GF1234412GH2234",
    "tK_SS2": "AG02",
    "tK_SN2": "39922GF1234412GH2234",
    "tK_SS3": "ZX03",
    "tK_SN3": "39922GF1234412GH2234",
    "tK_SS4": "BD02",
    "tK_SN4": "39922GF1234412GH2234",
    "tK_SS5": "ZY03",
    "tK_SN5": "39922GF1234412GH2234",
    "tK_IV1": "A",
    "tK_IV3": "DW150609/XT",
    "tK_IV2": null,
    "tK_IVD": "03/10/2024",
    "tK_BRC": null,
    "tK_IVP": "KHONGTT",
    "tK_BYA": null,
    "tK_IP2": "FOB",
    "tK_BCM": null,
    "tK_IP3": "USD",
    "tK_BCN": null,
    "tK_IP4": 5543.17,
    "tK_IP1": "B",
    "tK_SBC": null,
    "tK_FCD": "USD",
    "tK_RYA": null,
    "tK_FKK": 5543.17,
    "tK_SCM": null,
    "tK_RC1": "USD",
    "tK_RD1": 25300,
    "tK_SCN": null,
    "tK_RC2": null,
    "tK_RD2": null,
    "tK_TP": null,
    "tK_K68": null,
    "tK_CNV": null,
    "tK_TPM": "2",
    "tK_ENC": "D",
    "tK_PAY": "A",
    "tK_ETA": null,
    "tK_AD7": null,
    "tK_TCO": null,
    "tK_SAM": null,
    "tK_AD8": null,
    "tK_K69": "3",
    "tK_K70": "1",
    "tK_EA1": null,
    "tK_EB1": null,
    "tK_EA2": null,
    "tK_EB2": null,
    "tK_EA3": null,
    "tK_EB3": null,
    "tK_NT2": "NPL xuat tra tu TKNK:100260186460 ngay 05/01/2015",
    "tK_REF": null,
    "tK_K82": null,
    "tK_DPD": "18/02/2025",
    "tK_ST1": "03CEC03",
    "tK_AD1": "18/02/2025",
    "tK_SD1": "18/02/2025",
    "tK_ST2": "03CCC01",
    "tK_AD2": "18/02/2025",
    "tK_SD2": "18/02/2025",
    "tK_ST3": "03CCC02",
    "tK_AD3": "18/02/2025",
    "tK_SD3": "18/02/2025",
    "tK_ARP": "03CCC03",
    "tK_ADT": "18/02/2025",
    "tK_NGAYTX": null,
    "tK_NGAYHT": null,
    "tK_LOAIHINHTK": null,
    "malhV4": null,
    "hD_SO": null,
    "branchCode": null,
    "shptJobNo": null,
    "shptJobDate": null,
    "shptMsgType": null,
    "tK_NOIBO_SOHD": null,
    "tK_NOIBO_NGAYKY": null,
    "tK_NOIBO_NGAYHH": null,
    "dataManagement": 1,
    "dataStatus": 1,
    "stopChangeEvent": false
  },
  "objVN_EDA_CON": {
    "isView": false,
    "coN_ID": null,
    "tK_ID": null,
    "coN_VC1": "01ABA02",
    "coN_VC2": "01ABA03",
    "coN_VC3": "01ABA04",
    "coN_VC4": "01ABC01",
    "coN_VC5": "01ABC02",
    "coN_VN": "CTY CP DVHH NOI BAI",
    "coN_VA": "Cung điện Cửu Công Chúa, Thị trấn Trạm Trôi, Hoài Đức, Hà Nội",
    "coN_C01": "CMAU1234452",
    "coN_C02": "CMAU1234453",
    "coN_C03": null,
    "coN_C04": null,
    "coN_C05": null,
    "coN_C06": null,
    "coN_C07": null,
    "coN_C08": null,
    "coN_C09": null,
    "coN_C10": null,
    "coN_C11": null,
    "coN_C12": null,
    "coN_C13": null,
    "coN_C14": null,
    "coN_C15": null,
    "coN_C16": null,
    "coN_C17": null,
    "coN_C18": null,
    "coN_C19": null,
    "coN_C20": null,
    "coN_C21": null,
    "coN_C22": null,
    "coN_C23": null,
    "coN_C24": null,
    "coN_C25": null,
    "coN_C26": null,
    "coN_C27": null,
    "coN_C28": null,
    "coN_C29": null,
    "coN_C30": null,
    "coN_C31": null,
    "coN_C32": null,
    "coN_C33": null,
    "coN_C34": null,
    "coN_C35": null,
    "coN_C36": null,
    "coN_C37": null,
    "coN_C38": null,
    "coN_C39": null,
    "coN_C40": null,
    "coN_C41": null,
    "coN_C42": null,
    "coN_C43": null,
    "coN_C44": null,
    "coN_C45": null,
    "coN_C46": null,
    "coN_C47": null,
    "coN_C48": null,
    "coN_C49": null,
    "coN_C50": null,
    "dataManagement": 1,
    "dataStatus": 1,
    "stopChangeEvent": false
  },
  "objVN_EDA_TRANGTHAI": {
    "isView": false,
    "tK_ID": null,
    "tK_AD4": null,
    "tK_K86": null,
    "tK_AD5": null,
    "tK_K87": null,
    "tK_CCD": null,
    "tK_LUONG": "0",
    "tK_TRANGTHAI": "A",
    "tK_THONGQUAN": "0",
    "tK_K97": null,
    "tK_AD6": null,
    "tK_K98": null,
    "tK_AD71": null,
    "tK_K95": null,
    "tK_AD81": null,
    "tK_K96": null,
    "dataManagement": 1,
    "dataStatus": 1,
    "stopChangeEvent": false
  },
  "objVN_EDA_CTHQ": {
    "isView": false,
    "cthQ_ID": null,
    "tK_ID": null,
    "cthQ_CCM": null,
    "cthQ_D01": null,
    "cthQ_T01": null,
    "cthQ_I01": null,
    "cthQ_D02": null,
    "cthQ_T02": null,
    "cthQ_I02": null,
    "cthQ_D03": null,
    "cthQ_T03": null,
    "cthQ_I03": null,
    "cthQ_D04": null,
    "cthQ_T04": null,
    "cthQ_I04": null,
    "cthQ_D05": null,
    "cthQ_T05": null,
    "cthQ_I05": null,
    "cthQ_D06": null,
    "cthQ_T06": null,
    "cthQ_I06": null,
    "cthQ_D07": null,
    "cthQ_T07": null,
   
```
</details>


#### PrintEdiRef – In thông điệp từ EDI

- **Endpoint**: `POST {{FPT_BASE_URL}}/api/PrintEdiRef` · xác thực: Bearer token (từ /api/auth/login)
- **Mục đích**: Gửi `ediBase64` (lấy từ objMsgResult.ediBase64 của phản hồi) → bản in thông điệp tương ứng (VD thông báo phân luồng VAE2LD0).
- **Khi nào gọi**: In các thông điệp Hải quan trả về.
- **Ghi chú phản hồi**: Chưa có mẫu phản hồi.

<details><summary>Body mẫu (Postman, đã che mật khẩu, cắt base64) – đầy đủ: samples/PrintEdiRef.request.json</summary>

```json
{
  "ediBase64": "ICBQICAgICBWQUUyTEQwMjAxODA5MjExNDQ1ICBI…(base64/chuỗi dài 25124 ký tự)"
}
```
</details>


#### PrintXPS – Lấy file in XPS theo REF_ID

- **Endpoint**: `POST {{FPT_BASE_URL}}/api/PrintXPS` · xác thực: Bearer token (từ /api/auth/login)
- **Mục đích**: Lấy bản in dạng XPS theo `reF_ID`.
- **Khi nào gọi**: Sau các API trả REF_ID.
- **Ghi chú phản hồi**: Chưa có mẫu phản hồi.

<details><summary>Body mẫu (Postman, đã che mật khẩu, cắt base64) – đầy đủ: samples/PrintXPS.request.json</summary>

```json
{
  "reF_ID": "4B24AA2EEB4043079636D581F0754347"
}
```
</details>


### Danh mục

#### SyncCategory – Đồng bộ danh mục chuẩn VNACCS

- **Endpoint**: `POST {{FPT_BASE_URL}}/api/SyncCategory` · xác thực: Bearer token (từ /api/auth/login)
- **Mục đích**: Lấy danh mục VNACCS (chi cục A038, quốc gia A015, loại hình, cảng/sân bay A016, kho A202, đơn vị tính A501/A316, tiền tệ A527, biểu thuế A404, mã miễn giảm A520, ngân hàng…).
- **Khi nào gọi**: Định kỳ (vd hằng ngày) để cập nhật danh mục thay vì nạp tay.
- **Body**: Body rỗng trong Postman.
- **Ghi chú phản hồi**: Các bảng VN_A014…VN_A601 – xem bảng trường bên dưới (cột Response).

<details><summary>Trường – VN_A014 – Dữ liệu bộ phận xử lý tờ khai (4 trường · DANH MUC CHUAN VNACCS.xlsx / VN_A014)</summary>

| Chỉ tiêu | Key JSON | Kiểu | Độ dài | Mô tả | Bắt buộc | Req | Res | Ghi chú |
|---|---|---|---|---|---|---|---|---|
| MA_HQ | `mA_HQ` | Text(2) |  | Mã đội thủ tục |  |  | ✓ |  |
| TEN_HQ | `teN_HQ` | Text(255) |  | Tên đội thủ tục |  |  | ✓ |  |
| MA_CHICUC | `mA_CHICUC` | Text(5) |  | Mã chi cục Hải quan |  |  | ✓ |  |
| HIEN_THI | `hieN_THI` | Text(1) |  | Hiệu lực |  |  | ✓ | 1: Hiệu lực<br>0: Hết hiệu lực |
</details>


<details><summary>Trường – VN_A015 – Dữ liệu quốc gia (3 trường · DANH MUC CHUAN VNACCS.xlsx / VN_A015)</summary>

| Chỉ tiêu | Key JSON | Kiểu | Độ dài | Mô tả | Bắt buộc | Req | Res | Ghi chú |
|---|---|---|---|---|---|---|---|---|
| MA_NUOC | `mA_NUOC` | Text(5) |  | Mã nước |  |  | ✓ |  |
| TEN_NUOC | `teN_NUOC` | Text(255) |  | Tên nước |  |  | ✓ |  |
| HIEN_THI | `hieN_THI` | Text(1) |  | Hiệu lực |  |  | ✓ | 1: Hiệu lực<br>0: Hết hiệu lực |
</details>


<details><summary>Trường – VN_A038 – Dữ liệu Chi Cục Hải Quan (4 trường · DANH MUC CHUAN VNACCS.xlsx / VN_A038)</summary>

| Chỉ tiêu | Key JSON | Kiểu | Độ dài | Mô tả | Bắt buộc | Req | Res | Ghi chú |
|---|---|---|---|---|---|---|---|---|
| MA_HQ | `mA_HQ` | Text(2) |  | Mã chi cục |  |  | ✓ |  |
| TEN_HQ | `teN_HQ` | Text(255) |  | Tên chi cục |  |  | ✓ |  |
| HIEN_THI | `hieN_THI` | Text(1) |  | Hiệu lực |  |  | ✓ | 1: Hiệu lực<br>0: Hết hiệu lực |
| TEN_VIET_TAT | `teN_VIET_TAT` | Text(50) |  | Tên viết tắt |  |  | ✓ |  |
</details>


<details><summary>Trường – VN_A546 – Dữ liệu danh mục HYS (3 trường · DANH MUC CHUAN VNACCS.xlsx / VN_A546)</summary>

| Chỉ tiêu | Key JSON | Kiểu | Độ dài | Mô tả | Bắt buộc | Req | Res | Ghi chú |
|---|---|---|---|---|---|---|---|---|
| MA | `ma` | Text(5) |  | Mã |  |  | ✓ |  |
| TEN | `ten` | Text(255) |  | Tên |  |  | ✓ |  |
| HIEN_THI | `hieN_THI` | Text(1) |  | Hiệu lực |  |  | ✓ | 1: Hiệu lực<br>0: Hết hiệu lực |
</details>


<details><summary>Trường – VN_A_ICB – Dữ liệu Loại Hình Nhập Khẩu (3 trường · DANH MUC CHUAN VNACCS.xlsx / VN_A_ICB)</summary>

| Chỉ tiêu | Key JSON | Kiểu | Độ dài | Mô tả | Bắt buộc | Req | Res | Ghi chú |
|---|---|---|---|---|---|---|---|---|
| MA_LH | `mA_LH` | Text(5) |  | Mã |  |  | ✓ |  |
| TEN_LH | `teN_LH` | Text(255) |  | Tên |  |  | ✓ |  |
| HIEN_THI | `hieN_THI` | Text(1) |  | Hiệu lực |  |  | ✓ | 1: Hiệu lực<br>0: Hết hiệu lực |
</details>


<details><summary>Trường – VN_A016_AIR – Dữ liệu Sân Bay Trong Nước (3 trường · DANH MUC CHUAN VNACCS.xlsx / VN_A016_AIR)</summary>

| Chỉ tiêu | Key JSON | Kiểu | Độ dài | Mô tả | Bắt buộc | Req | Res | Ghi chú |
|---|---|---|---|---|---|---|---|---|
| MA | `ma` | Text(5) |  | Mã |  |  | ✓ |  |
| TEN | `ten` | Text(255) |  | Tên |  |  | ✓ |  |
| HIEN_THI | `hieN_THI` | Text(1) |  | Hiệu lực |  |  | ✓ | 1: Hiệu lực<br>0: Hết hiệu lực |
</details>


<details><summary>Trường – VN_A016_VN – Dữ liệu Sân Bay Trong Nước (3 trường · DANH MUC CHUAN VNACCS.xlsx / VN_A016_VN)</summary>

| Chỉ tiêu | Key JSON | Kiểu | Độ dài | Mô tả | Bắt buộc | Req | Res | Ghi chú |
|---|---|---|---|---|---|---|---|---|
| MA | `ma` | Text(10) |  | Mã |  |  | ✓ |  |
| TEN | `ten` | Text(255) |  | Tên |  |  | ✓ |  |
| HIEN_THI | `hieN_THI` | Text(1) |  | Hiệu lực |  |  | ✓ | 1: Hiệu lực<br>0: Hết hiệu lực |
</details>


<details><summary>Trường – VN_A202 – Dữ liệu Địa Điểm Lưu Kho (5 trường · DANH MUC CHUAN VNACCS.xlsx / VN_A202)</summary>

| Chỉ tiêu | Key JSON | Kiểu | Độ dài | Mô tả | Bắt buộc | Req | Res | Ghi chú |
|---|---|---|---|---|---|---|---|---|
| MA | `ma` | Text(10) |  | Mã |  |  | ✓ |  |
| TEN | `ten` | Text(255) |  | Tên |  |  | ✓ |  |
| MA_HQ | `mA_HQ` | Text(5) |  | Mã chi cục |  |  | ✓ |  |
| BONDED_AREA_DEMARCATION | `bondeD_AREA_DEMARCATION` | Text(255) |  | Khu vực |  |  | ✓ |  |
| HIEN_THI | `hieN_THI` | Text(1) |  | Hiệu lực |  |  | ✓ | 1: Hiệu lực<br>0: Hết hiệu lực |
</details>


<details><summary>Trường – VN_A501 – Dữ liệu đơn vị tính (3 trường · DANH MUC CHUAN VNACCS.xlsx / VN_A501)</summary>

| Chỉ tiêu | Key JSON | Kiểu | Độ dài | Mô tả | Bắt buộc | Req | Res | Ghi chú |
|---|---|---|---|---|---|---|---|---|
| MA_DVT | `mA_DVT` | Text(5) |  | Mã |  |  | ✓ |  |
| TEN_DVT | `teN_DVT` | Text(255) |  | Tên |  |  | ✓ |  |
| HIEN_THI | `hieN_THI` | Text(1) |  | Hiệu lực |  |  | ✓ | 1: Hiệu lực<br>0: Hết hiệu lực |
</details>


<details><summary>Trường – VN_A_ECB – Dữ liệu Loại Hình Xuất Khẩu (3 trường · DANH MUC CHUAN VNACCS.xlsx / VN_A_ECB)</summary>

| Chỉ tiêu | Key JSON | Kiểu | Độ dài | Mô tả | Bắt buộc | Req | Res | Ghi chú |
|---|---|---|---|---|---|---|---|---|
| MA_LH | `mA_LH` | Text(5) |  | Mã |  |  | ✓ |  |
| TEN_LH | `teN_LH` | Text(255) |  | Tên |  |  | ✓ |  |
| HIEN_THI | `hieN_THI` | Text(1) |  | Hiệu lực |  |  | ✓ | 1: Hiệu lực<br>0: Hết hiệu lực |
</details>


<details><summary>Trường – VN_A016_FOREIGN – Dữ liệu địa điểm và sân bay nước ngoài (3 trường · DANH MUC CHUAN VNACCS.xlsx / VN_A016_FOREIGN)</summary>

| Chỉ tiêu | Key JSON | Kiểu | Độ dài | Mô tả | Bắt buộc | Req | Res | Ghi chú |
|---|---|---|---|---|---|---|---|---|
| MA | `ma` | Text(10) |  | Mã |  |  | ✓ |  |
| TEN | `ten` | Text(255) |  | Tên |  |  | ✓ |  |
| HIEN_THI | `hieN_THI` | Text(1) |  | Hiệu lực |  |  | ✓ | 1: Hiệu lực<br>0: Hết hiệu lực |
</details>


<details><summary>Trường – VN_A519 – Dữ liệu văn bản pháp lý (5 trường · DANH MUC CHUAN VNACCS.xlsx / VN_A519)</summary>

| Chỉ tiêu | Key JSON | Kiểu | Độ dài | Mô tả | Bắt buộc | Req | Res | Ghi chú |
|---|---|---|---|---|---|---|---|---|
| MA | `ma` | Text(5) |  | Mã |  |  | ✓ |  |
| TEN | `ten` | Text(255) |  | Tên |  |  | ✓ |  |
| HIEN_THI | `hieN_THI` | Text(1) |  | Hiệu lực |  |  | ✓ | 1: Hiệu lực<br>0: Hết hiệu lực |
| NGAY_VB | `ngaY_VB` | Datetime |  | Ngày văn bản |  |  | ✓ | yyyy-MM-dd |
| NOI_DUNG | `noI_DUNG` | Text(max) |  | Nội dung văn bản |  |  | ✓ |  |
</details>


<details><summary>Trường – VN_A527 – Dữ liệu đơn vị tiền tệ (3 trường · DANH MUC CHUAN VNACCS.xlsx / VN_A527)</summary>

| Chỉ tiêu | Key JSON | Kiểu | Độ dài | Mô tả | Bắt buộc | Req | Res | Ghi chú |
|---|---|---|---|---|---|---|---|---|
| MA | `ma` | Text(5) |  | Mã |  |  | ✓ |  |
| TEN | `ten` | Text(255) |  | Tên |  |  | ✓ |  |
| HIEN_THI | `hieN_THI` | Text(1) |  | Hiệu lực |  |  | ✓ | 1: Hiệu lực<br>0: Hết hiệu lực |
</details>


<details><summary>Trường – VN_A528 – Dữ liệu loại giấy phép (3 trường · DANH MUC CHUAN VNACCS.xlsx / VN_A528)</summary>

| Chỉ tiêu | Key JSON | Kiểu | Độ dài | Mô tả | Bắt buộc | Req | Res | Ghi chú |
|---|---|---|---|---|---|---|---|---|
| MA | `ma` | Text(5) |  | Mã |  |  | ✓ |  |
| TEN | `ten` | Text(max) |  | Tên |  |  | ✓ |  |
| HIEN_THI | `hieN_THI` | Text(1) |  | Hiệu lực |  |  | ✓ | 1: Hiệu lực<br>0: Hết hiệu lực |
</details>


<details><summary>Trường – VN_A404 – Dữ liệu biểu thuế (3 trường · DANH MUC CHUAN VNACCS.xlsx / VN_A404)</summary>

| Chỉ tiêu | Key JSON | Kiểu | Độ dài | Mô tả | Bắt buộc | Req | Res | Ghi chú |
|---|---|---|---|---|---|---|---|---|
| MA | `ma` | Text(5) |  | Mã |  |  | ✓ |  |
| TEN | `ten` | Text(255) |  | Tên |  |  | ✓ |  |
| HIEN_THI | `hieN_THI` | Text(1) |  | Hiệu lực |  |  | ✓ | 1: Hiệu lực<br>0: Hết hiệu lực |
</details>


<details><summary>Trường – VN_A507 – Dữ liệu mức thuế tuyệt đối (3 trường · DANH MUC CHUAN VNACCS.xlsx / VN_A507)</summary>

| Chỉ tiêu | Key JSON | Kiểu | Độ dài | Mô tả | Bắt buộc | Req | Res | Ghi chú |
|---|---|---|---|---|---|---|---|---|
| MA | `ma` | Text(5) |  | Mã |  |  | ✓ |  |
| TEN | `ten` | Text(255) |  | Tên |  |  | ✓ |  |
| HIEN_THI | `hieN_THI` | Text(1) |  | Hiệu lực |  |  | ✓ | 1: Hiệu lực<br>0: Hết hiệu lực |
</details>


<details><summary>Trường – VN_A520 – Dữ liệu mã miễn, giảm, không chịu thuế XNK (3 trường · DANH MUC CHUAN VNACCS.xlsx / VN_A520)</summary>

| Chỉ tiêu | Key JSON | Kiểu | Độ dài | Mô tả | Bắt buộc | Req | Res | Ghi chú |
|---|---|---|---|---|---|---|---|---|
| MA | `ma` | Text(5) |  | Mã |  |  | ✓ |  |
| TEN | `ten` | Text(255) |  | Tên |  |  | ✓ |  |
| HIEN_THI | `hieN_THI` | Text(1) |  | Hiệu lực |  |  | ✓ | 1: Hiệu lực<br>0: Hết hiệu lực |
</details>


<details><summary>Trường – VN_A_BANK – Dữ liệu ngân hàng (3 trường · DANH MUC CHUAN VNACCS.xlsx / VN_A_BANK)</summary>

| Chỉ tiêu | Key JSON | Kiểu | Độ dài | Mô tả | Bắt buộc | Req | Res | Ghi chú |
|---|---|---|---|---|---|---|---|---|
| MA | `ma` | Text(10) |  | Mã |  |  | ✓ |  |
| TEN | `ten` | Text(255) |  | Tên |  |  | ✓ |  |
| HIEN_THI | `hieN_THI` | Text(1) |  | Hiệu lực |  |  | ✓ | 1: Hiệu lực<br>0: Hết hiệu lực |
</details>


<details><summary>Trường – VN_A316 – Dữ liệu đơn vị tính số kiện (4 trường · DANH MUC CHUAN VNACCS.xlsx / VN_A316)</summary>

| Chỉ tiêu | Key JSON | Kiểu | Độ dài | Mô tả | Bắt buộc | Req | Res | Ghi chú |
|---|---|---|---|---|---|---|---|---|
| MA | `ma` | Text(5) |  | Mã |  |  | ✓ |  |
| TEN | `ten` | Text(255) |  | Tên |  |  | ✓ |  |
| TEN_VN | `teN_VN` | Text(255) |  | Tên tiếng việt |  |  | ✓ |  |
| HIEN_THI | `hieN_THI` | Text(1) |  | Hiệu lực |  |  | ✓ | 1: Hiệu lực<br>0: Hết hiệu lực |
</details>


<details><summary>Trường – VN_A620 – Dữ liệu danh mục đường bộ (3 trường · DANH MUC CHUAN VNACCS.xlsx / VN_A620)</summary>

| Chỉ tiêu | Key JSON | Kiểu | Độ dài | Mô tả | Bắt buộc | Req | Res | Ghi chú |
|---|---|---|---|---|---|---|---|---|
| MA | `ma` | Text(10) |  | Mã |  |  | ✓ |  |
| TEN | `ten` | Text(255) |  | Tên |  |  | ✓ |  |
| HIEN_THI | `hieN_THI` | Text(1) |  | Hiệu lực |  |  | ✓ | 1: Hiệu lực<br>0: Hết hiệu lực |
</details>


<details><summary>Trường – VN_A601 – Dữ liệu danh mục đường sắt (3 trường · DANH MUC CHUAN VNACCS.xlsx / VN_A601)</summary>

| Chỉ tiêu | Key JSON | Kiểu | Độ dài | Mô tả | Bắt buộc | Req | Res | Ghi chú |
|---|---|---|---|---|---|---|---|---|
| MA | `ma` | Text(10) |  | Mã |  |  | ✓ |  |
| TEN | `ten` | Text(255) |  | Tên |  |  | ✓ |  |
| HIEN_THI | `hieN_THI` | Text(1) |  | Hiệu lực |  |  | ✓ | 1: Hiệu lực<br>0: Hết hiệu lực |
</details>


## 4. Bảng mã thông điệp phản hồi (REP_VNACCS)

| Nghiệp vụ | Mã | Tên | Loại | Khối phản hồi |
|---|---|---|---|---|
| EDA | `VAE0LA0` | Khai Báo Tờ Khai Xuất Khẩu | C | objEDA |
| EDB | `VAE4000` | Khai Báo Trước Thông Tin Xuất Khẩu | C | objEDA |
| EDC | `VAE1LD0` | Tờ khai hàng hóa xuất khẩu (thông báo kết quả phân luồng) | P | objEDA |
| EDC | `VAE2LD0` | Tờ khai hàng hóa xuất khẩu (thông báo kết quả phân luồng) | P | objEDA |
| EDC | `VAE3LD0` | Tờ khai hàng hóa xuất khẩu (thông báo kết quả phân luồng) | P | objEDA |
| EDC | `VAE1RD0` | Tờ khai hàng hóa xuất kho ngoại quan (thông báo kết quả phân luồng) | P | objEDA |
| EDC | `VAE2RD0` | Tờ khai hàng hóa xuất kho ngoại quan (thông báo kết quả phân luồng) | P | objEDA |
| EDC | `VAE3RD0` | Tờ khai hàng hóa xuất kho ngoại quan (thông báo kết quả phân luồng) | P | objEDA |
| EDC | `VAE1LF0` | Tờ khai hàng hóa xuất khẩu (thông quan) | P | objEDA |
| EDC | `VAE2LF0` | Tờ khai hàng hóa xuất khẩu (thông quan) | P | objEDA |
| EDC | `VAE1RF0` | Tờ khai hàng hóa xuất kho ngoại quan (cho phép hàng hóa xuất kho) | P | objEDA |
| EDC | `VAF8010` | Chứng từ ghi số thuế phải thu | P | VAF8010 |
| EDC | `VAF8030` | Chứng từ ghi số lệ phí phải thu | P | VAF8030 |
| EDC | `VAF8040` | Chứng từ ghi số lệ phí phải thu | P | VAF8040 |
| EDC | `VAE4740` | Thông báo yêu cầu kiểm tra thực tế hàng hóa | P | VAE4740 |
| EDC | `VAE4780` | Thông báo hủy yêu cầu kiểm tra thực tế hàng hóa | P | VAE4780 |
| EDD | `VAE4110` | Gọi thông tin sửa đổi tờ khai xuất khẩu | C | objEDA |
| EDA01 | `VAE0LB0` | Khai báo sửa đổi tờ khai xuất khẩu | C | objEDA |
| EDE | `VAE2LE0` | Tờ khai bổ sung hàng hóa xuất khẩu (người khai Hải quan thực hiện) | P | objEDA |
| EDE | `VAE3LE0` | Tờ khai bổ sung hàng hóa xuất khẩu (người khai Hải quan thực hiện) | P | objEDA |
| EDE | `VAE2RE0` | Tờ khai bổ sung hàng hóa xuất kho ngoại quan (người khai hải quan thực hiện) | P | objEDA |
| EDE | `VAE3RE0` | Tờ khai bổ sung hàng hóa xuất kho ngoại quan (người khai hải quan thực hiện) | P | objEDA |
| EDE | `VAE2LY0` | Tờ khai bổ sung hàng hóa xuất khẩu (cơ quan Hải quan thực hiện) | P | objEDA |
| EDE | `VAE3LY0` | Tờ khai bổ sung hàng hóa xuất khẩu (cơ quan Hải quan thực hiện) | P | objEDA |
| EDE | `VAE2RY0` | Tờ khai bổ sung hàng hóa xuất kho ngoại quan (cơ quan Hải quan thực hiện) | P | objEDA |
| EDE | `VAE3RY0` | Tờ khai bổ sung hàng hóa xuất kho ngoại quan (cơ quan Hải quan thực hiện) | P | objEDA |
| EDE | `VAE8000` | Bản chỉ thị sửa đổi của Hải quan | P | objEDA |
| EDE | `VAE0LC0` | Tham chiếu thông tin tờ khai xuất khẩu | C | objEDA |
| AMA | `VAL8000` | Tờ khai bổ sung sau thông quan (chưa đăng ký) | P | objAMA |
| AMB | `VAL8010` | Khai Báo Trước Thông Tin Sửa Đổi | C | objAMA |
| AMC | `VAL8020` | Tờ khai bổ sung sau thông quan (đã đăng ký) | P | objAMA |
| AMC | `VAL8030` | Tờ khai bổ sung sau thông quan (được chấp nhận) | P | objAMA |
| AMC | `VAL8040` | Tờ khai bổ sung sau thông quan (được chấp nhận) | P | objAMA |
| AMC | `VAL8050` | Tờ khai bổ sung sau thông quan (được chấp nhận) | P | objAMA |
| AMC | `VAL8060` | Tờ khai bổ sung sau thông quan (thông báo không chấp nhận) | P | objAMA |
| HYS | `VAL0020` | Bản lưu thông tin tờ khai phổ thông | P | VAL0020 |

## 5. Thông điệp Hải quan trả về (khối vaF…, vaE…, vaL…, vaD…)

<details><summary>vaF8010 – Chứng từ ghi số thuế phải thu (70 trường)</summary>

| Chỉ tiêu | Key JSON | Kiểu | Độ dài | Mô tả | Bắt buộc | Req | Res | Ghi chú |
|---|---|---|---|---|---|---|---|---|
| TK_CSM | `tK_CSM` | Text | 70 | Tên cục Hải quan |  |  |  |  |
| TK_CBN | `tK_CBN` | Text | 70 | Tên mã Chi cục |  |  |  |  |
| TK_SPN | `tK_SPN` | Decimal | 12 | Số chứng từ thanh toán |  |  |  |  |
| TK_IEN | `tK_IEN` | Text | 100 | Tên doanh nghiệp |  |  |  |  |
| TK_IEC | `tK_IEC` | Text | 13 | Mã số thuế |  |  |  |  |
| TK_PCD | `tK_PCD` | Text | 7 | Mã bưu chính |  |  |  |  |
| TK_ADB | `tK_ADB` | Text | 100 | Địa chỉ doanh nghiệp |  |  |  |  |
| TK_TEL | `tK_TEL` | Text | 20 | Số điện thoại |  |  |  |  |
| TK_ICN | `tK_ICN` | Decimal | 12 | Số tờ khai |  |  |  |  |
| TK_DDC | `tK_DDC` | Date/Time | 8 | Ngày đăng ký tờ khai |  |  |  |  |
| TK_DKC | `tK_DKC` | Text | 3 | Mã loại hình tờ khai |  |  |  |  |
| TK_SBN | `tK_SBN` | Text | 70 | Ngân hàng bảo lãnh |  |  |  |  |
| TK_SBK | `tK_SBK` | Text | 11 | Mã ngân hàng bảo lãnh |  |  |  |  |
| TK_SIY | `tK_SIY` | Interger | 4 | Năm phát hành bảo lãnh |  |  |  |  |
| TK_SBS | `tK_SBS` | Text | 10 | …… |  |  |  |  |
| TK_SRN | `tK_SRN` | Text | 10 | Số chứng từ bảo lãnh |  |  |  |  |
| TK_TSN | `tK_TSN` | Text | 20 | Loại bảo lãnh |  |  |  |  |
| TK_BNM | `tK_BNM` | Text | 70 | Ngân hàng trả thay |  |  |  |  |
| TK_BCD | `tK_BCD` | Text | 11 | Mã ngân hàng trả thay |  |  |  |  |
| TK_BIY | `tK_BIY` | Interger | 4 | Năm phát hành hạn mức |  |  |  |  |
| TK_BPS | `tK_BPS` | Text | 10 | ………. |  |  |  |  |
| TK_BPN | `tK_BPN` | Text | 10 | Số chứng từ hạn mức |  |  |  |  |
| TK_TN1 | `tK_TN1` | Text | 9 | Tên sắc thuế 1 |  |  |  |  |
| TK_IS1 | `tK_IS1` | Interger | 4 | Tiểu mục 1 |  |  |  |  |
| TK_IT1 | `tK_IT1` | Interger | 12 | Số tiền thuế 1 |  |  |  |  |
| TK_IE1 | `tK_IE1` | Interger | 11 | Số tiền miễn thuế 1 |  |  |  |  |
| TK_IR1 | `tK_IR1` | Interger | 11 | Số thuế giảm 1 |  |  |  |  |
| TK_IM1 | `tK_IM1` | Interger | 12 | Số thuế phải thanh toán 1 |  |  |  |  |
| TK_TN2 | `tK_TN2` | Text | 9 | Tên sắc thuế 2 |  |  |  |  |
| TK_IS2 | `tK_IS2` | Interger | 4 | Tiểu mục 2 |  |  |  |  |
| TK_IT2 | `tK_IT2` | Interger | 12 | Số tiền thuế 2 |  |  |  |  |
| TK_IE2 | `tK_IE2` | Interger | 11 | Số tiền miễn thuế 2 |  |  |  |  |
| TK_IR2 | `tK_IR2` | Interger | 11 | Số thuế giảm 2 |  |  |  |  |
| TK_IM2 | `tK_IM2` | Interger | 12 | Số thuế phải thanh toán 2 |  |  |  |  |
| TK_TN3 | `tK_TN3` | Text | 9 | Tên sắc thuế 3 |  |  |  |  |
| TK_IS3 | `tK_IS3` | Interger | 4 | Tiểu mục 3 |  |  |  |  |
| TK_IT3 | `tK_IT3` | Interger | 12 | Số tiền thuế 3 |  |  |  |  |
| TK_IE3 | `tK_IE3` | Interger | 11 | Số tiền miễn thuế 3 |  |  |  |  |
| TK_IR3 | `tK_IR3` | Interger | 11 | Số thuế giảm 3 |  |  |  |  |
| TK_IM3 | `tK_IM3` | Interger | 12 | Số thuế phải thanh toán 3 |  |  |  |  |
| TK_TN4 | `tK_TN4` | Text | 9 | Tên sắc thuế 4 |  |  |  |  |
| TK_IS4 | `tK_IS4` | Interger | 4 | Tiểu mục 4 |  |  |  |  |
| TK_IT4 | `tK_IT4` | Interger | 12 | Số tiền thuế 4 |  |  |  |  |
| TK_IE4 | `tK_IE4` | Interger | 11 | Số tiền miễn thuế 4 |  |  |  |  |
| TK_IR4 | `tK_IR4` | Interger | 11 | Số thuế giảm 4 |  |  |  |  |
| TK_IM4 | `tK_IM4` | Interger | 12 | Số thuế phải thanh toán 4 |  |  |  |  |
| TK_TN5 | `tK_TN5` | Text | 9 | Tên sắc thuế 5 |  |  |  |  |
| TK_IS5 | `tK_IS5` | Interger | 4 | Tiểu mục 5 |  |  |  |  |
| TK_IT5 | `tK_IT5` | Interger | 12 | Số tiền thuế 5 |  |  |  |  |
| TK_IE5 | `tK_IE5` | Interger | 11 | Số tiền miễn thuế 5 |  |  |  |  |
| TK_IR5 | `tK_IR5` | Interger | 11 | Số thuế giảm 5 |  |  |  |  |
| TK_IM5 | `tK_IM5` | Interger | 12 | Số thuế phải thanh toán 5 |  |  |  |  |
| TK_TN6 | `tK_TN6` | Text | 9 | Tên sắc thuế 6 |  |  |  |  |
| TK_IS6 | `tK_IS6` | Interger | 4 | Tiểu mục 6 |  |  |  |  |
| TK_IT6 | `tK_IT6` | Interger | 12 | Số tiền thuế 6 |  |  |  |  |
| TK_IE6 | `tK_IE6` | Interger | 11 | Số tiền miễn thuế 6 |  |  |  |  |
| TK_IR6 | `tK_IR6` | Interger | 11 | Số thuế giảm 6 |  |  |  |  |
| TK_IM6 | `tK_IM6` | Interger | 12 | Số thuế phải thanh toán 6 |  |  |  |  |
| TK_TAM | `tK_TAM` | Interger | 12 | Tổng số thuế |  |  |  |  |
| TK_TA2 | `tK_TA2` | Interger | 11 | Tổng số tiền miễn thuế |  |  |  |  |
| TK_TA3 | `tK_TA3` | Interger | 11 | Tổng số tiền thuế giảm |  |  |  |  |
| TK_TA4 | `tK_TA4` | Interger | 12 | Tổng số thuế phải thanh toán |  |  |  |  |
| TK_CCC | `tK_CCC` | Text | 3 | Mã nguyên tệ |  |  |  |  |
| TK_EXR | `tK_EXR` | Decimal | 9 | Tỷ giá |  |  |  |  |
| TK_LOP | `tK_LOP` | Interger | 3 | Thời hạn ngày thanh toán |  |  |  |  |
| TK_EFD | `tK_EFD` | Date/Time | 8 | Kể từ ngày |  |  |  |  |
| TK_TAN | `tK_TAN` | Text | 15 | Số tài khoản kho bạc |  |  |  |  |
| TK_TNM | `tK_TNM` | Text | 70 | Tên kho bạc |  |  |  |  |
| TK_ARR | `tK_ARR` | Text | 255 | Xử lý chậm đóng |  |  |  |  |
| TK_DOP | `tK_DOP` | Date/Time | 8 | Ngày chứng từ |  |  |  |  |
</details>

<details><summary>vaF8030 – Chứng từ ghi số lệ phí phải thu (14 trường)</summary>

| Chỉ tiêu | Key JSON | Kiểu | Độ dài | Mô tả | Bắt buộc | Req | Res | Ghi chú |
|---|---|---|---|---|---|---|---|---|
| TK_CSM | `tK_CSM` | Text | 70 | Tên cục Hải quan |  |  |  |  |
| TK_CBN | `tK_CBN` | Text | 70 | Tên mã Chi cục |  |  |  |  |
| TK_SPN | `tK_SPN` | Decimal | 12 | Số chứng từ thanh toán |  |  |  |  |
| TK_IEN | `tK_IEN` | Text | 100 | Tên doanh nghiệp |  |  |  |  |
| TK_IEC | `tK_IEC` | Text | 13 | Mã số thuế |  |  |  |  |
| TK_PCD | `tK_PCD` | Text | 7 | Mã bưu chính |  |  |  |  |
| TK_ADB | `tK_ADB` | Text | 100 | Địa chỉ doanh nghiệp |  |  |  |  |
| TK_TEL | `tK_TEL` | Text | 20 | Số điện thoại |  |  |  |  |
| TK_ICN | `tK_ICN` | Decimal | 12 | Số tờ khai |  |  |  |  |
| TK_DDC | `tK_DDC` | Date/Time | 8 | Ngày đăng ký tờ khai |  |  |  |  |
| TK_DKC | `tK_DKC` | Text | 3 | Mã loại hình tờ khai |  |  |  |  |
| TK_TAN | `tK_TAN` | Text | 15 | Số tài khoản |  |  |  |  |
| TK_TNM | `tK_TNM` | Text | 70 | Kho bạc |  |  |  |  |
| TK_DOP | `tK_DOP` | Date/Time | 8 | Ngày chứng từ |  |  |  |  |
</details>

<details><summary>vaD8000 – Chỉ thị Hải quan (nhập) (51 trường)</summary>

| Chỉ tiêu | Key JSON | Kiểu | Độ dài | Mô tả | Bắt buộc | Req | Res | Ghi chú |
|---|---|---|---|---|---|---|---|---|
| TK_ICN | `tK_ICN` | Decimal | 12 | Số tờ khai |  |  |  |  |
| TK_JKN | `tK_JKN` | Text | 1 | Phân loại xuất báo cáo sửa đổi |  |  |  |  |
| TK_FIC | `tK_FIC` | Text | 12 | Số tờ khai đầu tiên |  |  |  |  |
| TK_BNO | `tK_BNO` | Long Integer |  | Số nhánh của tờ khai chia nhỏ |  |  |  |  |
| TK_DNO | `tK_DNO` | Long Integer |  | Tổng số tờ khai chia nhỏ |  |  |  |  |
| TK_TDN | `tK_TDN` | Decimal | 12 | Số tờ khai tạm nhập tái xuất tương ứng |  |  |  |  |
| TK_A06 | `tK_A06` | Text | 3 | Mã phân loại kiểm tra |  |  |  |  |
| TK_ICB | `tK_ICB` | Text | 5 | Mã loại hình |  |  |  |  |
| TK_CCC | `tK_CCC` | Text | 1 | Mã phân loại hàng hóa |  |  |  |  |
| TK_MTC | `tK_MTC` | Text | 1 | Mã hiệu phương thức vận chuyển |  |  |  |  |
| TK_SKB | `tK_SKB` | Text | 1 | Phân loại cá nhân/tổ chức |  |  |  |  |
| TK_A00 | `tK_A00` | Text | 4 | Mã số hàng hóa đại diện |  |  |  |  |
| TK_A07 | `tK_A07` | Text | 10 | Tên cơ quan Hải quan |  |  |  |  |
| TK_CHB | `tK_CHB` | Text | 2 | Nhóm xử lý hồ sơ |  |  |  |  |
| TK_A09 | `tK_A09` | Date/Time | 8 | Ngày đăng ký |  |  |  |  |
| TK_AD11 | `tK_AD11` | Text | 6 | Giờ đăng ký |  |  |  |  |
| TK_AD21 | `tK_AD21` | Date/Time | 8 | Ngày thay đổi đăng ký |  |  |  |  |
| TK_AD31 | `tK_AD31` | Text | 6 | Giờ thay đổi đăng ký |  |  |  |  |
| TK_RED | `tK_RED` | Date/Time | 8 | Thời hạn tái xuất |  |  |  |  |
| TK_AAA | `tK_AAA` | Text | 1 | Biểu thị trường hợp hết hạn |  |  |  |  |
| CTHQ_CCM | `cthQ_CCM` | Text | 1 | Phân loại chỉ thị của Hải quan |  |  |  |  |
| CTHQ_D01 | `cthQ_D01` | Date/Time | 8 | Ngày chỉ thị của Hải quan |  |  |  |  |
| CTHQ_T01 | `cthQ_T01` | Text | 120 | Tên chỉ thị của Hải quan |  |  |  |  |
| CTHQ_I01 | `cthQ_I01` | Memo | - | Nội dung chỉ thị của Hải quan |  |  |  |  |
| CTHQ_D02 | `cthQ_D02` | Date/Time | 8 | Ngày chỉ thị của Hải quan |  |  |  |  |
| CTHQ_T02 | `cthQ_T02` | Text | 120 | Tên chỉ thị của Hải quan |  |  |  |  |
| CTHQ_I02 | `cthQ_I02` | Memo | - | Nội dung chỉ thị của Hải quan |  |  |  |  |
| CTHQ_D03 | `cthQ_D03` | Date/Time | 8 | Ngày chỉ thị của Hải quan |  |  |  |  |
| CTHQ_T03 | `cthQ_T03` | Text | 120 | Tên chỉ thị của Hải quan |  |  |  |  |
| CTHQ_I03 | `cthQ_I03` | Memo | - | Nội dung chỉ thị của Hải quan |  |  |  |  |
| CTHQ_D04 | `cthQ_D04` | Date/Time | 8 | Ngày chỉ thị của Hải quan |  |  |  |  |
| CTHQ_T04 | `cthQ_T04` | Text | 120 | Tên chỉ thị của Hải quan |  |  |  |  |
| CTHQ_I04 | `cthQ_I04` | Memo | - | Nội dung chỉ thị của Hải quan |  |  |  |  |
| CTHQ_D05 | `cthQ_D05` | Date/Time | 8 | Ngày chỉ thị của Hải quan |  |  |  |  |
| CTHQ_T05 | `cthQ_T05` | Text | 120 | Tên chỉ thị của Hải quan |  |  |  |  |
| CTHQ_I05 | `cthQ_I05` | Memo | - | Nội dung chỉ thị của Hải quan |  |  |  |  |
| CTHQ_D06 | `cthQ_D06` | Date/Time | 8 | Ngày chỉ thị của Hải quan |  |  |  |  |
| CTHQ_T06 | `cthQ_T06` | Text | 120 | Tên chỉ thị của Hải quan |  |  |  |  |
| CTHQ_I06 | `cthQ_I06` | Memo | - | Nội dung chỉ thị của Hải quan |  |  |  |  |
| CTHQ_D07 | `cthQ_D07` | Date/Time | 8 | Ngày chỉ thị của Hải quan |  |  |  |  |
| CTHQ_T07 | `cthQ_T07` | Text | 120 | Tên chỉ thị của Hải quan |  |  |  |  |
| CTHQ_I07 | `cthQ_I07` | Memo | - | Nội dung chỉ thị của Hải quan |  |  |  |  |
| CTHQ_D08 | `cthQ_D08` | Date/Time | 8 | Ngày chỉ thị của Hải quan |  |  |  |  |
| CTHQ_T08 | `cthQ_T08` | Text | 120 | Tên chỉ thị của Hải quan |  |  |  |  |
| CTHQ_I08 | `cthQ_I08` | Memo | - | Nội dung chỉ thị của Hải quan |  |  |  |  |
| CTHQ_D09 | `cthQ_D09` | Date/Time | 8 | Ngày chỉ thị của Hải quan |  |  |  |  |
| CTHQ_T09 | `cthQ_T09` | Text | 120 | Tên chỉ thị của Hải quan |  |  |  |  |
| CTHQ_I09 | `cthQ_I09` | Memo | - | Nội dung chỉ thị của Hải quan |  |  |  |  |
| CTHQ_D10 | `cthQ_D10` | Date/Time | 8 | Ngày chỉ thị của Hải quan |  |  |  |  |
| CTHQ_T10 | `cthQ_T10` | Text | 120 | Tên chỉ thị của Hải quan |  |  |  |  |
| CTHQ_I10 | `cthQ_I10` | Memo | - | Nội dung chỉ thị của Hải quan |  |  |  |  |
</details>

<details><summary>vaD4870 – Yêu cầu kiểm tra thực tế hàng (nhập) (43 trường)</summary>

| Chỉ tiêu | Key JSON | Kiểu | Độ dài | Mô tả | Bắt buộc | Req | Res | Ghi chú |
|---|---|---|---|---|---|---|---|---|
| TK_K01 | `tK_K01` | Text | 38 | Phân loại kiểm tra thực tế |  |  |  |  |
| TK_K02 | `tK_K02` | Decimal | 12 | Số tờ khai |  |  |  |  |
| TK_K04 | `tK_K04` | Text | 3 | Mã loại hình |  |  |  |  |
| TK_ADA | `tK_ADA` | Text | 1 | Mã phân loại hàng hóa |  |  |  |  |
| TK_ADB | `tK_ADB` | Text | 1 | Mã phương thức vận chuyển |  |  |  |  |
| TK_K06 | `tK_K06` | Text | 5 | Mã khai báo |  |  |  |  |
| TK_K07 | `tK_K07` | Text | 6 | Mã chi cục |  |  |  |  |
| TK_K08 | `tK_K08` | Text | 2 | Mã đội thủ tục |  |  |  |  |
| TK_K09 | `tK_K09` | Text | 35 | Số vận đơn (Số B/L, số AWB v.v. …) |  |  |  |  |
| TK_K10 | `tK_K10` | Text | 20 | Số Masterbill |  |  |  |  |
| TK_K11 | `tK_K11` | Text | 7 | Mã địa điểm lưu kho |  |  |  |  |
| TK_K12 | `tK_K12` | Text | 20 | Tên địa điểm lưu kho |  |  |  |  |
| TK_K13 | `tK_K13` | Integer | 8 | Số kiện |  |  |  |  |
| TK_K14 | `tK_K14` | Text | 3 | Đơn vị tính số kiện |  |  |  |  |
| TK_K15 | `tK_K15` | Decimal | 10 | Tổng trọng lượng hàng (Gross) |  |  |  |  |
| TK_K16 | `tK_K16` | Text | 3 | Mã đơn vị tính trọng lượng (Gross) |  |  |  |  |
| TK_K20 | `tK_K20` | Text | 9 | Mã tàu dự kiến chất hàng |  |  |  |  |
| TK_K21 | `tK_K21` | Text | 35 | Tên tàu dự kiến chất hàng |  |  |  |  |
| TK_K25 | `tK_K25` | Text | 13 | Mã số thuế xuất khẩu |  |  |  |  |
| TK_K26 | `tK_K26` | Text | 100 | Tên doanh nghiệp xuất khẩu |  |  |  |  |
| TK_K29 | `tK_K29` | Text | 140 | Số ký hiệu |  |  |  |  |
| TK_K30 | `tK_K30` | Integer | 3 | Tổng số container |  |  |  |  |
| TK_A1 | `tK_A1` | Text | 12 | Số container |  |  |  |  |
| TK_A2 | `tK_A2` | Text | 12 | Số container |  |  |  |  |
| TK_A3 | `tK_A3` | Text | 12 | Số container |  |  |  |  |
| TK_A4 | `tK_A4` | Text | 12 | Số container |  |  |  |  |
| TK_A5 | `tK_A5` | Text | 12 | Số container |  |  |  |  |
| TK_K31 | `tK_K31` | Text | 1 | Cờ báo có hơn 5 container bị kiểm hóa |  |  |  |  |
| TK_K37 | `tK_K37` | Text | 5 | Mã địa điểm đích |  |  |  |  |
| TK_K38 | `tK_K38` | Text | 20 | Số quản lý nội bộ của doanh nghiệp |  |  |  |  |
| TK_K39 | `tK_K39` | Text | 1 | Mã phân loại kiểm tra |  |  |  |  |
| TK_K40 | `tK_K40` | Text | 14 | Tên phân loại kiểm tra |  |  |  |  |
| TK_K41 | `tK_K41` | Text | 3 | Phân loại kiểm tra ban đầu |  |  |  |  |
| TK_K42 | `tK_K42` | Text | 1 | Phân loại kiểm tra thực tế |  |  |  |  |
| TK_K43 | `tK_K43` | Text | 38 | Nội dung kiểm tra thực tế |  |  |  |  |
| TK_K44 | `tK_K44` | Text | 1 | Phân loại phụ trách |  |  |  |  |
| TK_K45 | `tK_K45` | Text | 8 | Người chuyển luồng kiểm hóa |  |  |  |  |
| TK_K46 | `tK_K46` | Text | 7 | Mã địa điểm thực hiện kiểm hóa |  |  |  |  |
| TK_K47 | `tK_K47` | Text | 20 | Tên địa điểm thực hiện kiểm hóa |  |  |  |  |
| TK_K50 | `tK_K50` | Text | 280 | Nội dung chỉ định kiểm hóa |  |  |  |  |
| TK_K51 | `tK_K51` | Text | 1 | Mã phương pháp chỉ định kiểm hóa |  |  |  |  |
| TK_K52 | `tK_K52` | Text | 32 | Tên phương pháp chỉ định kiểm hóa |  |  |  |  |
| TK_K53 | `tK_K53` | Text | 1 | Cờ báo kiểm hóa toàn bộ |  |  |  |  |
</details>

<details><summary>vaD4910 – Hủy kiểm tra thực tế hàng (nhập) (43 trường)</summary>

| Chỉ tiêu | Key JSON | Kiểu | Độ dài | Mô tả | Bắt buộc | Req | Res | Ghi chú |
|---|---|---|---|---|---|---|---|---|
| TK_K01 | `tK_K01` | Text | 38 | Phân loại kiểm tra thực tế |  |  |  |  |
| TK_K02 | `tK_K02` | Decimal | 12 | Số tờ khai |  |  |  |  |
| TK_K04 | `tK_K04` | Text | 3 | Mã loại hình |  |  |  |  |
| TK_ADA | `tK_ADA` | Text | 1 | Mã phân loại hàng hóa |  |  |  |  |
| TK_ADB | `tK_ADB` | Text | 1 | Mã phương thức vận chuyển |  |  |  |  |
| TK_K06 | `tK_K06` | Text | 5 | Mã khai báo |  |  |  |  |
| TK_K07 | `tK_K07` | Text | 6 | Mã chi cục |  |  |  |  |
| TK_K08 | `tK_K08` | Text | 2 | Mã đội thủ tục |  |  |  |  |
| TK_K09 | `tK_K09` | Text | 35 | Số vận đơn (Số B/L, số AWB v.v. …) |  |  |  |  |
| TK_K10 | `tK_K10` | Text | 20 | Số Masterbill |  |  |  |  |
| TK_K11 | `tK_K11` | Text | 7 | Mã địa điểm lưu kho |  |  |  |  |
| TK_K12 | `tK_K12` | Text | 20 | Tên địa điểm lưu kho |  |  |  |  |
| TK_K13 | `tK_K13` | Integer | 8 | Số kiện |  |  |  |  |
| TK_K14 | `tK_K14` | Text | 3 | Đơn vị tính số kiện |  |  |  |  |
| TK_K15 | `tK_K15` | Decimal | 10 | Tổng trọng lượng hàng (Gross) |  |  |  |  |
| TK_K16 | `tK_K16` | Text | 3 | Mã đơn vị tính trọng lượng (Gross) |  |  |  |  |
| TK_K20 | `tK_K20` | Text | 9 | Mã tàu dự kiến chất hàng |  |  |  |  |
| TK_K21 | `tK_K21` | Text | 35 | Tên tàu dự kiến chất hàng |  |  |  |  |
| TK_K25 | `tK_K25` | Text | 13 | Mã số thuế xuất khẩu |  |  |  |  |
| TK_K26 | `tK_K26` | Text | 100 | Tên doanh nghiệp xuất khẩu |  |  |  |  |
| TK_K29 | `tK_K29` | Text | 140 | Số ký hiệu |  |  |  |  |
| TK_K30 | `tK_K30` | Integer | 3 | Tổng số container |  |  |  |  |
| TK_A1 | `tK_A1` | Text | 12 | Số container |  |  |  |  |
| TK_A2 | `tK_A2` | Text | 12 | Số container |  |  |  |  |
| TK_A3 | `tK_A3` | Text | 12 | Số container |  |  |  |  |
| TK_A4 | `tK_A4` | Text | 12 | Số container |  |  |  |  |
| TK_A5 | `tK_A5` | Text | 12 | Số container |  |  |  |  |
| TK_K31 | `tK_K31` | Text | 1 | Cờ báo có hơn 5 container bị kiểm hóa |  |  |  |  |
| TK_K37 | `tK_K37` | Text | 5 | Mã địa điểm đích |  |  |  |  |
| TK_K38 | `tK_K38` | Text | 20 | Số quản lý nội bộ của doanh nghiệp |  |  |  |  |
| TK_K39 | `tK_K39` | Text | 1 | Mã phân loại kiểm tra |  |  |  |  |
| TK_K40 | `tK_K40` | Text | 14 | Tên phân loại kiểm tra |  |  |  |  |
| TK_K41 | `tK_K41` | Text | 3 | Phân loại kiểm tra ban đầu |  |  |  |  |
| TK_K42 | `tK_K42` | Text | 1 | Phân loại kiểm tra thực tế |  |  |  |  |
| TK_K43 | `tK_K43` | Text | 38 | Nội dung kiểm tra thực tế |  |  |  |  |
| TK_K44 | `tK_K44` | Text | 1 | Phân loại phụ trách |  |  |  |  |
| TK_K45 | `tK_K45` | Text | 8 | Người chuyển luồng kiểm hóa |  |  |  |  |
| TK_K46 | `tK_K46` | Text | 7 | Mã địa điểm thực hiện kiểm hóa |  |  |  |  |
| TK_K47 | `tK_K47` | Text | 20 | Tên địa điểm thực hiện kiểm hóa |  |  |  |  |
| TK_K50 | `tK_K50` | Text | 280 | Nội dung chỉ định kiểm hóa |  |  |  |  |
| TK_K51 | `tK_K51` | Text | 1 | Mã phương pháp chỉ định kiểm hóa |  |  |  |  |
| TK_K52 | `tK_K52` | Text | 32 | Tên phương pháp chỉ định kiểm hóa |  |  |  |  |
| TK_K53 | `tK_K53` | Text | 1 | Cờ báo kiểm hóa toàn bộ |  |  |  |  |
</details>

<details><summary>vaE8000 – Chỉ thị sửa đổi của Hải quan (xuất) (50 trường)</summary>

| Chỉ tiêu | Key JSON | Kiểu | Độ dài | Mô tả | Bắt buộc | Req | Res | Ghi chú |
|---|---|---|---|---|---|---|---|---|
| TK_ECN | `tK_ECN` | Decimal | 12 | Số tờ khai |  |  |  |  |
| TK_JKN | `tK_JKN` | Text | 1 | Phân loại xuất báo cáo sửa đổi |  |  |  |  |
| TK_FIC | `tK_FIC` | Text | 12 | Số tờ khai đầu tiên |  |  |  |  |
| TK_BNO | `tK_BNO` | Long Integer |  | Số nhánh của tờ khai chia nhỏ |  |  |  |  |
| TK_DNO | `tK_DNO` | Long Integer |  | Tổng số tờ khai chia nhỏ |  |  |  |  |
| TK_TDN | `tK_TDN` | Decimal | 12 | Số tờ khai tạm nhập tái xuất tương ứng |  |  |  |  |
| TK_K07 | `tK_K07` | Text | 3 | Mã phân loại kiểm tra |  |  |  |  |
| TK_ECB | `tK_ECB` | Text | 5 | Mã loại hình |  |  |  |  |
| TK_CCC | `tK_CCC` | Text | 1 | Mã phân loại hàng hóa |  |  |  |  |
| TK_MTC | `tK_MTC` | Text | 1 | Mã hiệu phương thức vận chuyển |  |  |  |  |
| TK_K01 | `tK_K01` | Text | 4 | Mã số thuế đại diện |  |  |  |  |
| TK_K08 | `tK_K08` | Text | 10 | Tên cơ quan Hải quan |  |  |  |  |
| TK_CHB | `tK_CHB` | Text | 2 | Nhóm xử lý hồ sơ |  |  |  |  |
| TK_K10 | `tK_K10` | Date/Time | 8 | Ngày đăng ký |  |  |  |  |
| TK_RT1 | `tK_RT1` | Text | 6 | Giờ đăng ký |  |  |  |  |
| TK_AD21 | `tK_AD21` | Date/Time | 8 | Ngày thay đổi đăng ký |  |  |  |  |
| TK_AD31 | `tK_AD31` | Text | 6 | Giờ thay đổi đăng ký |  |  |  |  |
| TK_RID | `tK_RID` | Date/Time | 8 | Thời hạn tái nhập khẩu |  |  |  |  |
| TK_AAA | `tK_AAA` | Text | 1 | Biểu thị trường hợp hết hạn |  |  |  |  |
| CTHQ_CCM | `cthQ_CCM` | Text | 1 | Phân loại chỉ thị của Hải quan |  |  |  |  |
| CTHQ_D01 | `cthQ_D01` | Date/Time | 8 | Ngày chỉ thị của Hải quan |  |  |  |  |
| CTHQ_T01 | `cthQ_T01` | Text | 120 | Tên chỉ thị của Hải quan |  |  |  |  |
| CTHQ_I01 | `cthQ_I01` | Memo | - | Nội dung chỉ thị của Hải quan |  |  |  |  |
| CTHQ_D02 | `cthQ_D02` | Date/Time | 8 | Ngày chỉ thị của Hải quan |  |  |  |  |
| CTHQ_T02 | `cthQ_T02` | Text | 120 | Tên chỉ thị của Hải quan |  |  |  |  |
| CTHQ_I02 | `cthQ_I02` | Memo | - | Nội dung chỉ thị của Hải quan |  |  |  |  |
| CTHQ_D03 | `cthQ_D03` | Date/Time | 8 | Ngày chỉ thị của Hải quan |  |  |  |  |
| CTHQ_T03 | `cthQ_T03` | Text | 120 | Tên chỉ thị của Hải quan |  |  |  |  |
| CTHQ_I03 | `cthQ_I03` | Memo | - | Nội dung chỉ thị của Hải quan |  |  |  |  |
| CTHQ_D04 | `cthQ_D04` | Date/Time | 8 | Ngày chỉ thị của Hải quan |  |  |  |  |
| CTHQ_T04 | `cthQ_T04` | Text | 120 | Tên chỉ thị của Hải quan |  |  |  |  |
| CTHQ_I04 | `cthQ_I04` | Memo | - | Nội dung chỉ thị của Hải quan |  |  |  |  |
| CTHQ_D05 | `cthQ_D05` | Date/Time | 8 | Ngày chỉ thị của Hải quan |  |  |  |  |
| CTHQ_T05 | `cthQ_T05` | Text | 120 | Tên chỉ thị của Hải quan |  |  |  |  |
| CTHQ_I05 | `cthQ_I05` | Memo | - | Nội dung chỉ thị của Hải quan |  |  |  |  |
| CTHQ_D06 | `cthQ_D06` | Date/Time | 8 | Ngày chỉ thị của Hải quan |  |  |  |  |
| CTHQ_T06 | `cthQ_T06` | Text | 120 | Tên chỉ thị của Hải quan |  |  |  |  |
| CTHQ_I06 | `cthQ_I06` | Memo | - | Nội dung chỉ thị của Hải quan |  |  |  |  |
| CTHQ_D07 | `cthQ_D07` | Date/Time | 8 | Ngày chỉ thị của Hải quan |  |  |  |  |
| CTHQ_T07 | `cthQ_T07` | Text | 120 | Tên chỉ thị của Hải quan |  |  |  |  |
| CTHQ_I07 | `cthQ_I07` | Memo | - | Nội dung chỉ thị của Hải quan |  |  |  |  |
| CTHQ_D08 | `cthQ_D08` | Date/Time | 8 | Ngày chỉ thị của Hải quan |  |  |  |  |
| CTHQ_T08 | `cthQ_T08` | Text | 120 | Tên chỉ thị của Hải quan |  |  |  |  |
| CTHQ_I08 | `cthQ_I08` | Memo | - | Nội dung chỉ thị của Hải quan |  |  |  |  |
| CTHQ_D09 | `cthQ_D09` | Date/Time | 8 | Ngày chỉ thị của Hải quan |  |  |  |  |
| CTHQ_T09 | `cthQ_T09` | Text | 120 | Tên chỉ thị của Hải quan |  |  |  |  |
| CTHQ_I09 | `cthQ_I09` | Memo | - | Nội dung chỉ thị của Hải quan |  |  |  |  |
| CTHQ_D10 | `cthQ_D10` | Date/Time | 8 | Ngày chỉ thị của Hải quan |  |  |  |  |
| CTHQ_T10 | `cthQ_T10` | Text | 120 | Tên chỉ thị của Hải quan |  |  |  |  |
| CTHQ_I10 | `cthQ_I10` | Memo | - | Nội dung chỉ thị của Hải quan |  |  |  |  |
</details>

<details><summary>vaE4740 – Yêu cầu kiểm tra thực tế hàng (xuất) (43 trường)</summary>

| Chỉ tiêu | Key JSON | Kiểu | Độ dài | Mô tả | Bắt buộc | Req | Res | Ghi chú |
|---|---|---|---|---|---|---|---|---|
| TK_K01 | `tK_K01` | Text | 38 | Phân loại kiểm tra thực tế |  |  |  |  |
| TK_K02 | `tK_K02` | Decimal | 12 | Số tờ khai |  |  |  |  |
| TK_K04 | `tK_K04` | Text | 3 | Mã loại hình |  |  |  |  |
| TK_ADA | `tK_ADA` | Text | 1 | Mã phân loại hàng hóa |  |  |  |  |
| TK_ADB | `tK_ADB` | Text | 1 | Mã phương thức vận chuyển |  |  |  |  |
| TK_K06 | `tK_K06` | Text | 5 | Mã khai báo |  |  |  |  |
| TK_K07 | `tK_K07` | Text | 6 | Mã chi cục |  |  |  |  |
| TK_K08 | `tK_K08` | Text | 2 | Mã đội thủ tục |  |  |  |  |
| TK_K09 | `tK_K09` | Text | 35 | Số vận đơn (Số B/L, số AWB v.v. …) |  |  |  |  |
| TK_K10 | `tK_K10` | Text | 20 | Số Masterbill |  |  |  |  |
| TK_K11 | `tK_K11` | Text | 7 | Mã địa điểm lưu kho |  |  |  |  |
| TK_K12 | `tK_K12` | Text | 20 | Tên địa điểm lưu kho |  |  |  |  |
| TK_K13 | `tK_K13` | Integer | 8 | Số kiện |  |  |  |  |
| TK_K14 | `tK_K14` | Text | 3 | Đơn vị tính số kiện |  |  |  |  |
| TK_K15 | `tK_K15` | Decimal | 10 | Tổng trọng lượng hàng (Gross) |  |  |  |  |
| TK_K16 | `tK_K16` | Text | 3 | Mã đơn vị tính trọng lượng (Gross) |  |  |  |  |
| TK_K20 | `tK_K20` | Text | 9 | Mã tàu dự kiến chất hàng |  |  |  |  |
| TK_K21 | `tK_K21` | Text | 35 | Tên tàu dự kiến chất hàng |  |  |  |  |
| TK_K25 | `tK_K25` | Text | 13 | Mã số thuế xuất khẩu |  |  |  |  |
| TK_K26 | `tK_K26` | Text | 100 | Tên doanh nghiệp xuất khẩu |  |  |  |  |
| TK_K29 | `tK_K29` | Text | 140 | Số ký hiệu |  |  |  |  |
| TK_K30 | `tK_K30` | Integer | 3 | Tổng số container |  |  |  |  |
| TK_A1 | `tK_A1` | Text | 12 | Số container |  |  |  |  |
| TK_A2 | `tK_A2` | Text | 12 | Số container |  |  |  |  |
| TK_A3 | `tK_A3` | Text | 12 | Số container |  |  |  |  |
| TK_A4 | `tK_A4` | Text | 12 | Số container |  |  |  |  |
| TK_A5 | `tK_A5` | Text | 12 | Số container |  |  |  |  |
| TK_K31 | `tK_K31` | Text | 1 | Cờ báo có hơn 5 container bị kiểm hóa |  |  |  |  |
| TK_K37 | `tK_K37` | Text | 5 | Mã địa điểm đích |  |  |  |  |
| TK_K38 | `tK_K38` | Text | 20 | Số quản lý nội bộ của doanh nghiệp |  |  |  |  |
| TK_K39 | `tK_K39` | Text | 1 | Mã phân loại kiểm tra |  |  |  |  |
| TK_K40 | `tK_K40` | Text | 14 | Tên phân loại kiểm tra |  |  |  |  |
| TK_K41 | `tK_K41` | Text | 3 | Phân loại kiểm tra ban đầu |  |  |  |  |
| TK_K42 | `tK_K42` | Text | 1 | Phân loại kiểm tra thực tế |  |  |  |  |
| TK_K43 | `tK_K43` | Text | 38 | Nội dung kiểm tra thực tế |  |  |  |  |
| TK_K44 | `tK_K44` | Text | 1 | Phân loại phụ trách |  |  |  |  |
| TK_K45 | `tK_K45` | Text | 8 | Người chuyển luồng kiểm hóa |  |  |  |  |
| TK_K46 | `tK_K46` | Text | 7 | Mã địa điểm thực hiện kiểm hóa |  |  |  |  |
| TK_K47 | `tK_K47` | Text | 20 | Tên địa điểm thực hiện kiểm hóa |  |  |  |  |
| TK_K50 | `tK_K50` | Text | 280 | Nội dung chỉ định kiểm hóa |  |  |  |  |
| TK_K51 | `tK_K51` | Text | 1 | Mã phương pháp chỉ định kiểm hóa |  |  |  |  |
| TK_K52 | `tK_K52` | Text | 32 | Tên phương pháp chỉ định kiểm hóa |  |  |  |  |
| TK_K53 | `tK_K53` | Text | 1 | Cờ báo kiểm hóa toàn bộ |  |  |  |  |
</details>

<details><summary>vaE4780 – Hủy kiểm tra thực tế hàng (xuất) (43 trường)</summary>

| Chỉ tiêu | Key JSON | Kiểu | Độ dài | Mô tả | Bắt buộc | Req | Res | Ghi chú |
|---|---|---|---|---|---|---|---|---|
| TK_K01 | `tK_K01` | Text | 38 | Phân loại kiểm tra thực tế |  |  |  |  |
| TK_K02 | `tK_K02` | Decimal | 12 | Số tờ khai |  |  |  |  |
| TK_K04 | `tK_K04` | Text | 3 | Mã loại hình |  |  |  |  |
| TK_ADA | `tK_ADA` | Text | 1 | Mã phân loại hàng hóa |  |  |  |  |
| TK_ADB | `tK_ADB` | Text | 1 | Mã phương thức vận chuyển |  |  |  |  |
| TK_K06 | `tK_K06` | Text | 5 | Mã khai báo |  |  |  |  |
| TK_K07 | `tK_K07` | Text | 6 | Mã chi cục |  |  |  |  |
| TK_K08 | `tK_K08` | Text | 2 | Mã đội thủ tục |  |  |  |  |
| TK_K09 | `tK_K09` | Text | 35 | Số vận đơn (Số B/L, số AWB v.v. …) |  |  |  |  |
| TK_K10 | `tK_K10` | Text | 20 | Số Masterbill |  |  |  |  |
| TK_K11 | `tK_K11` | Text | 7 | Mã địa điểm lưu kho |  |  |  |  |
| TK_K12 | `tK_K12` | Text | 20 | Tên địa điểm lưu kho |  |  |  |  |
| TK_K13 | `tK_K13` | Integer | 8 | Số kiện |  |  |  |  |
| TK_K14 | `tK_K14` | Text | 3 | Đơn vị tính số kiện |  |  |  |  |
| TK_K15 | `tK_K15` | Decimal | 10 | Tổng trọng lượng hàng (Gross) |  |  |  |  |
| TK_K16 | `tK_K16` | Text | 3 | Mã đơn vị tính trọng lượng (Gross) |  |  |  |  |
| TK_K20 | `tK_K20` | Text | 9 | Mã tàu dự kiến chất hàng |  |  |  |  |
| TK_K21 | `tK_K21` | Text | 35 | Tên tàu dự kiến chất hàng |  |  |  |  |
| TK_K25 | `tK_K25` | Text | 13 | Mã số thuế xuất khẩu |  |  |  |  |
| TK_K26 | `tK_K26` | Text | 100 | Tên doanh nghiệp xuất khẩu |  |  |  |  |
| TK_K29 | `tK_K29` | Text | 140 | Số ký hiệu |  |  |  |  |
| TK_K30 | `tK_K30` | Integer | 3 | Tổng số container |  |  |  |  |
| TK_A1 | `tK_A1` | Text | 12 | Số container |  |  |  |  |
| TK_A2 | `tK_A2` | Text | 12 | Số container |  |  |  |  |
| TK_A3 | `tK_A3` | Text | 12 | Số container |  |  |  |  |
| TK_A4 | `tK_A4` | Text | 12 | Số container |  |  |  |  |
| TK_A5 | `tK_A5` | Text | 12 | Số container |  |  |  |  |
| TK_K31 | `tK_K31` | Text | 1 | Cờ báo có hơn 5 container bị kiểm hóa |  |  |  |  |
| TK_K37 | `tK_K37` | Text | 5 | Mã địa điểm đích |  |  |  |  |
| TK_K38 | `tK_K38` | Text | 20 | Số quản lý nội bộ của doanh nghiệp |  |  |  |  |
| TK_K39 | `tK_K39` | Text | 1 | Mã phân loại kiểm tra |  |  |  |  |
| TK_K40 | `tK_K40` | Text | 14 | Tên phân loại kiểm tra |  |  |  |  |
| TK_K41 | `tK_K41` | Text | 3 | Phân loại kiểm tra ban đầu |  |  |  |  |
| TK_K42 | `tK_K42` | Text | 1 | Phân loại kiểm tra thực tế |  |  |  |  |
| TK_K43 | `tK_K43` | Text | 38 | Nội dung kiểm tra thực tế |  |  |  |  |
| TK_K44 | `tK_K44` | Text | 1 | Phân loại phụ trách |  |  |  |  |
| TK_K45 | `tK_K45` | Text | 8 | Người chuyển luồng kiểm hóa |  |  |  |  |
| TK_K46 | `tK_K46` | Text | 7 | Mã địa điểm thực hiện kiểm hóa |  |  |  |  |
| TK_K47 | `tK_K47` | Text | 20 | Tên địa điểm thực hiện kiểm hóa |  |  |  |  |
| TK_K50 | `tK_K50` | Text | 280 | Nội dung chỉ định kiểm hóa |  |  |  |  |
| TK_K51 | `tK_K51` | Text | 1 | Mã phương pháp chỉ định kiểm hóa |  |  |  |  |
| TK_K52 | `tK_K52` | Text | 32 | Tên phương pháp chỉ định kiểm hóa |  |  |  |  |
| TK_K53 | `tK_K53` | Text | 1 | Cờ báo kiểm hóa toàn bộ |  |  |  |  |
</details>

<details><summary>VAL8000-8020 – Tờ khai bổ sung (chưa/đã đăng ký) (182 trường)</summary>

| Chỉ tiêu | Key JSON | Kiểu | Độ dài | Mô tả | Bắt buộc | Req | Res | Ghi chú |
|---|---|---|---|---|---|---|---|---|
| TK_ADD | `tK_ADD` | I | 12 | Notification No |  |  |  |  |
| TK_AD2 | `tK_AD2` | A | 8 | Date of completion of inspection |  |  |  |  |
| TK_AD3 | `tK_AD3` | A | 6 | Time of completion of isspection |  |  |  |  |
| TK_SYN | `tK_SYN` | I | 12 | Amendment declaration number |  |  |  |  |
| TK_A02 | `tK_A02` | A | 8 | Amendment declaration Registered date |  |  |  |  |
| TK_AD1 | `tK_AD1` | A | 6 | Amendment declaration Registered time |  |  |  |  |
| TK_CHS | `tK_CHS` | A | 10 | Customs office |  |  |  |  |
| TK_CHB | `tK_CHB` | A | 2 | Customs Sub-section |  |  |  |  |
| TK_YNK | `tK_YNK` | A | 1 | Import/Export classification |  |  |  |  |
| TK_ICN | `tK_ICN` | I | 12 | Import/Export declaration number |  |  |  |  |
| TK_ICB | `tK_ICB` | A | 3 | Declaration Kind Code |  |  |  |  |
| TK_IDD | `tK_IDD` | A | 8 | Import/Export declaration date |  |  |  |  |
| TK_ADE | `tK_ADE` | A | 1 | Sign of 60 days over |  |  |  |  |
| TK_CTO | `tK_CTO` | A | 1 | Code of time limit over |  |  |  |  |
| TK_IPD | `tK_IPD` | A | 8 | Import/Export permit date |  |  |  |  |
| TK_RED | `tK_RED` | A | 8 | Time limit of re-import/re-export |  |  |  |  |
| TK_IMC | `tK_IMC` | A | 13 | Declarant code |  |  |  |  |
| TK_IMN | `tK_IMN` | W | 300 | Declarant name |  |  |  |  |
| TK_IMY | `tK_IMY` | A | 7 | Declarant post code |  |  |  |  |
| TK_IMA | `tK_IMA` | W | 300 | Address of Declarant |  |  |  |  |
| TK_IMT | `tK_IMT` | A | 20 | Declarant telephone number |  |  |  |  |
| TK_A12 | `tK_A12` | A | 5 | Agent code |  |  |  |  |
| TK_A13 | `tK_A13` | A | 50 | Agent name |  |  |  |  |
| TK_A14 | `tK_A14` | A | 5 | Registered customs specialist |  |  |  |  |
| TK_REC | `tK_REC` | A | 1 | Amendment declaration reason code |  |  |  |  |
| TK_A16 | `tK_A16` | A | 1 | Payment classification |  |  |  |  |
| TK_ENC | `tK_ENC` | A | 1 | Code of extending due date for payment |  |  |  |  |
| TK_ADS | `tK_ADS` | A | 8 | Efficient date (deferable duration start date) |  |  |  |  |
| TK_ADT | `tK_ADT` | I | 3 | Limit to Payment |  |  |  |  |
| TK_ADU | `tK_ADU` | I | 3 | Limit to Payment(for special goods for VAT) |  |  |  |  |
| TK_REF | `tK_REF` | A | 20 | Enterprise internal control number |  |  |  |  |
| TK_CDB | `tK_CDB` | A | 3 | Currency code before tax amendment |  |  |  |  |
| TK_RTB | `tK_RTB` | F | 9 | Currency exchange rate before tax amendment |  |  |  |  |
| TK_NTB | `tK_NTB` | W | 300 | Notes before tax amendment |  |  |  |  |
| TK_CDA | `tK_CDA` | A | 3 | Currency code after tax amendment |  |  |  |  |
| TK_RTA | `tK_RTA` | F | 9 | Currency exchange rate after tax amendment |  |  |  |  |
| TK_NTA | `tK_NTA` | W | 300 | Notes after tax amendment |  |  |  |  |
| TK_ADB | `tK_ADB` | A | 1 | Display of increment/decrement(Total amount of Import/Export tax increment/decrement) |  |  |  |  |
| TK_A23 | `tK_A23` | I | 11 | Total amount of Import/Export tax increment/decrement |  |  |  |  |
| TK_TTC | `tK_TTC` | A | 3 | Currency code of tax amount(Total amount of Import/Export tax increment/decrement) |  |  |  |  |
| TK_KA1 | `tK_KA1` | A | 1 | Code of receipt entry of total amount of tax and other collection increment/decrement |  |  |  |  |
| TK_KB1 | `tK_KB1` | W | 27 | Name of receipt entry of total amount of tax and other collection increment/decrement |  |  |  |  |
| TK_KU1 | `tK_KU1` | A | 1 | Display of increment/decrement(Total amount of tax and other collection increment/decrement) |  |  |  |  |
| TK_KC1 | `tK_KC1` | I | 11 | Total amount of tax and other collection increment/decrement |  |  |  |  |
| TK_KW1 | `tK_KW1` | A | 3 | Currency code of tax amount(Total amount of tax and other collection increment/decrement) |  |  |  |  |
| TK_KA2 | `tK_KA2` | A | 1 | Code of receipt entry of total amount of tax and other collection increment/decrement |  |  |  |  |
| TK_KB2 | `tK_KB2` | W | 27 | Name of receipt entry of total amount of tax and other collection increment/decrement |  |  |  |  |
| TK_KU2 | `tK_KU2` | A | 1 | Display of increment/decrement(Total amount of tax and other collection increment/decrement) |  |  |  |  |
| TK_KC2 | `tK_KC2` | I | 11 | Total amount of tax and other collection increment/decrement |  |  |  |  |
| TK_KW2 | `tK_KW2` | A | 3 | Currency code of tax amount(Total amount of tax and other collection increment/decrement) |  |  |  |  |
| TK_KA3 | `tK_KA3` | A | 1 | Code of receipt entry of total amount of tax and other collection increment/decrement |  |  |  |  |
| TK_KB3 | `tK_KB3` | W | 27 | Name of receipt entry of total amount of tax and other collection increment/decrement |  |  |  |  |
| TK_KU3 | `tK_KU3` | A | 1 | Display of increment/decrement(Total amount of tax and other collection increment/decrement) |  |  |  |  |
| TK_KC3 | `tK_KC3` | I | 11 | Total amount of tax and other collection increment/decrement |  |  |  |  |
| TK_KW3 | `tK_KW3` | A | 3 | Currency code of tax amount(Total amount of tax and other collection increment/decrement) |  |  |  |  |
| TK_KA4 | `tK_KA4` | A | 1 | Code of receipt entry of total amount of tax and other collection increment/decrement |  |  |  |  |
| TK_KB4 | `tK_KB4` | W | 27 | Name of receipt entry of total amount of tax and other collection increment/decrement |  |  |  |  |
| TK_KU4 | `tK_KU4` | A | 1 | Display of increment/decrement(Total amount of tax and other collection increment/decrement) |  |  |  |  |
| TK_KC4 | `tK_KC4` | I | 11 | Total amount of tax and other collection increment/decrement |  |  |  |  |
| TK_KW4 | `tK_KW4` | A | 3 | Currency code of tax amount(Total amount of tax and other collection increment/decrement) |  |  |  |  |
| TK_KA5 | `tK_KA5` | A | 1 | Code of receipt entry of total amount of tax and other collection increment/decrement |  |  |  |  |
| TK_KB5 | `tK_KB5` | W | 27 | Name of receipt entry of total amount of tax and other collection increment/decrement |  |  |  |  |
| TK_KU5 | `tK_KU5` | A | 1 | Display of increment/decrement(Total amount of tax and other collection increment/decrement) |  |  |  |  |
| TK_KC5 | `tK_KC5` | I | 11 | Total amount of tax and other collection increment/decrement |  |  |  |  |
| TK_KW5 | `tK_KW5` | A | 3 | Currency code of tax amount(Total amount of tax and other collection increment/decrement) |  |  |  |  |
| TK_A24 | `tK_A24` | I | 2 | Configuration page number |  |  |  |  |
| TK_A25 | `tK_A25` | I | 2 | Number of lines of declaration |  |  |  |  |
| TK_ADO | `tK_ADO` | W | 600 | Reason |  |  |  |  |
| TK_ADF | `tK_ADF` | W | 108 | The name of the person in charge |  |  |  |  |
| TK_ADP | `tK_ADP` | W | 108 | Name of Head of Customs office |  |  |  |  |
| HAG_A26 | `haG_A26` | A | 2 | Line number |  |  |  |  |
| HAG_RAN | `haG_RAN` | A | 2 | Original Field No. |  |  |  |  |
| HAG_CMB | `haG_CMB` | W | 600 | Item name before tax amendment |  |  |  |  |
| HAG_ORB | `haG_ORB` | A | 2 | Place of origin code before tax amendment |  |  |  |  |
| HAG_CMA | `haG_CMA` | W | 600 | Item name after tax amendment |  |  |  |  |
| HAG_ORA | `haG_ORA` | A | 2 | Place of origin code after tax amendment |  |  |  |  |
| HAG_MKB | `haG_MKB` | F | 17 | Standard tax value before tax amendment |  |  |  |  |
| HAG_MKQ | `haG_MKQ` | F | 12 | Standard quantity before tax amendment |  |  |  |  |
| HAG_MKC | `haG_MKC` | A | 4 | Measure unit code of standard quantity before tax amendment |  |  |  |  |
| HAG_MKT | `haG_MKT` | A | 12 | HS code before tax amendment |  |  |  |  |
| HAG_MKR | `haG_MKR` | A | 30 | Tax rate before tax amendment |  |  |  |  |
| HAG_MKA | `haG_MKA` | F | 16 | Tax amount before tax amendment |  |  |  |  |
| HAG_A45 | `haG_A45` | A | 1 | Display tax exemption before tax amendment |  |  |  |  |
| HAG_AKB | `haG_AKB` | F | 17 | Standard tax value after tax amendment |  |  |  |  |
| HAG_AKQ | `haG_AKQ` | F | 12 | Standard quantity after tax amendment |  |  |  |  |
| HAG_AKC | `haG_AKC` | A | 4 | Measure unit code of standard quantity after tax amendment |  |  |  |  |
| HAG_AKT | `haG_AKT` | A | 12 | HS code after tax amendment |  |  |  |  |
| HAG_AKR | `haG_AKR` | A | 30 | Tax rate after tax amendment |  |  |  |  |
| HAG_AKA | `haG_AKA` | F | 16 | Tax amount after tax amendment |  |  |  |  |
| HAG_A52 | `haG_A52` | A | 1 | Display tax exemption after tax amendment |  |  |  |  |
| HAG_ADC | `haG_ADC` | A | 1 | Display of increment/decrement(Import/Export tax) |  |  |  |  |
| HAG_A53 | `haG_A53` | F | 16 | Amount of duty increment/ decrement |  |  |  |  |
| HAG_KD1 | `haG_KD1` | A | 1 | Code of receipt entry of total amount of other tax and collection increment/decrement |  |  |  |  |
| HAG_KE1 | `haG_KE1` | W | 27 | Name of receipt entry of total amount of other tax and collection increment/decrement |  |  |  |  |
| HAG_MB1 | `haG_MB1` | F | 17 | Standard tax value before other tax and collection amendment |  |  |  |  |
| HAG_MQ1 | `haG_MQ1` | F | 12 | Standard quantity before other tax and collection amendment |  |  |  |  |
| HAG_MC1 | `haG_MC1` | A | 4 | Measure unit code of standard quantity before other tax and collection amendment |  |  |  |  |
| HAG_MK1 | `haG_MK1` | A | 10 | Classification code before tax and other collection amendment |  |  |  |  |
| HAG_MR1 | `haG_MR1` | A | 25 | Tax rate before other tax and collection amendment |  |  |  |  |
| HAG_MA1 | `haG_MA1` | F | 16 | Tax amount before other tax and collection amendment |  |  |  |  |
| HAG_KL1 | `haG_KL1` | A | 1 | Display other tax and collection exemption before tax amendment |  |  |  |  |
| HAG_AB1 | `haG_AB1` | F | 17 | Standard tax value after other tax and collection amendment |  |  |  |  |
| HAG_AQ1 | `haG_AQ1` | F | 12 | Standard quantity after other tax and collection amendment |  |  |  |  |
| HAG_AC1 | `haG_AC1` | A | 4 | Measure unit code of standard quantity after other tax and collection amendment |  |  |  |  |
| HAG_AK1 | `haG_AK1` | A | 10 | Classification code after other tax and collection amendment |  |  |  |  |
| HAG_AR1 | `haG_AR1` | A | 25 | Tax rate after other tax and collection amendment |  |  |  |  |
| HAG_AA1 | `haG_AA1` | F | 16 | Tax amount after other tax and collection amendment |  |  |  |  |
| HAG_KS1 | `haG_KS1` | A | 1 | Display other tax and collection exemption after tax amendment |  |  |  |  |
| HAG_KV1 | `haG_KV1` | A | 1 | Display of increment/decrement(other tax and collection) |  |  |  |  |
| HAG_KT1 | `haG_KT1` | F | 16 | Amount of other tax and collection increment/decrement |  |  |  |  |
| HAG_KD2 | `haG_KD2` | A | 1 | Code of receipt entry of total amount of other tax and collection increment/decrement |  |  |  |  |
| HAG_KE2 | `haG_KE2` | W | 27 | Name of receipt entry of total amount of other tax and collection increment/decrement |  |  |  |  |
| HAG_MB2 | `haG_MB2` | F | 17 | Standard tax value before other tax and collection amendment |  |  |  |  |
| HAG_MQ2 | `haG_MQ2` | F | 12 | Standard quantity before other tax and collection amendment |  |  |  |  |
| HAG_MC2 | `haG_MC2` | A | 4 | Measure unit code of standard quantity before other tax and collection amendment |  |  |  |  |
| HAG_MK2 | `haG_MK2` | A | 10 | Classification code before tax and other collection amendment |  |  |  |  |
| HAG_MR2 | `haG_MR2` | A | 25 | Tax rate before other tax and collection amendment |  |  |  |  |
| HAG_MA2 | `haG_MA2` | F | 16 | Tax amount before other tax and collection amendment |  |  |  |  |
| HAG_KL2 | `haG_KL2` | A | 1 | Display other tax and collection exemption before tax amendment |  |  |  |  |
| HAG_AB2 | `haG_AB2` | F | 17 | Standard tax value after other tax and collection amendment |  |  |  |  |
| HAG_AQ2 | `haG_AQ2` | F | 12 | Standard quantity after other tax and collection amendment |  |  |  |  |
| HAG_AC2 | `haG_AC2` | A | 4 | Measure unit code of standard quantity after other tax and collection amendment |  |  |  |  |
| HAG_AK2 | `haG_AK2` | A | 10 | Classification code after other tax and collection amendment |  |  |  |  |
| HAG_AR2 | `haG_AR2` | A | 25 | Tax rate after other tax and collection amendment |  |  |  |  |
| HAG_AA2 | `haG_AA2` | F | 16 | Tax amount after other tax and collection amendment |  |  |  |  |
| HAG_KS2 | `haG_KS2` | A | 1 | Display other tax and collection exemption after tax amendment |  |  |  |  |
| HAG_KV2 | `haG_KV2` | A | 1 | Display of increment/decrement(other tax and collection) |  |  |  |  |
| HAG_KT2 | `haG_KT2` | F | 16 | Amount of other tax and collection increment/decrement |  |  |  |  |
| HAG_KD3 | `haG_KD3` | A | 1 | Code of receipt entry of total amount of other tax and collection increment/decrement |  |  |  |  |
| HAG_KE3 | `haG_KE3` | W | 27 | Name of receipt entry of total amount of other tax and collection increment/decrement |  |  |  |  |
| HAG_MB3 | `haG_MB3` | F | 17 | Standard tax value before other tax and collection amendment |  |  |  |  |
| HAG_MQ3 | `haG_MQ3` | F | 12 | Standard quantity before other tax and collection amendment |  |  |  |  |
| HAG_MC3 | `haG_MC3` | A | 4 | Measure unit code of standard quantity before other tax and collection amendment |  |  |  |  |
| HAG_MK3 | `haG_MK3` | A | 10 | Classification code before tax and other collection amendment |  |  |  |  |
| HAG_MR3 | `haG_MR3` | A | 25 | Tax rate before other tax and collection amendment |  |  |  |  |
| HAG_MA3 | `haG_MA3` | F | 16 | Tax amount before other tax and collection amendment |  |  |  |  |
| HAG_KL3 | `haG_KL3` | A | 1 | Display other tax and collection exemption before tax amendment |  |  |  |  |
| HAG_AB3 | `haG_AB3` | F | 17 | Standard tax value after other tax and collection amendment |  |  |  |  |
| HAG_AQ3 | `haG_AQ3` | F | 12 | Standard quantity after other tax and collection amendment |  |  |  |  |
| HAG_AC3 | `haG_AC3` | A | 4 | Measure unit code of standard quantity after other tax and collection amendment |  |  |  |  |
| HAG_AK3 | `haG_AK3` | A | 10 | Classification code after other tax and collection amendment |  |  |  |  |
| HAG_AR3 | `haG_AR3` | A | 25 | Tax rate after other tax and collection amendment |  |  |  |  |
| HAG_AA3 | `haG_AA3` | F | 16 | Tax amount after other tax and collection amendment |  |  |  |  |
| HAG_KS3 | `haG_KS3` | A | 1 | Display other tax and collection exemption after tax amendment |  |  |  |  |
| HAG_KV3 | `haG_KV3` | A | 1 | Display of increment/decrement(other tax and collection) |  |  |  |  |
| HAG_KT3 | `haG_KT3` | F | 16 | Amount of other tax and collection increment/decrement |  |  |  |  |
| HAG_KD4 | `haG_KD4` | A | 1 | Code of receipt entry of total amount of other tax and collection increment/decrement |  |  |  |  |
| HAG_KE4 | `haG_KE4` | W | 27 | Name of receipt entry of total amount of other tax and collection increment/decrement |  |  |  |  |
| HAG_MB4 | `haG_MB4` | F | 17 | Standard tax value before other tax and collection amendment |  |  |  |  |
| HAG_MQ4 | `haG_MQ4` | F | 12 | Standard quantity before other tax and collection amendment |  |  |  |  |
| HAG_MC4 | `haG_MC4` | A | 4 | Measure unit code of standard quantity before other tax and collection amendment |  |  |  |  |
| HAG_MK4 | `haG_MK4` | A | 10 | Classification code before tax and other collection amendment |  |  |  |  |
| HAG_KJ4 | `haG_KJ4` | A | 25 | Tax rate before other tax and collection amendment |  |  |  |  |
| HAG_MA4 | `haG_MA4` | F | 16 | Tax amount before other tax and collection amendment |  |  |  |  |
| HAG_KL4 | `haG_KL4` | A | 1 | Display other tax and collection exemption before tax amendment |  |  |  |  |
| HAG_AB4 | `haG_AB4` | F | 17 | Standard tax value after other tax and collection amendment |  |  |  |  |
| HAG_AQ4 | `haG_AQ4` | F | 12 | Standard quantity after other tax and collection amendment |  |  |  |  |
| HAG_AC4 | `haG_AC4` | A | 4 | Measure unit code of standard quantity after other tax and collection amendment |  |  |  |  |
| HAG_AK4 | `haG_AK4` | A | 10 | Classification code after other tax and collection amendment |  |  |  |  |
| HAG_AR4 | `haG_AR4` | A | 25 | Tax rate after other tax and collection amendment |  |  |  |  |
| HAG_AA4 | `haG_AA4` | F | 16 | Tax amount after other tax and collection amendment |  |  |  |  |
| HAG_KS4 | `haG_KS4` | A | 1 | Display other tax and collection exemption after tax amendment |  |  |  |  |
| HAG_KV4 | `haG_KV4` | A | 1 | Display of increment/decrement(other tax and collection) |  |  |  |  |
| HAG_KT4 | `haG_KT4` | F | 16 | Amount of other tax and collection increment/decrement |  |  |  |  |
| HAG_KD5 | `haG_KD5` | A | 1 | Code of receipt entry of total amount of other tax and collection increment/decrement |  |  |  |  |
| HAG_KE5 | `haG_KE5` | W | 27 | Name of receipt entry of total amount of other tax and collection increment/decrement |  |  |  |  |
| HAG_MB5 | `haG_MB5` | F | 17 | Standard tax value before other tax and collection amendment |  |  |  |  |
| HAG_MQ5 | `haG_MQ5` | F | 12 | Standard quantity before other tax and collection amendment |  |  |  |  |
| HAG_MC5 | `haG_MC5` | A | 4 | Measure unit code of standard quantity before other tax and collection amendment |  |  |  |  |
| HAG_MK5 | `haG_MK5` | A | 10 | Classification code before tax and other collection amendment |  |  |  |  |
| HAG_MR5 | `haG_MR5` | A | 25 | Tax rate before other tax and collection amendment |  |  |  |  |
| HAG_MA5 | `haG_MA5` | F | 16 | Tax amount before other tax and collection amendment |  |  |  |  |
| HAG_KL5 | `haG_KL5` | A | 1 | Display other tax and collection exemption before tax amendment |  |  |  |  |
| HAG_AB5 | `haG_AB5` | F | 17 | Standard tax value after other tax and collection amendment |  |  |  |  |
| HAG_AQ5 | `haG_AQ5` | F | 12 | Standard quantity after other tax and collection amendment |  |  |  |  |
| HAG_AC5 | `haG_AC5` | A | 4 | Measure unit code of standard quantity after other tax and collection amendment |  |  |  |  |
| HAG_AK5 | `haG_AK5` | A | 10 | Classification code after other tax and collection amendment |  |  |  |  |
| HAG_AR5 | `haG_AR5` | A | 25 | Tax rate after other tax and collection amendment |  |  |  |  |
| HAG_AA5 | `haG_AA5` | F | 16 | Tax amount after other tax and collection amendment |  |  |  |  |
| HAG_KS5 | `haG_KS5` | A | 1 | Display other tax and collection exemption after tax amendment |  |  |  |  |
| HAG_KV5 | `haG_KV5` | A | 1 | Display of increment/decrement(other tax and collection) |  |  |  |  |
| HAG_KT5 | `haG_KT5` | F | 16 | Amount of other tax and collection increment/decrement |  |  |  |  |
</details>

<details><summary>VAL8030-8060 – Tờ khai bổ sung (kết quả Hải quan) (182 trường)</summary>

| Chỉ tiêu | Key JSON | Kiểu | Độ dài | Mô tả | Bắt buộc | Req | Res | Ghi chú |
|---|---|---|---|---|---|---|---|---|
| TK_ADD | `tK_ADD` | I | 12 | Notification No |  |  |  |  |
| TK_AD2 | `tK_AD2` | A | 8 | Date of completion of inspection |  |  |  | * |
| TK_AD3 | `tK_AD3` | A | 6 | Time of completion of isspection |  |  |  |  |
| TK_SYN | `tK_SYN` | I | 12 | Amendment declaration number |  |  |  |  |
| TK_A02 | `tK_A02` | A | 8 | Amendment declaration Registered date |  |  |  | * |
| TK_AD1 | `tK_AD1` | A | 6 | Amendment declaration Registered time |  |  |  |  |
| TK_CHS | `tK_CHS` | A | 10 | Customs office |  |  |  |  |
| TK_CHB | `tK_CHB` | A | 2 | Customs Sub-section |  |  |  |  |
| TK_YNK | `tK_YNK` | A | 1 | Import/Export classification |  |  |  |  |
| TK_ICN | `tK_ICN` | I | 12 | Import/Export declaration number |  |  |  |  |
| TK_ICB | `tK_ICB` | A | 3 | Declaration Kind Code |  |  |  |  |
| TK_IDD | `tK_IDD` | A | 8 | Import/Export declaration date |  |  |  | * |
| TK_ADE | `tK_ADE` | A | 1 | Sign of 60 days over |  |  |  |  |
| TK_CTO | `tK_CTO` | A | 1 | Code of time limit over |  |  |  |  |
| TK_IPD | `tK_IPD` | A | 8 | Import/Export permit date |  |  |  | * |
| TK_RED | `tK_RED` | A | 8 | Time limit of re-import/re-export |  |  |  | * |
| TK_IMC | `tK_IMC` | A | 13 | Declarant code |  |  |  |  |
| TK_IMN | `tK_IMN` | W | 300 | Declarant name |  |  |  |  |
| TK_IMY | `tK_IMY` | A | 7 | Declarant post code |  |  |  |  |
| TK_IMA | `tK_IMA` | W | 300 | Address of Declarant |  |  |  |  |
| TK_IMT | `tK_IMT` | A | 20 | Declarant telephone number |  |  |  |  |
| TK_A12 | `tK_A12` | A | 5 | Agent code |  |  |  |  |
| TK_A13 | `tK_A13` | A | 50 | Agent name |  |  |  |  |
| TK_A14 | `tK_A14` | A | 5 | Registered customs specialist |  |  |  |  |
| TK_REC | `tK_REC` | A | 1 | Amendment declaration reason code |  |  |  |  |
| TK_A16 | `tK_A16` | A | 1 | Payment classification |  |  |  |  |
| TK_ENC | `tK_ENC` | A | 1 | Code of extending due date for payment |  |  |  |  |
| TK_ADS | `tK_ADS` | A | 8 | Efficient date (deferable duration start date) |  |  |  | * |
| TK_ADT | `tK_ADT` | I | 3 | Limit to Payment |  |  |  |  |
| TK_ADU | `tK_ADU` | I | 3 | Limit to Payment(for special goods for VAT) |  |  |  |  |
| TK_REF | `tK_REF` | A | 20 | Enterprise internal control number |  |  |  |  |
| TK_CDB | `tK_CDB` | A | 3 | Currency code before tax amendment |  |  |  |  |
| TK_RTB | `tK_RTB` | F | 9 | Currency exchange rate before tax amendment |  |  |  |  |
| TK_NTB | `tK_NTB` | W | 300 | Notes before tax amendment |  |  |  |  |
| TK_CDA | `tK_CDA` | A | 3 | Currency code after tax amendment |  |  |  |  |
| TK_RTA | `tK_RTA` | F | 9 | Currency exchange rate after tax amendment |  |  |  |  |
| TK_NTA | `tK_NTA` | W | 300 | Notes after tax amendment |  |  |  |  |
| TK_ADB | `tK_ADB` | A | 1 | Display of increment/decrement(Total amount of Import/Export tax increment/decrement) |  |  |  |  |
| TK_A23 | `tK_A23` | I | 11 | Total amount of Import/Export tax increment/decrement |  |  |  |  |
| TK_TTC | `tK_TTC` | A | 3 | Currency code of tax amount(Total amount of Import/Export tax increment/decrement) |  |  |  |  |
| TK_KA1 | `tK_KA1` | A | 1 | Code of receipt entry of total amount of tax and other collection increment/decrement |  |  |  |  |
| TK_KB1 | `tK_KB1` | W | 27 | Name of receipt entry of total amount of tax and other collection increment/decrement |  |  |  |  |
| TK_KU1 | `tK_KU1` | A | 1 | Display of increment/decrement(Total amount of tax and other collection increment/decrement) |  |  |  |  |
| TK_KC1 | `tK_KC1` | I | 11 | Total amount of tax and other collection increment/decrement |  |  |  |  |
| TK_KW1 | `tK_KW1` | A | 3 | Currency code of tax amount(Total amount of tax and other collection increment/decrement) |  |  |  |  |
| TK_KA2 | `tK_KA2` | A | 1 | Code of receipt entry of total amount of tax and other collection increment/decrement |  |  |  |  |
| TK_KB2 | `tK_KB2` | W | 27 | Name of receipt entry of total amount of tax and other collection increment/decrement |  |  |  |  |
| TK_KU2 | `tK_KU2` | A | 1 | Display of increment/decrement(Total amount of tax and other collection increment/decrement) |  |  |  |  |
| TK_KC2 | `tK_KC2` | I | 11 | Total amount of tax and other collection increment/decrement |  |  |  |  |
| TK_KW2 | `tK_KW2` | A | 3 | Currency code of tax amount(Total amount of tax and other collection increment/decrement) |  |  |  |  |
| TK_KA3 | `tK_KA3` | A | 1 | Code of receipt entry of total amount of tax and other collection increment/decrement |  |  |  |  |
| TK_KB3 | `tK_KB3` | W | 27 | Name of receipt entry of total amount of tax and other collection increment/decrement |  |  |  |  |
| TK_KU3 | `tK_KU3` | A | 1 | Display of increment/decrement(Total amount of tax and other collection increment/decrement) |  |  |  |  |
| TK_KC3 | `tK_KC3` | I | 11 | Total amount of tax and other collection increment/decrement |  |  |  |  |
| TK_KW3 | `tK_KW3` | A | 3 | Currency code of tax amount(Total amount of tax and other collection increment/decrement) |  |  |  |  |
| TK_KA4 | `tK_KA4` | A | 1 | Code of receipt entry of total amount of tax and other collection increment/decrement |  |  |  |  |
| TK_KB4 | `tK_KB4` | W | 27 | Name of receipt entry of total amount of tax and other collection increment/decrement |  |  |  |  |
| TK_KU4 | `tK_KU4` | A | 1 | Display of increment/decrement(Total amount of tax and other collection increment/decrement) |  |  |  |  |
| TK_KC4 | `tK_KC4` | I | 11 | Total amount of tax and other collection increment/decrement |  |  |  |  |
| TK_KW4 | `tK_KW4` | A | 3 | Currency code of tax amount(Total amount of tax and other collection increment/decrement) |  |  |  |  |
| TK_KA5 | `tK_KA5` | A | 1 | Code of receipt entry of total amount of tax and other collection increment/decrement |  |  |  |  |
| TK_KB5 | `tK_KB5` | W | 27 | Name of receipt entry of total amount of tax and other collection increment/decrement |  |  |  |  |
| TK_KU5 | `tK_KU5` | A | 1 | Display of increment/decrement(Total amount of tax and other collection increment/decrement) |  |  |  |  |
| TK_KC5 | `tK_KC5` | I | 11 | Total amount of tax and other collection increment/decrement |  |  |  |  |
| TK_KW5 | `tK_KW5` | A | 3 | Currency code of tax amount(Total amount of tax and other collection increment/decrement) |  |  |  |  |
| TK_A24 | `tK_A24` | I | 2 | Configuration page number |  |  |  |  |
| TK_A25 | `tK_A25` | I | 2 | Number of lines of declaration |  |  |  |  |
| TK_ADO | `tK_ADO` | W | 600 | Reason |  |  |  |  |
| TK_ADF | `tK_ADF` | W | 108 | The name of the person in charge |  |  |  |  |
| TK_ADP | `tK_ADP` | W | 108 | Name of Head of Customs office |  |  |  |  |
| HAG_A26 | `haG_A26` | A | 2 | Line number |  |  |  |  |
| HAG_RAN | `haG_RAN` | A | 2 | Original Field No. |  |  |  |  |
| HAG_CMB | `haG_CMB` | W | 600 | Item name before tax amendment |  |  |  |  |
| HAG_ORB | `haG_ORB` | A | 2 | Place of origin code before tax amendment |  |  |  |  |
| HAG_CMA | `haG_CMA` | W | 600 | Item name after tax amendment |  |  |  |  |
| HAG_ORA | `haG_ORA` | A | 2 | Place of origin code after tax amendment |  |  |  |  |
| HAG_MKB | `haG_MKB` | F | 17 | Standard tax value before tax amendment |  |  |  |  |
| HAG_MKQ | `haG_MKQ` | F | 12 | Standard quantity before tax amendment |  |  |  |  |
| HAG_MKC | `haG_MKC` | A | 4 | Measure unit code of standard quantity before tax amendment |  |  |  |  |
| HAG_MKT | `haG_MKT` | A | 12 | HS code before tax amendment |  |  |  |  |
| HAG_MKR | `haG_MKR` | A | 30 | Tax rate before tax amendment |  |  |  |  |
| HAG_MKA | `haG_MKA` | F | 16 | Tax amount before tax amendment |  |  |  |  |
| HAG_A45 | `haG_A45` | A | 1 | Display tax exemption before tax amendment |  |  |  |  |
| HAG_AKB | `haG_AKB` | F | 17 | Standard tax value after tax amendment |  |  |  |  |
| HAG_AKQ | `haG_AKQ` | F | 12 | Standard quantity after tax amendment |  |  |  |  |
| HAG_AKC | `haG_AKC` | A | 4 | Measure unit code of standard quantity after tax amendment |  |  |  |  |
| HAG_AKT | `haG_AKT` | A | 12 | HS code after tax amendment |  |  |  |  |
| HAG_AKR | `haG_AKR` | A | 30 | Tax rate after tax amendment |  |  |  |  |
| HAG_AKA | `haG_AKA` | F | 16 | Tax amount after tax amendment |  |  |  |  |
| HAG_A52 | `haG_A52` | A | 1 | Display tax exemption after tax amendment |  |  |  |  |
| HAG_ADC | `haG_ADC` | A | 1 | Display of increment/decrement(Import/Export tax) |  |  |  |  |
| HAG_A53 | `haG_A53` | F | 16 | Amount of duty increment/ decrement |  |  |  |  |
| HAG_KD1 | `haG_KD1` | A | 1 | Code of receipt entry of total amount of other tax and collection increment/decrement |  |  |  |  |
| HAG_KE1 | `haG_KE1` | W | 27 | Name of receipt entry of total amount of other tax and collection increment/decrement |  |  |  |  |
| HAG_MB1 | `haG_MB1` | F | 17 | Standard tax value before other tax and collection amendment |  |  |  |  |
| HAG_MQ1 | `haG_MQ1` | F | 12 | Standard quantity before other tax and collection amendment |  |  |  |  |
| HAG_MC1 | `haG_MC1` | A | 4 | Measure unit code of standard quantity before other tax and collection amendment |  |  |  |  |
| HAG_MK1 | `haG_MK1` | A | 10 | Classification code before tax and other collection amendment |  |  |  |  |
| HAG_MR1 | `haG_MR1` | A | 25 | Tax rate before other tax and collection amendment |  |  |  |  |
| HAG_MA1 | `haG_MA1` | F | 16 | Tax amount before other tax and collection amendment |  |  |  |  |
| HAG_KL1 | `haG_KL1` | A | 1 | Display other tax and collection exemption before tax amendment |  |  |  |  |
| HAG_AB1 | `haG_AB1` | F | 17 | Standard tax value after other tax and collection amendment |  |  |  |  |
| HAG_AQ1 | `haG_AQ1` | F | 12 | Standard quantity after other tax and collection amendment |  |  |  |  |
| HAG_AC1 | `haG_AC1` | A | 4 | Measure unit code of standard quantity after other tax and collection amendment |  |  |  |  |
| HAG_AK1 | `haG_AK1` | A | 10 | Classification code after other tax and collection amendment |  |  |  |  |
| HAG_AR1 | `haG_AR1` | A | 25 | Tax rate after other tax and collection amendment |  |  |  |  |
| HAG_AA1 | `haG_AA1` | F | 16 | Tax amount after other tax and collection amendment |  |  |  |  |
| HAG_KS1 | `haG_KS1` | A | 1 | Display other tax and collection exemption after tax amendment |  |  |  |  |
| HAG_KV1 | `haG_KV1` | A | 1 | Display of increment/decrement(other tax and collection) |  |  |  |  |
| HAG_KT1 | `haG_KT1` | F | 16 | Amount of other tax and collection increment/decrement |  |  |  |  |
| HAG_KD2 | `haG_KD2` | A | 1 | Code of receipt entry of total amount of other tax and collection increment/decrement |  |  |  |  |
| HAG_KE2 | `haG_KE2` | W | 27 | Name of receipt entry of total amount of other tax and collection increment/decrement |  |  |  |  |
| HAG_MB2 | `haG_MB2` | F | 17 | Standard tax value before other tax and collection amendment |  |  |  |  |
| HAG_MQ2 | `haG_MQ2` | F | 12 | Standard quantity before other tax and collection amendment |  |  |  |  |
| HAG_MC2 | `haG_MC2` | A | 4 | Measure unit code of standard quantity before other tax and collection amendment |  |  |  |  |
| HAG_MK2 | `haG_MK2` | A | 10 | Classification code before tax and other collection amendment |  |  |  |  |
| HAG_MR2 | `haG_MR2` | A | 25 | Tax rate before other tax and collection amendment |  |  |  |  |
| HAG_MA2 | `haG_MA2` | F | 16 | Tax amount before other tax and collection amendment |  |  |  |  |
| HAG_KL2 | `haG_KL2` | A | 1 | Display other tax and collection exemption before tax amendment |  |  |  |  |
| HAG_AB2 | `haG_AB2` | F | 17 | Standard tax value after other tax and collection amendment |  |  |  |  |
| HAG_AQ2 | `haG_AQ2` | F | 12 | Standard quantity after other tax and collection amendment |  |  |  |  |
| HAG_AC2 | `haG_AC2` | A | 4 | Measure unit code of standard quantity after other tax and collection amendment |  |  |  |  |
| HAG_AK2 | `haG_AK2` | A | 10 | Classification code after other tax and collection amendment |  |  |  |  |
| HAG_AR2 | `haG_AR2` | A | 25 | Tax rate after other tax and collection amendment |  |  |  |  |
| HAG_AA2 | `haG_AA2` | F | 16 | Tax amount after other tax and collection amendment |  |  |  |  |
| HAG_KS2 | `haG_KS2` | A | 1 | Display other tax and collection exemption after tax amendment |  |  |  |  |
| HAG_KV2 | `haG_KV2` | A | 1 | Display of increment/decrement(other tax and collection) |  |  |  |  |
| HAG_KT2 | `haG_KT2` | F | 16 | Amount of other tax and collection increment/decrement |  |  |  |  |
| HAG_KD3 | `haG_KD3` | A | 1 | Code of receipt entry of total amount of other tax and collection increment/decrement |  |  |  |  |
| HAG_KE3 | `haG_KE3` | W | 27 | Name of receipt entry of total amount of other tax and collection increment/decrement |  |  |  |  |
| HAG_MB3 | `haG_MB3` | F | 17 | Standard tax value before other tax and collection amendment |  |  |  |  |
| HAG_MQ3 | `haG_MQ3` | F | 12 | Standard quantity before other tax and collection amendment |  |  |  |  |
| HAG_MC3 | `haG_MC3` | A | 4 | Measure unit code of standard quantity before other tax and collection amendment |  |  |  |  |
| HAG_MK3 | `haG_MK3` | A | 10 | Classification code before tax and other collection amendment |  |  |  |  |
| HAG_MR3 | `haG_MR3` | A | 25 | Tax rate before other tax and collection amendment |  |  |  |  |
| HAG_MA3 | `haG_MA3` | F | 16 | Tax amount before other tax and collection amendment |  |  |  |  |
| HAG_KL3 | `haG_KL3` | A | 1 | Display other tax and collection exemption before tax amendment |  |  |  |  |
| HAG_AB3 | `haG_AB3` | F | 17 | Standard tax value after other tax and collection amendment |  |  |  |  |
| HAG_AQ3 | `haG_AQ3` | F | 12 | Standard quantity after other tax and collection amendment |  |  |  |  |
| HAG_AC3 | `haG_AC3` | A | 4 | Measure unit code of standard quantity after other tax and collection amendment |  |  |  |  |
| HAG_AK3 | `haG_AK3` | A | 10 | Classification code after other tax and collection amendment |  |  |  |  |
| HAG_AR3 | `haG_AR3` | A | 25 | Tax rate after other tax and collection amendment |  |  |  |  |
| HAG_AA3 | `haG_AA3` | F | 16 | Tax amount after other tax and collection amendment |  |  |  |  |
| HAG_KS3 | `haG_KS3` | A | 1 | Display other tax and collection exemption after tax amendment |  |  |  |  |
| HAG_KV3 | `haG_KV3` | A | 1 | Display of increment/decrement(other tax and collection) |  |  |  |  |
| HAG_KT3 | `haG_KT3` | F | 16 | Amount of other tax and collection increment/decrement |  |  |  |  |
| HAG_KD4 | `haG_KD4` | A | 1 | Code of receipt entry of total amount of other tax and collection increment/decrement |  |  |  |  |
| HAG_KE4 | `haG_KE4` | W | 27 | Name of receipt entry of total amount of other tax and collection increment/decrement |  |  |  |  |
| HAG_MB4 | `haG_MB4` | F | 17 | Standard tax value before other tax and collection amendment |  |  |  |  |
| HAG_MQ4 | `haG_MQ4` | F | 12 | Standard quantity before other tax and collection amendment |  |  |  |  |
| HAG_MC4 | `haG_MC4` | A | 4 | Measure unit code of standard quantity before other tax and collection amendment |  |  |  |  |
| HAG_MK4 | `haG_MK4` | A | 10 | Classification code before tax and other collection amendment |  |  |  |  |
| HAG_KJ4 | `haG_KJ4` | A | 25 | Tax rate before other tax and collection amendment |  |  |  |  |
| HAG_MA4 | `haG_MA4` | F | 16 | Tax amount before other tax and collection amendment |  |  |  |  |
| HAG_KL4 | `haG_KL4` | A | 1 | Display other tax and collection exemption before tax amendment |  |  |  |  |
| HAG_AB4 | `haG_AB4` | F | 17 | Standard tax value after other tax and collection amendment |  |  |  |  |
| HAG_AQ4 | `haG_AQ4` | F | 12 | Standard quantity after other tax and collection amendment |  |  |  |  |
| HAG_AC4 | `haG_AC4` | A | 4 | Measure unit code of standard quantity after other tax and collection amendment |  |  |  |  |
| HAG_AK4 | `haG_AK4` | A | 10 | Classification code after other tax and collection amendment |  |  |  |  |
| HAG_AR4 | `haG_AR4` | A | 25 | Tax rate after other tax and collection amendment |  |  |  |  |
| HAG_AA4 | `haG_AA4` | F | 16 | Tax amount after other tax and collection amendment |  |  |  |  |
| HAG_KS4 | `haG_KS4` | A | 1 | Display other tax and collection exemption after tax amendment |  |  |  |  |
| HAG_KV4 | `haG_KV4` | A | 1 | Display of increment/decrement(other tax and collection) |  |  |  |  |
| HAG_KT4 | `haG_KT4` | F | 16 | Amount of other tax and collection increment/decrement |  |  |  |  |
| HAG_KD5 | `haG_KD5` | A | 1 | Code of receipt entry of total amount of other tax and collection increment/decrement |  |  |  |  |
| HAG_KE5 | `haG_KE5` | W | 27 | Name of receipt entry of total amount of other tax and collection increment/decrement |  |  |  |  |
| HAG_MB5 | `haG_MB5` | F | 17 | Standard tax value before other tax and collection amendment |  |  |  |  |
| HAG_MQ5 | `haG_MQ5` | F | 12 | Standard quantity before other tax and collection amendment |  |  |  |  |
| HAG_MC5 | `haG_MC5` | A | 4 | Measure unit code of standard quantity before other tax and collection amendment |  |  |  |  |
| HAG_MK5 | `haG_MK5` | A | 10 | Classification code before tax and other collection amendment |  |  |  |  |
| HAG_MR5 | `haG_MR5` | A | 25 | Tax rate before other tax and collection amendment |  |  |  |  |
| HAG_MA5 | `haG_MA5` | F | 16 | Tax amount before other tax and collection amendment |  |  |  |  |
| HAG_KL5 | `haG_KL5` | A | 1 | Display other tax and collection exemption before tax amendment |  |  |  |  |
| HAG_AB5 | `haG_AB5` | F | 17 | Standard tax value after other tax and collection amendment |  |  |  |  |
| HAG_AQ5 | `haG_AQ5` | F | 12 | Standard quantity after other tax and collection amendment |  |  |  |  |
| HAG_AC5 | `haG_AC5` | A | 4 | Measure unit code of standard quantity after other tax and collection amendment |  |  |  |  |
| HAG_AK5 | `haG_AK5` | A | 10 | Classification code after other tax and collection amendment |  |  |  |  |
| HAG_AR5 | `haG_AR5` | A | 25 | Tax rate after other tax and collection amendment |  |  |  |  |
| HAG_AA5 | `haG_AA5` | F | 16 | Tax amount after other tax and collection amendment |  |  |  |  |
| HAG_KS5 | `haG_KS5` | A | 1 | Display other tax and collection exemption after tax amendment |  |  |  |  |
| HAG_KV5 | `haG_KV5` | A | 1 | Display of increment/decrement(other tax and collection) |  |  |  |  |
| HAG_KT5 | `haG_KT5` | F | 16 | Amount of other tax and collection increment/decrement |  |  |  |  |
</details>

## 6. Lỗi mẫu (thật)

**A0004 – sai mật khẩu VNACCS (FPT trả trùng 2 lần)**

```json
[
  {
    "errorCode": "A0004",
    "indexCode": "A0004",
    "nameCode": "Password",
    "errorContent": "Mật khẩu không hợp lệ.",
    "proposedSolution": "Nhập mật khẩu chính xác.",
    "rowPosition": "0000"
  },
  {
    "errorCode": "A0004",
    "indexCode": "A0004",
    "nameCode": "Password",
    "errorContent": "Mật khẩu không hợp lệ.",
    "proposedSolution": "Nhập mật khẩu chính xác.",
    "rowPosition": "0000"
  }
]
```

**S1139 – ngày hàng đi trước ngày khai**

```json
[
  {
    "errorCode": "S1139",
    "indexCode": "SYM",
    "nameCode": "Departure Planned Date",
    "errorContent": "Ngày hàng đi dự kiến là ngày trong quá khứ khi so với Ngày khai báo (Dự kiến)\r\n",
    "proposedSolution": "Kiểm tra nội dung đã nhập.\r\n",
    "rowPosition": "0000"
  }
]
```

## 7. Tình trạng tích hợp trong app (chung-tu-hq)

| Hạng mục | Tình trạng | Còn lại |
|---|---|---|
| IEX / IID | Đã sửa (01/11/2026): nhập → IID `{tK_ICN}`, xuất → IEX `{tK_ECN}` (number); chiều lấy từ hồ sơ, thiếu thì suy từ số tờ khai (3… = xuất). | – |
| Gọi lại / sửa đổi | Đã nối: IDB/EDB, IDD/EDD (body số tờ khai), IDA01/EDA01 (như IDA/EDA, đầu tờ khai mang số), IDE/EDE (trả phân luồng), AMB/AMC (body tK_SYN của bản khai bổ sung). | – |
| Phản hồi bất đồng bộ | Đã nối: mỗi lượt hỏi trạng thái (customs-poll) gọi VNACCSREP trước, ghi thông điệp vào nhật ký của đúng tờ khai, cập nhật luồng/thông quan; sau đó vẫn tra IID/IEX. | – |
| HYS | Gửi phẳng + `lisT_FILE` – đúng Excel (Postman bọc `objVN_HYS` + `lisT_FILE_HYS`, có thể cũ). | Đối chiếu khi có phản hồi thật. |
| Container | Chưa làm. | Dùng V5ContainerReq/Res (Excel v1.1). |
| Bổ sung chứng từ V5, định danh, tách vận đơn, KVGS, in, SyncCategory | Chưa gọi (định danh/tách vận đơn mới có panel giao diện). Mock đã có đủ để làm. | Làm theo thứ tự ưu tiên nghiệp vụ. KyFile không bắt buộc. |

## 8. Postman lệch Excel – quyết định

| Hạng mục | Postman | Excel | Quyết định |
|---|---|---|---|
| HYS – danh sách file | `objVN_HYS.lisT_FILE_HYS[]` | `LIST_FILE` → `lisT_FILE` (phẳng, cùng cấp tK_CH…) | Theo Excel: `lisT_FILE`. Mock nhận cả hai. |
| IDA – đội thủ tục | Body mẫu không có `tK_CHB` | `TK_CHB` bắt buộc (Text 2) | Theo Excel: luôn gửi `tK_CHB` (app đang gửi "00" mặc định). |
| AMA – dòng hàng | Có thêm `haG_AMA`, `haG_MMA` | VN_AMA_HANG v1.4 không có hai trường này | Theo Excel: không gửi. |
| Khai danh sách container | Chỉ có `ContainerReq/Res` (seal không bắt buộc, có CTHQ_CCM/CTHQ_D01) | Có cả bản cũ (KHAI BAO DS CONT) và `V5ContainerReq/Res` v1.1 (seal bắt buộc, có errorList) | Theo Excel bản có số phiên bản: `V5ContainerReq/Res` v1.1. |
| EDA – dòng hàng | Không có `haG_XX` | `HAG_XX` đánh dấu bắt buộc, không mô tả | Theo phản hồi thật: EDA thật không có `haG_XX` vẫn thành công → không gửi. |
| Xác thực | HTTP Basic | Không ghi | Bearer token (đã xác nhận với FPT, mock đang dùng). |

## 9. Câu hỏi đã chốt

| Câu hỏi | Chốt |
|---|---|
| Basic hay Bearer? | Bearer token từ /api/auth/login cho mọi API. |
| ContainerReq hay V5ContainerReq? | V5ContainerReq/Res (Excel v1.1). |
| HYS: lisT_FILE hay lisT_FILE_HYS? | lisT_FILE (Excel). |
| Có cần KyFile / chữ ký số trong payload? | Không: Excel IDA/EDA/HYS/V5 không có trường chữ ký → không ký trong payload; KyFile để dành khi FPT yêu cầu. |
| VNACCSREP lấy một lần hay lấy lại được? | Excel không mô tả → app coi là lấy một lần: lưu ngay mọi thông điệp nhận được (idempotent theo mã thông điệp + số tờ khai) và vẫn tra IID/IEX để chắc trạng thái. |
| Tần suất hỏi kết quả (…Res, VNACCSREP)? | Không có trong tài liệu → app tự đặt (lùi dần, như hỏi IEX hiện tại). |

Còn thiếu (không chặn việc làm): mẫu phản hồi thật của các API ngoài Login/EDA – khi có thì thêm vào `apps/fpt-mock/src/fixtures` và cho test so khớp.
