# Thuế và thu khác theo loại thuế (chỉ tiêu 1.94–1.96, tờ khai nhập IDA)

Ngày: 2026-11-16 · Trạng thái: chờ duyệt

## 1. Vì sao

Hải quan (VNACCS) xử lý 5 ô "Thuế và thu khác" của mỗi dòng hàng theo **thứ tự loại thuế, dồn lên đầu**:

| Thứ tự | Nhóm thuế | Mã áp dụng thuế suất (1.94, danh mục `OTHER_TAX`) | Mã miễn/giảm/không chịu (1.95, danh mục `A520`) |
|---|---|---|---|
| 1 | **CBPG** – gồm tự vệ, chống trợ cấp, chống bán phá giá | bắt đầu `B` / `C` / `G` | bắt đầu `B` / `C` / `G` |
| 2 | Chống phân biệt đối xử (PBĐX) | `P` | `P` |
| 3 | Tiêu thụ đặc biệt (TTĐB) | `T` | `T` |
| 4 | Bảo vệ môi trường (BVMT) | `M` | `M` |
| 5 | GTGT | `V` | `V` |

- Mỗi mặt hàng có tối đa 6 loại thuế = thuế nhập khẩu (chỉ tiêu riêng) + 5 nhóm trên; mỗi nhóm tối đa **một** mã trên một dòng hàng.
- Nhóm nào không có → bỏ qua, nhóm sau **dồn lên**; ô cuối để trống. Chỉ có GTGT → ô 1 = `V…`.
- Mã miễn/giảm cùng ô phải **cùng chữ cái đầu** với mã thuế suất (vd `V…` ↔ `VK…`/`VG…`).
- Mã 1 chữ (`V`, `T`, `M`, `G`, `B`, `P`) là mã hợp lệ = "chịu thuế, thuế suất 0%".

(Quy tắc do người dùng – chuyên gia nghiệp vụ – xác nhận ngày 2026-11-16.)

**Hiện trạng sai:** `itemDefaults` (`packages/contracts/src/declaration-layout/item-fields.ts:156`) luôn ghi mã GTGT vào `HAG_TX5`; form gắn cứng nghĩa "1 CBPG · 2 PBĐX · 3 TTĐB · 4 BVMT · 5 GTGT" (`declaration-layout/ida.ts:42`); không có sắp xếp/dồn ô ở đâu cả. Dòng chỉ có GTGT gửi `HAG_TX1..4` trống + `HAG_TX5` = mã VAT → sai vị trí so với VNACCS. Người khai cũng không biết ô nào nhập thuế gì, danh sách mã ở mỗi ô gồm cả 288 mã.

## 2. Mục tiêu / không làm / thất bại nếu

**Mục tiêu**
1. Người khai thấy 5 dòng **đặt tên theo loại thuế**, mỗi dòng chỉ chọn được mã đúng loại – không thể đặt nhầm vị trí.
2. Bản gửi FPT, bản in tờ khai luôn theo quy tắc dồn ô của Hải quan.
3. Ô miễn/giảm chỉ hiện mã cùng chữ cái với mã thuế suất của dòng.
4. Dữ liệu đã lưu (vd VAT ở ô 5, mã người khai nhập tay ở ô bất kỳ) vẫn hiển thị và gửi đúng mà không cần người khai sửa lại.

**Không làm (lần này)**
- Tự điền mã CBPG/PBĐX/TTĐB/BVMT từ HSCodePro hay danh mục hàng hóa (hiện chỉ có mã GTGT; mở rộng sau – phương án C).
- Ước tính tiền thuế TTĐB/BVMT/CBPG (`computeTaxes` vẫn chỉ tính NK + GTGT).
- Ánh xạ các ô Hải quan trả về theo ô (`HAG_KQ/KY/KZ/LC{n}`) vào dòng hàng – hiện chưa làm, giữ nguyên.
- Tờ khai xuất EDA (không có 1.94–1.96).

**Thất bại nếu** người khai vẫn phải biết "ô số mấy" để nhập; hoặc bản in nháp khác thứ tự với bản gửi Hải quan; hoặc dữ liệu cũ bị mất / lệch nhóm sau khi nâng cấp.

## 3. Phương án đã cân nhắc

