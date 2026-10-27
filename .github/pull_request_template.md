## Thay đổi gì, vì sao

<!-- 1-3 câu -->

## Review (bắt buộc – `.claude/rules/review-truoc-commit.md`)

<!-- Dán "Dòng cho commit" của 2 agent; có FAIL đã sửa thì ghi kèm. Bỏ qua mục nào → Review-override: <mục> – <lý do, ai chấp nhận> -->
- hq-review-backend: ✅ PASS / ❌ FAIL – …
- hq-review-frontend: ✅ PASS / ❌ FAIL – …

## Review (bắt buộc – `.claude/rules/review-truoc-commit.md`)

<!-- Dán "Dòng cho commit" của 2 agent; có FAIL đã sửa thì ghi kèm. Bỏ qua mục nào → Review-override: <mục> – <lý do, ai chấp nhận> -->
- hq-review-backend: ✅ PASS / ❌ FAIL – …
- hq-review-frontend: ✅ PASS / ❌ FAIL – …

## Checklist

- [ ] `pnpm typecheck && pnpm lint && pnpm test` xanh
- [ ] Truy vấn/ghi dữ liệu mới đều lọc theo `orgId`; có test org khác bị từ chối
- [ ] Mã định danh là `string`; tiền dùng `Decimal`; ngày ISO
- [ ] Dữ liệu từ ngoài được parse bằng Zod ở biên
- [ ] Không có nghiệp vụ trong `apps/*` (chỉ gọi use case)
- [ ] Màn hình mới có loading / empty / error; chỉ dùng `@kb/ui` + token (`pnpm lint` xanh); đã xem ở sáng + tối
- [ ] Chữ hiển thị mới có đủ 3 ngôn ngữ vi / en / zh (đã dịch thật, đã xem màn ở English và 中文) – `.claude/rules/ho-tro-3-ngon-ngu.md`
- [ ] Test theo `docs/TESTING.md` (component có test a11y)
- [ ] Bảng DB mới: `org_id`, index, RLS, migration

### Nếu đụng tới trích xuất (prompt / schema / model / skill)
- [ ] Đã chạy eval trước/sau – dán bảng so sánh:

| Trường | Trước | Sau |
|---|---|---|
| | | |

- [ ] Không trường BLOCKER nào giảm độ chính xác
- [ ] Chi phí trung bình / lô: trước … → sau …

### Nếu đụng tới tờ khai / trị giá
- [ ] Người có nghiệp vụ hải quan đã review
