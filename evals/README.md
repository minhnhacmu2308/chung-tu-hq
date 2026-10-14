# Golden set trích xuất

- `golden/<lô>/`: các PDF/ảnh của một bộ chứng từ + `expected.json` (đường dẫn trong `Shipment` → giá trị mong đợi; `/items/length` = số dòng hàng).
- `fixtures/`: kết quả AI thật đã ghi theo sha256 file (`<sha>.classify.json`, `<sha>.extract.<KIND>.json`) để chạy offline. Không có fixture → `FakeAiProvider` dùng bộ HANSOL cố định.
- `results/<tag>.json`: báo cáo đã lưu để so sánh.

```bash
pnpm eval                 # offline (fixture / fake) – chạy trong CI
pnpm eval --live --tag v2 # gọi AI thật (cần ANTHROPIC_API_KEY), ghi fixture + results/v2.json
pnpm eval:diff v1 v2      # trường nào đổi đúng/sai giữa hai lần
```