| | Mô tả | Được | Mất |
|---|---|---|---|
| A | Danh sách "Khoản thuế" thêm/xóa, chọn loại trước rồi chọn mã | Linh hoạt, ngắn khi ít thuế | Thêm một bước chọn loại; sửa giao diện + dữ liệu nhiều |
| B | Giữ 5 ô vô danh, ô miễn/giảm lọc theo mã, máy tự dồn khi lưu | Sửa ít | Người khai không biết ô nào thuế gì; danh sách 288 mã; ô tự nhảy chỗ gây khó hiểu |
| **Chọn** | **5 dòng cố định theo loại thuế trên form; chỉ dồn ô khi in và khi truyền** | Rõ ràng, không thể nhầm, chỉ chọn mã; dữ liệu lưu gần như giữ nguyên | Form luôn hiện 5 dòng kể cả khi trống |

Người dùng chọn phương án cuối (2026-11-16) vì B không cho người khai biết ô nào thuế gì.

## 4. Thiết kế

### 4.1 Khái niệm: "dòng theo loại" ≠ "ô gửi Hải quan"

- **Dòng theo loại** `g ∈ 1..5` (1 CBPG, 2 PBĐX, 3 TTĐB, 4 BVMT, 5 GTGT) – thứ người khai nhập và hệ thống lưu.
- **Ô Hải quan** `k ∈ 1..5` – vị trí thực gửi FPT / in trên tờ khai, có được sau khi dồn.

Một hàm thuần duy nhất trong `@kb/contracts` (đề xuất `declaration-layout/other-tax.ts`) là nguồn sự thật:

```ts
export const OTHER_TAX_GROUPS = [
  { group: 1, key: "CBPG", taxPrefixes: ["B", "C", "G"] },
  { group: 2, key: "PBDX", taxPrefixes: ["P"] },
  { group: 3, key: "TTDB", taxPrefixes: ["T"] },
  { group: 4, key: "BVMT", taxPrefixes: ["M"] },
  { group: 5, key: "GTGT", taxPrefixes: ["V"] },
] as const;
otherTaxGroupOf(code): 1..5 | null           // theo chữ cái đầu
normalizeOtherTaxes(values): Values           // xếp dữ liệu cũ vào đúng dòng theo loại (4.2)
compactOtherTaxes(values): { values; slotToGroup: number[] }  // dòng theo loại → ô 1..n (4.4)
otherTaxIssues(values): Issue[]               // kiểm tra (4.6)
```

Mỗi bộ ba (mã thuế `TX`, mã miễn/giảm `TR`, số tiền giảm `TG`) đi cùng nhau khi dồn.

### 4.2 Lưu trữ – giữ khóa cũ, đổi nghĩa thành "dòng theo loại"

- Không thêm cột/bảng, không migration DB. Giá trị vẫn lưu ở `declarations.fields` với mã `HANG.<itemId>.HAG_TX{g}` / `HAG_TR{g}` / `HAG_TG{g}`, nhưng `g` **luôn là số dòng theo loại**, không phải số ô Hải quan. Trùng với nghĩa nhãn form hiện tại và với tự điền GTGT vào `HAG_TX5` → dữ liệu đúng chuẩn hiện có không phải đổi.
- **Dữ liệu cũ lệch nhóm** (vd người khai từng nhập `V…` vào ô 1): `normalizeOtherTaxes` chạy khi **đọc** (form, bản in, payload FPT, AMA): mỗi bộ ba có mã thuế được chuyển về dòng `otherTaxGroupOf(TX)`. Bộ ba không có mã thuế (chỉ có TR/TG) giữ nguyên chỗ và bị báo ở 4.6. Hai bộ ba cùng nhóm: mã người khai nhập thắng mã tự điền (bỏ mã tự điền, không báo); cả hai do người khai nhập → giữ bộ ở dòng đúng nhóm, bộ còn lại báo lỗi "trùng loại thuế" (4.6), không tự xóa.
- Lần **ghi** tiếp theo của dòng hàng đó lưu theo dạng đã chuẩn hóa (ghi `field_audit` như mọi lần sửa – bất biến 6). Không chạy chuyển đổi hàng loạt.
- Không cần dọn dữ liệu mock cũ ngoài việc cùng đi qua `normalizeOtherTaxes`.

### 4.3 Form nhập (khu "Thuế và thu khác" của dòng hàng)

