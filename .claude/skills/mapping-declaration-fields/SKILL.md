---
name: mapping-declaration-fields
description: Use when adding or changing how shipment data fills customs declaration (tờ khai IDA/EDA, VNACCS) fields, codes, units, valuation adjustments, or tax estimates
---

# Ánh xạ sang chỉ tiêu tờ khai

## Nguyên tắc
Ánh xạ là **cấu hình + hàm thuần** trong `modules/declaration/domain/mapping/`, KHÔNG dùng AI. Mỗi chỉ tiêu ghi rõ nguồn để UI hiện nhãn "Invoice / B/L / Hồ sơ / Mặc định".

## Mẫu

```ts
// mapping/ida/transport.ts
export const IDA_TRANSPORT: FieldMapping[] = [
  {
    field: "IDA.soVanDon",                 // chỉ tiêu tờ khai
    source: "B/L",
    from: (s) => s.transport.billNo,     // vận đơn nhà nếu có (HB/L, HAWB), không thì vận đơn duy nhất – không dùng houseBillNo (không còn ghi)
    required: true,
  },
  {
    field: "IDA.diaDiemDoHang",
    source: "B/L",
    from: (s) => s.transport.portOfDischarge?.code,   // mã UN/LOCODE, không lấy tên tự do
    required: true,
    validate: isVnPortCode,
  },
];
```

## Cấu hình theo doanh nghiệp (2026-10-15)
- `FieldMapping.from` là quy tắc mặc định (code có test). Muốn cho doanh nghiệp đổi nguồn: thêm `options: { sources: SourceOption[], allowFixed }` (nguồn dùng chung ở `mapping/sources.ts`). Chỉ tiêu trị giá/thuế (`DERIVED_DECLARATION_FIELD_CODES`) KHÔNG có `options`.
- Giá trị có thể lấy từ Mặc định khai báo: `profileOr(i, "<CODE>", fallback)` – mã phải nằm trong `PROFILE_FIELD_CODES`.
- `evaluateMapping` áp ghi đè và ghi `provenance`; `validateOverrides` kiểm khi lưu. Test tương đương "không ghi đè = from" ở `__tests__/rules.test.ts` phải xanh.

## Các bước
1. Xác định chỉ tiêu theo văn bản hướng dẫn tờ khai hiện hành; ghi nguồn văn bản trong comment.
2. Thêm/sửa `FieldMapping` (nguồn, hàm lấy, chuyển đổi mã/đơn vị, bắt buộc, validate).
3. Mã danh mục (đơn vị tính, nước, cảng, phương thức thanh toán, điều kiện giao hàng…) lấy từ bảng master data `declaration/domain/catalogs/`, không hard-code rải rác.
4. Trị giá: dùng `Decimal`. Incoterm EXW/FCA/FAS/FOB → cộng cước, bảo hiểm, phí nước ngoài theo `valuation`; ghi rõ khoản nào cộng vào trị giá tính thuế.
5. Tỷ giá tính thuế lấy từ nguồn chính thức theo ngày, KHÔNG dùng tỷ giá trên chứng từ forwarder.
6. Test: mỗi chỉ tiêu mới ≥ 1 test với shipment mẫu từ `evals/golden/`; test thiếu dữ liệu → chỉ tiêu bị đánh dấu thiếu, không điền bừa.
7. Nhờ người có nghiệp vụ hải quan review PR thay đổi chỉ tiêu bắt buộc hoặc trị giá.

## Trị giá tính thuế & thuế ước tính – theo đặc tả VNACCS

Căn cứ: `docs/tinhthue/1001-1_IDA_Service Specification.docx` (IDA, mục 7 (2)–(14)) và `docs/tinhthue/1013-1_EDA_Service Specification.docx` (EDA, mục 7 (2)–(13)) – cách hệ thống Hải quan tự tính khi khai tạm. Code: `declaration/domain/valuation.ts` (trị giá), `tax.ts` (thuế); số app tính chỉ là **ước tính**, số chính thức là số Hải quan trả về (bản in hiện số Hải quan khi có).

**Quy đổi VND** – mỗi khoản (trị giá hóa đơn, cước, bảo hiểm, khoản điều chỉnh, trị giá tính thuế) theo mã tiền riêng: `số tiền × tỷ giá tính thuế của mã tiền đó` (tỷ giá ngày khai), làm tròn 4 chữ số thập phân mỗi lần quy đổi.

