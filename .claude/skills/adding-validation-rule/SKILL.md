---
name: adding-validation-rule
description: Use when adding or changing a cross-document check (weights, quantities, invoice references, origin, incoterm, dates, tax codes) or when a reviewer found an error that the system did not flag
---

# Thêm / sửa luật đối chiếu

## Nguyên tắc
Luật là **hàm thuần** `(shipment, ctx) → Validation[]` trong `modules/validation/domain/rules/`. Không I/O, không gọi AI. Thiếu dữ liệu → `SKIPPED`, không đoán.

## Mẫu

```ts
// modules/validation/domain/rules/gross-weight-match.ts
export const grossWeightMatch: Rule = {
  id: "gross_weight_match",
  severity: "BLOCKER",
  run(s) {
    const bl = s.transport.grossWeight?.value;
    const invSum = sumOrNull(s.invoices.map((i) => i.grossWeightKg));
    if (bl == null || invSum == null) return skipped("Thiếu trọng lượng trên vận đơn hoặc invoice");
    return near(bl, invSum, { abs: 0.1, rel: 0.005 })
      ? pass(`Vận đơn ${fmtKg(bl)} = Σ invoice ${fmtKg(invSum)}`)
      : fail(`Vận đơn ${fmtKg(bl)} ≠ Σ invoice ${fmtKg(invSum)}`, ["/transport/grossWeight"]);
  },
};
```

## Các bước
1. Viết test TRƯỚC trong `rules/__tests__/<rule>.test.ts`: tối thiểu 4 ca – PASS, FAIL/WARN, SKIPPED (thiếu dữ liệu), ca biên (làm tròn, đơn vị khác, nhiều invoice).
2. Viết luật. `detail` là câu tiếng Việt có **số liệu cụ thể** để người duyệt hiểu ngay.
3. `fields` trỏ JSON pointer vào trường liên quan (UI dùng để highlight).
4. Đăng ký trong `rules/index.ts`.
5. Nếu sửa luật cũ: chạy lại trên `evals/golden/*` và ghi số luật đổi trạng thái vào PR.

## Chọn mức

| Mức | Khi nào | Tác động |
|---|---|---|
| `BLOCKER` | Sai thì tờ khai sai (trị giá, số lượng, MST, HS, số vận đơn) | Chặn truyền |
| `WARNING` | Bất thường có thể hợp lệ (số kiện khác do đóng pallet) | Đánh dấu cho người duyệt |
| `INFO` | Thông tin tham khảo | Chỉ hiển thị |

## Lỗi hay gặp
- So sánh số thực bằng `===` → dùng `near()` có sai số.
- So tên công ty nguyên văn → dùng `nameSimilarity()` hoặc so theo MST.
- Trả FAIL khi thiếu dữ liệu → phải là SKIPPED.
- Báo trùng cùng một vấn đề nhiều lần (mỗi invoice một dòng) → gộp theo khóa.
- Dùng `number` để tính tiền trong luật → `Decimal`.