```
Thuế và thu khác
┌──────────────────────────────────┬──────────────────────┬────────────────────────┬──────────────┐
│ Loại thuế                        │ Mã áp dụng thuế suất │ Mã miễn/giảm/không chịu│ Số tiền giảm │
├──────────────────────────────────┼──────────────────────┼────────────────────────┼──────────────┤
│ CBPG (tự vệ, chống trợ cấp, CBPG) │ [B… C… G…        🔍] │ [B? C? G?          🔍] │ [          ] │
│ Chống phân biệt đối xử           │ [P…              🔍] │ [P?                🔍] │ [          ] │
│ Tiêu thụ đặc biệt                │ [T…              🔍] │ [T?                🔍] │ [          ] │
│ Bảo vệ môi trường                │ [M…              🔍] │ [M?                🔍] │ [          ] │
│ GTGT                             │ [VB901 ← tự điền 🔍] │ [V?                🔍] │ [          ] │
└──────────────────────────────────┴──────────────────────┴────────────────────────┴──────────────┘
```

- Luôn hiện đủ 5 dòng (chế độ sửa), mỗi dòng có nhãn loại thuế; bỏ nút "Thêm dòng" và nhãn chung "1 chống bán phá giá · … · 5 GTGT". Chế độ chỉ xem: chỉ hiện dòng có giá trị, nhãn là loại thuế (không phải số ô).
- Ô mã thuế: danh mục `OTHER_TAX` lọc theo `taxPrefixes` của dòng. Ô miễn/giảm: danh mục `A520` lọc theo **chữ cái đầu của mã thuế đã chọn**; chưa chọn mã thuế → lọc theo mọi chữ của nhóm. Dùng cơ chế phạm vi có sẵn (`code-scope.ts` `CodeScope.match`, `scopedEntries`), phạm vi **không cho bỏ lọc** (`optional: false`). Hiện `codeScope` chỉ nhận giá trị chỉ tiêu tờ khai – cần truyền thêm giá trị của dòng thuế (mã thuế cùng dòng).
- Nhãn loại thuế, placeholder, chú thích phạm vi: đủ vi/en/zh trong `*.messages.ts` (bất biến 12). Tên mã lấy nguyên từ danh mục, không dịch.
- Layout trong `declaration-layout/ida.ts`: thay `rep(…, 5, …)` vô danh bằng 5 dòng có nhãn theo `OTHER_TAX_GROUPS` (cách biểu diễn trong layout – mở rộng `rep` với nhãn từng dòng hay 5 nhóm riêng – để builder chọn, miễn `FormFieldRepeat`, bản in, `print-state` `fieldLocator`, `taxCodeKeys`/"Áp dụng cho các dòng khác" vẫn chạy).
- Tiến độ dòng hàng (`itemProgress`, `items.tsx`) đếm cả 5 dòng loại thuế, không chỉ dòng 1.

### 4.4 Dồn ô – khi truyền FPT

- `declaration-to-fpt.ts` (`items()`): sau khi gộp `{...auto, ...own}` của dòng hàng, gọi `normalizeOtherTaxes` rồi `compactOtherTaxes`, ghi `HAG_TX{k}/TR{k}/TG{k}` theo ô đã dồn; không gửi ô trống.
- Bắt buộc: **dòng GTGT phải có mã** (hàng không chịu thuế vẫn khai mã `V…` + mã `VK…` ở 1.95 – ghi chú pháp lý 1.94). Sau khi dồn, GTGT luôn có mặt nên ô 1 luôn có giá trị.
- Schema FPT: đặc tả hiện đánh dấu `HAG_TX5` bắt buộc (`packages/contracts/src/fpt/ida.ts:238`, `docs/vnaccs-api/README.md:649`) → dòng có ít hơn 5 loại thuế sẽ bị Zod chặn. Chuyển bắt buộc sang `HAG_TX1` (**cần xác nhận – mục 6**). `docs/vnaccs-api/` sinh bằng `scripts/vnaccs-api-docs/build.py` – không sửa tay; ghi chú lệch đặc tả trong comment ở `fpt/ida.ts`.
- Xem trước body (`fpt-preview`) tự đúng vì dùng chung hàm.

### 4.5 Bản in tờ khai

- Bản in là bản sao mẫu VNACCS → in theo **ô đã dồn** (`compactOtherTaxes` áp vào giá trị dòng hàng trong `printData`), giống hệt bản gửi.
- Bấm một ô 1–5 trên bản in → panel sửa mở **dòng theo loại** tương ứng (`slotToGroup`), panel có nhãn loại thuế và lọc mã như form. Sửa xong bản in tự dồn lại.
- "Áp dụng cho các dòng khác" (`applyToOtherLines`) áp theo dòng theo loại, không theo số ô.