**Tổng trị giá tính thuế (IDA)** = trị giá hóa đơn + cước + bảo hiểm, theo mã điều kiện giá:

| Mã | Điều kiện giao hàng | Cước | Bảo hiểm |
|---|---|---|---|
| 1 | CIF, CIP, DDP, DAT, DAP, DDU, DAF, DES, DEQ | chỉ khi cước khác hóa đơn | – |
| 2 / 3 / 4 | C&F, CFR, CPT | chỉ khi cước khác hóa đơn | riêng / tổng hợp / không bảo hiểm |
| 5 | C&I | có | – |
| 6 / 7 / 8 | FOB, FCA, FAS, EXW | có | riêng / tổng hợp / không bảo hiểm |

Rồi ± khoản điều chỉnh 1.49 (AD cộng, SB trừ; DP = người khai tự tính tổng trị giá). **Trị giá từng dòng** = tổng trị giá × trị giá hóa đơn của dòng ÷ tổng phân bổ (ô "Tổng hệ số phân bổ trị giá", không có thì tổng trị giá hóa đơn các dòng; dòng khai sẵn trị giá tính thuế thì lấy ô đó và không tính vào tổng phân bổ). Khoản điều chỉnh theo số mục (1.88) phân bổ theo trị giá hóa đơn các dòng có cùng số mục.

**EDA**: tổng trị giá = ô Trị giá tính thuế nếu có, không thì trị giá hóa đơn → VND → phân bổ theo trị giá hóa đơn như trên.

**Thuế từng dòng** (theo thứ tự – sắc thuế sau dùng số của sắc thuế trước):
1. **NK / XK** – theo %: trị giá dòng × thuế suất; tuyệt đối: lượng tính thuế × mức thuế; hỗn hợp: cộng cả hai. Lượng tính thuế: Số lượng (1) nếu đúng đơn vị của mức thuế, không thì Số lượng (2).
2. **Thuế bổ sung** (chống bán phá giá, chống trợ cấp, tự vệ…) – cùng cách như thuế NK.
3. **TTĐB** = (trị giá + thuế NK + thuế bổ sung) × thuế suất TTĐB.
4. **BVMT** = lượng tính thuế × mức thuế BVMT.
5. **GTGT** = (trị giá + thuế NK + thuế bổ sung + TTĐB + BVMT) × thuế suất GTGT.

Mỗi sắc thuế: mã miễn → 0; mã giảm → trừ số tiền giảm khai; mã không chịu thuế → không tính, không in thuế suất. Làm tròn 4 chữ số thập phân ở mỗi phép tính; **tổng từng sắc thuế làm tròn đến đồng**; tổng thuế phải nộp = NK + bổ sung + TTĐB + BVMT + GTGT (trừ loại hình C11; EDA trừ C12).

**Code hiện tại khác đặc tả (biết và chấp nhận, ghi rõ khi sửa):**
- Làm tròn đến đồng ở từng dòng (đặc tả: 4 số lẻ từng bước, làm tròn ở tổng) → lệch tối đa 0,5 đồng/dòng/sắc thuế; giữ để tổng các tờ của lô nhiều tờ cộng lại đúng bằng cả lô.
- Chưa có thuế suất thuế bổ sung, TTĐB, BVMT và mức thuế tuyệt đối trên dòng hàng → ước tính chỉ có thuế NK theo % và GTGT; `computeTaxes` đã nhận các khoản đó (`otherTaxesVnd`) để GTGT cộng đúng khi có.
- Chưa tính bảo hiểm tổng hợp (mã 3, 7 – theo hệ số bảo hiểm tổng hợp của Hải quan).

## Lỗi hay gặp

| Lỗi | Đúng |
|---|---|
| Điền tên cảng tự do vào chỉ tiêu cần mã | Mã từ catalog; thiếu mã → đánh dấu cần duyệt |
| Lấy HS 8 số trên invoice nước ngoài làm HS khai | HS 8 số theo biểu VN phải được người xác nhận |
| Cộng tiền bằng `number` | `Decimal` |
| Cảng dỡ = cảng chuyển tải trên B/L | Dùng điểm đến cuối ở VN nếu POD là cảng nước ngoài |
| Điền giá trị mặc định khi thiếu dữ liệu | Để trống + đánh dấu thiếu |
