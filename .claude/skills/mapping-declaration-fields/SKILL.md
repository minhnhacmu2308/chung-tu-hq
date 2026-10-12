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
    from: (s) => s.transport.houseBillNo,
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

## Các bước
1. Xác định chỉ tiêu theo văn bản hướng dẫn tờ khai hiện hành; ghi nguồn văn bản trong comment.
2. Thêm/sửa `FieldMapping` (nguồn, hàm lấy, chuyển đổi mã/đơn vị, bắt buộc, validate).
3. Mã danh mục (đơn vị tính, nước, cảng, phương thức thanh toán, điều kiện giao hàng…) lấy từ bảng master data `declaration/domain/catalogs/`, không hard-code rải rác.
4. Trị giá: dùng `Decimal`. Incoterm EXW/FCA/FAS/FOB → cộng cước, bảo hiểm, phí nước ngoài theo `valuation`; ghi rõ khoản nào cộng vào trị giá tính thuế.
5. Tỷ giá tính thuế lấy từ nguồn chính thức theo ngày, KHÔNG dùng tỷ giá trên chứng từ forwarder.
6. Test: mỗi chỉ tiêu mới ≥ 1 test với shipment mẫu từ `evals/golden/`; test thiếu dữ liệu → chỉ tiêu bị đánh dấu thiếu, không điền bừa.
7. Nhờ người có nghiệp vụ hải quan review PR thay đổi chỉ tiêu bắt buộc hoặc trị giá.

## Lỗi hay gặp

| Lỗi | Đúng |
|---|---|
| Điền tên cảng tự do vào chỉ tiêu cần mã | Mã từ catalog; thiếu mã → đánh dấu cần duyệt |
| Lấy HS 8 số trên invoice nước ngoài làm HS khai | HS 8 số theo biểu VN phải được người xác nhận |
| Cộng tiền bằng `number` | `Decimal` |
| Cảng dỡ = cảng chuyển tải trên B/L | Dùng điểm đến cuối ở VN nếu POD là cảng nước ngoài |
| Điền giá trị mặc định khi thiếu dữ liệu | Để trống + đánh dấu thiếu |