### 4.6 Kiểm tra (chặn truyền, hiện trên form và bản in)

Từ `otherTaxIssues`, dùng chung form/bản in/backend:

| Lỗi | Khi nào | Mức |
|---|---|---|
| Mã thuế sai loại | mã ở dòng g không thuộc `taxPrefixes` của g (chỉ xảy ra khi dữ liệu cũ không chuẩn hóa được) | chặn |
| Trùng loại thuế | hai bộ ba cùng nhóm | chặn |
| Miễn/giảm khác loại | chữ cái đầu `TR` ≠ chữ cái đầu `TX` cùng dòng | chặn |
| Miễn/giảm không có mã thuế | có `TR`/`TG` nhưng `TX` trống | chặn |
| Thiếu mã GTGT | dòng 5 trống | thiếu bắt buộc (như ô bắt buộc khác) |

Lỗi dùng mã lý do ổn định (`reasonError`/reason-codes) + nhãn 3 ngôn ngữ; cùng quy tắc với nút Phê duyệt / Ký số (`requiredGaps`).

### 4.7 Lỗi Hải quan trả về theo ô

- Hiện `fieldDefForFptIndex` bỏ số cuối (`TX3` → `TX`) nên cả 5 ô bị tô đỏ. Sửa: giữ số ô `k` từ `indexCode`, đổi sang dòng theo loại bằng `slotToGroup` của **bản đã gửi** (dựng lại từ snapshot giá trị đã gửi), tô đúng một dòng. Không suy được → giữ cách cũ (tô cả khối).

### 4.8 Khai bổ sung sau thông quan (AMA)

- AMA đã dồn từ ô 1 và nhận GTGT theo chữ `V` (`post-amendment/rules.ts`), nhưng nguồn chỉ có GTGT (`integration/domain/post-amendment.ts:30-48`, mock `post-amendment-sim.ts`). Sửa: dựng `otherTaxes` từ 5 dòng theo loại của tờ khai gốc (đã chuẩn hóa, theo thứ tự nhóm) – GTGT giữ cách tính hiện có; các nhóm khác lấy mã, thuế suất/số tiền để trống nếu chưa có dữ liệu.
- Ô mã trước/sau (`HAG_MK/AK{n}`) lọc theo cùng quy tắc chữ cái của dòng.

### 4.9 Mock (`NEXT_PUBLIC_DATA_SOURCE=mock`)

Cùng đi qua các hàm contracts ở trên (form, bản in, gửi, AMA giả lập). Không đổi seed; không cần tăng `DB_VERSION`.

### 4.10 Tự điền dòng GTGT + cảnh báo "cần kiểm tra"

Chốt với người dùng 2026-11-16. Mã GTGT 8% và 5% **phụ thuộc mã HS** (theo danh mục HS / mô tả mã biểu thuế công bố), nên hệ thống không tự đoán từ thuế suất – lấy mã HSCodePro trả theo HS.

| Nguồn | Ô mã thuế (1.94, dòng GTGT) | Ô miễn/giảm (1.95) | Cảnh báo "cần kiểm tra" |
|---|---|---|---|
| HSCodePro trả mã `V…` có trong danh mục `OTHER_TAX` | mã đó | – | chỉ khi HSCodePro báo chưa chắc (`taxDetail.vatCertain = false` / `needsReview`) |
| HSCodePro trả `VK…` (không chịu thuế – trước khi HSCodePro sửa) | `V` | `VK…` | có – "suy từ mã không chịu thuế, kiểm tra lại" |
| Không có mã, thuế suất 10% | `VB901` | – | có – "suy từ thuế suất" |
| Không có mã, thuế suất 0% | `V` | – | có – "suy từ thuế suất" |
| Không có mã, thuế suất 8% hoặc 5% | **không tự điền** | – | báo thiếu: "chọn mã GTGT theo nhóm hàng của mã HS" (danh sách đã lọc `V…`) |
| Không có gì | không tự điền | – | báo thiếu |

