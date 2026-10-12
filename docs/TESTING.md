# Chuẩn viết test

Công cụ: **Vitest** (unit/component/integration) · **Testing Library** + `user-event` · **axe-core** (a11y) · **Testcontainers** (DB) · **Playwright** (E2E) · `node:test` (script).

## 1. Test cái gì, ở tầng nào

| Tầng | Bắt buộc test | Không mock |
|---|---|---|
| `domain` (hàm thuần) | Mọi hàm; mỗi luật đối chiếu ≥ 4 ca: PASS, FAIL/WARN, SKIPPED (thiếu dữ liệu), ca biên | Không mock gì |
| `application` (use case) | Luồng đúng, mỗi `DomainError.code`, **1 ca org khác bị từ chối** | Dùng fake repo in-memory |
| `infrastructure` (repo) | Truy vấn thật trên Postgres (Testcontainers), lọc `org_id`, RLS | Không mock DB |
| Theme / token | Tương phản ≥ 4.5:1 mọi tổ hợp; token CSS khớp code | – |
| Component `@kb/ui` | Theo checklist §3 | Không mock component con |
| Feature `apps/web` | Logic thuần của feature (Vitest); luồng chính bằng Playwright | – |
| Trích xuất AI | Golden set `evals/` (skill `changing-extraction-prompt-or-model`) | – |

## 2. Quy ước chung

- File test đặt **cạnh** file nguồn: `button.tsx` → `button.test.tsx`.
- Tên `describe` = đơn vị được test; tên `it` = **hành vi bằng tiếng Việt**, đọc như yêu cầu: `it("loading: khóa nút, đặt aria-busy, không gọi onClick")`.
- Cấu trúc **Arrange – Act – Assert**, một hành vi mỗi `it`. Nhiều dữ liệu cùng hành vi → `it.each`.
- Không phụ thuộc thứ tự chạy, thời gian thật, mạng thật. Thời gian → `vi.useFakeTimers()` hoặc truyền `clock`.
- **Không snapshot DOM lớn** (vỡ vì đổi class, không nói lên hành vi). Snapshot chỉ cho output nhỏ, ổn định (vd chuỗi CSS sinh ra).
- Test phải **fail được**: khi thêm test cho bug, chạy trước khi sửa để thấy đỏ.
- Dữ liệu mẫu nghiệp vụ lấy từ chứng từ thật đã ẩn danh (`evals/golden/`), không bịa số liệu phi thực tế.

## 3. Checklist test component (`@kb/ui`)

Mỗi component mới phải có:

1. **Hiển thị**: render với props tối thiểu; truy vấn bằng vai trò truy cập.
2. **Biến thể & trạng thái**: mỗi `variant`/`size`/`tone` quan trọng; `disabled`, `loading`, `error`, rỗng.
3. **Tương tác**: chuột **và** bàn phím (`Enter`, `Space`, `Escape`, mũi tên) bằng `userEvent`.
4. **A11y**: `await expectNoA11yViolations(container)` (helper `packages/ui/test/a11y.ts`).
5. **Chỉ dùng token**: không có class màu thô (lint đã chặn; test chỉ cần cho biến thể sinh class động).
6. **Hợp đồng props**: `className` gộp được (tailwind-merge), callback gọi đúng tham số, component điều khiển được (`value` + `onChange`).

## 4. Truy vấn trong Testing Library – thứ tự ưu tiên

1. `getByRole(role, { name })` – giống cách trình đọc màn hình thấy (tên truy cập thật, bỏ phần `aria-hidden`).
2. `getByLabelText` – cho ô nhập.
3. `getByText` – cho nội dung tĩnh.
4. `getByTestId` – **chỉ khi** không còn cách nào; giải thích bằng comment.

Không truy vấn bằng class CSS hay cấu trúc DOM (`container.querySelector("div > span")`).

## 5. Mẫu

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../test/a11y.js";
import { Button } from "./button.js";

describe("Button", () => {
  it("loading: khóa nút, đặt aria-busy, không gọi onClick", async () => {
    const onClick = vi.fn();                                   // Arrange
    render(<Button loading onClick={onClick}>Lưu</Button>);
    const btn = screen.getByRole("button", { name: "Lưu" });

    await userEvent.click(btn);                                // Act

    expect(btn).toBeDisabled();                                // Assert
    expect(btn).toHaveAttribute("aria-busy", "true");
    expect(onClick).not.toHaveBeenCalled();
  });

  it("không vi phạm a11y", async () => {
    const { container } = render(<Button>Lưu</Button>);
    await expectNoA11yViolations(container);
  });
});
```

## 6. Test chụp ảnh so sánh giao diện (visual regression)

- Bộ test ở `packages/ui/visual/` mở playground ở các trạng thái cố định (sáng, tối, màu thương hiệu khác, mật độ gọn, góc vuông, dialog panel, sơ đồ quy trình, bảng, menu mobile) trên desktop và mobile rồi so với ảnh chuẩn.
- Ảnh chuẩn ở `visual/__screenshots__/{hệ điều hành}/{desktop|mobile}/`. Ngưỡng sai khác = **0 pixel** (đã thử: ngưỡng 0,2% bỏ lọt thay đổi bo góc 2px).
- Ổn định: dùng font hệ thống (`?font=system`), tắt animation, ẩn trợ lý (`?ai=0`), cố định múi giờ.
- Khi test đỏ: mở `visual-report/index.html` xem ảnh diff. **Chỉ** chạy `test:visual:update` khi thay đổi đó là cố ý, và ghi lý do vào PR.
- Mỗi hệ điều hành có bộ ảnh riêng (font render khác nhau). CI Linux cần sinh bộ ảnh `linux` một lần.
- Thêm component mới vào playground → cân nhắc thêm 1 ảnh chụp nếu nó có trạng thái hiển thị riêng.

## 7. Lệnh

```bash
pnpm test                         # toàn bộ (CI)
pnpm --filter @kb/ui test:watch   # khi đang làm component
node --test scripts/*.test.mjs    # test script lint
pnpm --filter @kb/ui test:visual          # so sánh ảnh giao diện
pnpm --filter @kb/ui test:visual:update   # cập nhật ảnh chuẩn (chỉ khi đổi giao diện CỐ Ý)
```

CI chặn merge khi có test đỏ. Không `it.skip` / `it.only` trong code merge (trừ khi có issue kèm link).