- HSCodePro sẽ được sửa để trả **mã thuế suất** (`V…`), không trả mã miễn giảm; nhánh `VK…` giữ để đọc dữ liệu cũ / phiên bản cũ.
- Bỏ bảng suy `VB903/VB905/VB900` trong `vatCode` (không có trong danh mục). Fallback `vatCode: "VB901"` khi API HSCodePro cũ không trả mã (`hscodepro-map.ts:148`) đổi thành: suy theo bảng trên (10% → `VB901` kèm cảnh báo; khác → không tự điền).
- **Cảnh báo "cần kiểm tra"** là loại thông báo mới, **không chặn truyền**: ô có dấu cảnh báo vàng trên form và bản in kèm lý do (mã lý do ổn định + nhãn 3 ngôn ngữ), đếm vào huy hiệu "việc cần xử lý". Hết cảnh báo khi người khai chọn/xác nhận lại mã (ghi đè = giá trị người khai nhập).
- Áp dụng cùng nguyên tắc cho mọi giá trị tự điền chưa chắc chắn của 5 dòng (hiện chỉ GTGT có tự điền).

## 5. Kiểm thử

- Unit `other-tax.ts`: nhóm theo chữ cái (cả mã 1 chữ), dồn ô (0/1/3/5 loại), chuẩn hóa dữ liệu cũ (VAT ở ô 1, hai mã cùng nhóm, TR không TX), mọi lỗi 4.6; tự điền GTGT theo bảng 4.10 (VK… → `V` + `VK…`, 8%/5% không tự điền, cảnh báo "cần kiểm tra").
- Sửa test đang khóa hành vi cũ: `item-fields.test.ts`, `dossier-adapter.test.ts`, `customs-domain.test.ts:349-355` (override ô 5 → gửi ô đã dồn), `print-state.test.ts`, `print-layout.test.ts`, `code-lists.test.ts:73`, `required.test.ts`, AMA (`rules.test.ts`, `post-amendment.test.ts`, `customs-use-cases.test.ts:949`).
- Payload FPT: dòng chỉ GTGT → `HAG_TX1` = mã VAT, `HAG_TX2..5` không gửi; dòng có TTĐB + GTGT → `TX1 = T…`, `TX2 = V…`; schema chấp nhận.
- Lỗi Hải quan `HAG_TX2` trên dòng có TTĐB + GTGT → tô dòng GTGT.
- Component: lọc mã theo dòng, nhãn 3 ngôn ngữ, axe.
- Trình duyệt: form + bản in, sáng/tối, 1366/390, vi/en/zh.

## 6. Đã chốt với người dùng (2026-11-16)

1. FPT chuyển thẳng ô sang VNACCS → hệ thống **tự dồn ô trước khi gửi** (4.4). Đánh dấu bắt buộc `HAG_TX5` trong đặc tả FPT là sai so với thực tế; chuyển sang `HAG_TX1`.
2. Bảng tự điền GTGT và cảnh báo "cần kiểm tra": 4.10.

## 6b. Quyết định của người viết (người dùng kiểm tra khi đọc)

- **Mã người khai nhập thắng mã tự điền cùng loại.** Dòng cũ có `V…` người khai nhập ở ô 1 + GTGT tự điền ở ô 5 → giữ mã người khai, bỏ mã tự điền, không báo trùng (sửa 4.2: "trùng loại" chỉ khi cả hai đều do người khai nhập).
- **AMA:** nhóm CBPG/PBĐX/TTĐB/BVMT mang mã sang trước = sau, không tính chênh lệch (giữ đúng mức hiện nay: hôm nay AMA hoàn toàn không có các nhóm này); có ghi chú "chưa tính chênh lệch cho loại thuế này". Tính đúng cần ánh xạ kết quả Hải quan `HAG_KQ/KY/KZ{n}` – việc sau.
- **Lỗi Hải quan theo ô (4.7):** đổi ô → dòng theo loại dựa trên bản đã gửi (`customs_outbox.payload.sent`) nếu đưa được tới giao diện cùng lỗi; nếu làm vậy tốn quá nhiều (contract + mock) thì dựng lại từ giá trị hiện tại khi tờ khai chưa bị sửa sau lần gửi, ngược lại tô cả khối như cũ. Builder chọn, ghi lý do trong plan.
- **Mã ngoài danh mục** (dữ liệu cũ như `VB905`): hiện nguyên, báo "mã không có trong danh mục" (cảnh báo, không chặn) – tránh chặn nhầm khi danh mục chưa cập nhật.

## 7. Để builder quyết

- Cách biểu diễn 5 dòng có nhãn trong layout (`rep` có nhãn từng dòng hay 5 nhóm).
- Vị trí và tên chính xác các hàm, mã lý do mới.
- Cách truyền giá trị cùng dòng vào `codeScope`.
