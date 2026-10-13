# Design system – `@kb/ui`

Mọi giao diện dùng **chung một bộ token và component**. Không có màu, bo góc, khoảng cách "tự chế" ở bất kỳ màn nào. Đây là điều kiện để khách hàng tùy biến giao diện mà toàn hệ thống vẫn đồng bộ.

Xem trực quan: `pnpm ui:playground` → http://127.0.0.1:5180 (có bảng cấu hình để thử mọi tùy chọn).

## 1. Ba lớp

```
tokens.css        Biến CSS --kb-*  (NGUỒN DUY NHẤT của màu/khoảng cách/bo góc/font/bóng)
   ↓  @theme inline (Tailwind v4)
utility           bg-surface · text-fg-muted · bg-primary · rounded-md · shadow-sm · p-4 · gap-2
   ↓
component @kb/ui  Button · Field/Input/Select · Card · Grid/Stack · Badge/StatusBadge · Alert · Tabs · Dialog · AssistantPanel…
   ↓
apps/web          CHỈ ghép component + utility token. Không tự định nghĩa style.
```

## 2. Token

| Nhóm | Utility | Ghi chú |
|---|---|---|
| Nền | `bg-bg` (trang), `bg-surface` (thẻ, ô nhập), `bg-surface-muted` (vùng phụ) | |
| Chữ | `text-fg`, `text-fg-muted`, `text-fg-subtle` | Cả 3 đều đạt AA 4.5:1 trên mọi nền – có test |
| Viền | `border-border`, `border-border-strong` | |
| Thương hiệu | `bg-primary` / `text-primary-fg`, `hover:bg-primary-hover`, `bg-primary-subtle` / `text-primary-subtle-fg`, `ring-focus` | **Khách đổi được** |
| Trạng thái | `{success,warning,danger,info,neutral}` × `{"", -fg, -subtle, -subtle-fg}` | **Khóa** – đỏ luôn là lỗi |
| Bo góc | `rounded-sm/md/lg/full` | Theo tùy chọn Bo góc |
| Bóng | `shadow-sm/md/lg` | |
| Khoảng cách | Thang Tailwind `p-1…p-12`, `gap-*`, `h-*` | Co giãn theo Mật độ (`--spacing`) |

Bảng màu mặc định của Tailwind (`blue-500`, `gray-100`…) **đã bị tắt**.

## 3. Tùy biến giao diện (theo ảnh cấu hình sản phẩm)

| Tùy chọn | Cơ chế | Ai đặt |
|---|---|---|
| Ngôn ngữ | `lang` | Người dùng |
| Giao diện Sáng / Tối / Theo hệ thống | `data-theme` + `light-dark()` | Người dùng |
| Hiệu ứng con trỏ | `data-cursor-effect` (app tự xử lý, tôn trọng `prefers-reduced-motion`) | Người dùng |
| Mô tả trang | `data-page-description` → ẩn `[data-slot=page-description]` | Người dùng |
| Nền trang Phẳng / Aurora | `data-backdrop` | Doanh nghiệp (có thể khóa) |
| Mật độ Gọn / Chuẩn / Thoáng | `data-density` → `--spacing` | Người dùng |
| Dải xám Slate / Gray | `data-gray` → `--kb-gray-*` | Doanh nghiệp (có thể khóa) |
| Màu thương hiệu | `brandThemeCss()` – **CSS động duy nhất** | Doanh nghiệp (có thể khóa) |
| Bo góc Vuông / Mặc định / Bo tròn | `data-radius` | Doanh nghiệp (có thể khóa) |
| Cỡ chữ Nhỏ / Vừa / Lớn | `data-font-size` | Người dùng |
| Font chữ | `data-font` (app tải webfont qua `next/font`) | Doanh nghiệp (có thể khóa) |

Thứ tự áp dụng: `DEFAULT_APPEARANCE` → cấu hình doanh nghiệp → tùy chọn người dùng. Trường doanh nghiệp khóa thì người dùng không ghi đè được (`resolveAppearance()` trả `ignoredUserFields`).

**Màu thương hiệu luôn đọc được:** `createBrandTheme(hex)` tự làm đậm/nhạt màu khách chọn cho tới khi đạt tương phản 4.5:1 trên nền sáng **và** nền tối, sinh sẵn hover/active/subtle/chữ-trên-nền, và trả `adjustments` để báo admin (vd "#EA580C → #C94C0A").

### Áp dụng trong Next.js (layout gốc, render phía server để không nháy màu)

```tsx
import "@kb/ui/styles.css";
import { appearanceAttributes, appearanceCss, resolveAppearance } from "@kb/ui/theme";

export default async function RootLayout({ children }) {
  const { org, user } = await getAppearanceSettings();          // từ DB
  const { appearance } = resolveAppearance(org, user);
  const { css } = appearanceCss(appearance);                   // chỉ chứa hex đã kiểm tra
  return (
    <html {...appearanceAttributes(appearance)}>
      <head><style id="kb-brand" dangerouslySetInnerHTML={{ __html: css }} /></head>
      <body>{children}</body>
    </html>
  );
}
```

## 4. Component

| Component | Dùng cho |
|---|---|
| `Button` (`primary/secondary/ghost/danger/link`, `sm/md/lg/icon`, `loading`, `asChild`) | Mọi nút. `asChild` để bọc `<Link>` |
| `Field` + `Input` / `Textarea` / `Select` / `Checkbox` | Mọi ô nhập. Field tự gắn nhãn, gợi ý, lỗi, `aria-*` |
| `Card` (`Header/Title/Description/Content/Footer`) | Khối nội dung |
| `Grid` (`cols={{ base:1, md:2, lg:4 }}`), `Stack` | Bố cục. Không tự viết `grid-cols-*` rời rạc |
| `PageHeader` | Tiêu đề + mô tả + hành động của mỗi trang |
| `Badge`, `StatusBadge` | Nhãn. **Trạng thái nghiệp vụ luôn dùng `StatusBadge`** (PASS/WARN/FAIL, CROSS_CHECKED, CONFLICT…, luồng xanh/vàng/đỏ) |
| `Alert` | Thông báo trong trang |
| `Skeleton`, `Spinner`, `EmptyState` | Trạng thái tải / trống |
| `Tabs` | Tab |
| `Dialog` (`presentation` / `defaultPresentation` / `onPresentationChange`) + `DialogContent` (`icon`, `size`, nút chuyển trên header) + `DialogFooter` | Popup. Cửa sổ = phủ nền, giữ focus, khóa cuộn. Panel bên phải = **không chặn trang** (thao tác song song). Đổi qua lại **không mất dữ liệu đang nhập** |
| `AssistantPanel` (`floating/docked/fullscreen`), `AssistantLauncher` (`state`), `AssistantWelcome`, `SuggestionChips`, `ChatMessage`, `ChatComposer` | Trợ lý AI. Nút mở là linh vật `RobotAvatar`; app truyền `state="thinking"` khi trợ lý đang trả lời |
| `RobotAvatar` (`state`: idle/thinking/searching/listening/speaking/working/happy/error/sleeping, `size`, `interactive`, `antenna`) | Đầu robot hoạt hình (thư viện `robot-heads`, canvas). Màu vỏ/màn hình/viền đọc từ token `primary`/`primary-fg`/`primary-subtle` nên tự đổi theo theme và màu thương hiệu; chỉ vẽ phía client, `aria-hidden` |
| `SegmentedControl`, `ColorSwatchPicker`, `AppearancePanel` | Tùy chọn dạng phân đoạn / chọn màu / bảng cấu hình giao diện |
| `Sidebar` (`items` có nhóm con, `collapsed` / `onCollapsedChange`, `linkAs={Link}`, `mobileOpen` / `onMobileOpenChange`), `SidebarMobileTrigger`, `SidebarFooterButton`, `SidebarUser`, `BrandDot` | Menu chính co giãn: mở rộng ↔ thu gọn (cột icon + tooltip). Màn nhỏ: ngăn kéo mở bằng nút ☰. `SidebarUser`/`SidebarFooterButton` làm trigger được cho `DropdownMenu`/`Popover` (asChild) |
| `Stepper` (`steps`, `currentId`, `viewingId`, `onStepClick`, `action`) | Thanh các bước của hồ sơ; bước đã qua bấm được để xem lại; `viewingId` = bước đang xem lại (bước hiện tại khi đó bấm được để quay về); `action` để đặt nút "Xem cây quy trình". Màn nhỏ gọn thành "Bước 3/6 · …" |
| `WorkflowDiagram` (`nodes`: start/end/step/decision + `status`; `edges` có `label`) | Sơ đồ cây quy trình: tự bố cục (dagre), nhánh tách làn, đường đã đi tô màu, bước hiện tại gắn nhãn, phóng to/thu nhỏ. Thường đặt trong `DialogContent size="lg"` |
| `DocumentViewer` (`label`, `pages`, `regions` {id, page, x/y/w/h theo %, `label`, `content`}, `highlightId`, `onRegionClick`, `page`/`onPageChange`) | Xem chứng từ gốc: chuyển trang, phóng to/thu nhỏ/vừa khung, tô vùng của một trường (tự sang trang chứa vùng, cuộn tới). Vị trí vùng truyền qua biến CSS cục bộ. `content` để in chữ vào vùng khi dựng lại trang từ dữ liệu (prototype chưa có ảnh PDF) |
| `DataTable` (`columns` qua `createDataTableColumnHelper`, `selectable`, `rowActions`, `onRowClick`, `pagination`, `loading`, `empty*`, `searchable`, `columnToggle`, `resizable`, `toolbarActions`; điều khiển được: `columnVisibility`, `columnSizing`; `meta: { align, wrap, filter: "text"|"select", filterOptions, label, hideable, resizable }`; độ rộng qua `size`/`minSize`/`maxSize` của cột) | Mọi bảng danh sách. Sắp xếp, chọn dòng, phân trang client/server, header dính. Tìm toàn bảng + lọc theo cột **không dấu**; ẩn/hiện cột; kéo đổi độ rộng (chuột, mũi tên ←/→, nhấp đúp để về mặc định). Mặc định không xuống dòng + cuộn ngang; cột dài bật `meta.wrap`. Lưu ý: tìm/lọc chạy trên dữ liệu đã tải (phân trang server chưa gửi bộ lọc lên server); tìm theo giá trị gốc, không theo nhãn hiển thị |
| `Pagination` | Phân trang dùng riêng (DataTable đã tích hợp sẵn) |
| `Toaster` (đặt 1 lần ở gốc) + `toast({ tone, title, description, action })` | Thông báo nổi sau thao tác: lưu, gửi, lỗi mạng. danger/warning đọc ngay cho trình đọc màn hình |
| `Tooltip` | Gợi ý ngắn cho nút icon. Không đặt thao tác trong tooltip |
| `DropdownMenu*` (Item có `icon`, `shortcut`, `tone="danger"`; Checkbox/Radio/Sub) | Menu người dùng, nút "…" trên dòng bảng |
| `Popover*` (`showClose`) | Bộ lọc, nội dung phụ có tương tác |
| `FileDropzone` (`accept`, `maxSize`, `maxFiles`, `onFiles`, `onReject`) + `FileUploadList` (`items`, `onRemove`, `onRetry`) | Upload chứng từ, chứng từ mẫu của Skill |
| `Progress` (`tone`, `value={null}` = không rõ tiến độ) | Tiến độ xử lý |
| `Avatar`, `AvatarGroup` | Người dùng, người duyệt |
| `Switch` (`label`, `description`) | Bật/tắt cấu hình |
| `Breadcrumb` (`items`, `linkAs`, `maxItems`) | Đường dẫn đầu trang |
| `Combobox` (`options`, `multiple`, `clearable`, `maxResults` (mặc định 100), `onSearchChange` + `loading` cho tìm phía server); hàm `buildSearchIndex`/`searchOptions`/`foldVietnamese` | Chọn có tìm kiếm; **lọc không dấu tiếng Việt** ("hai phong" → Hải Phòng). Danh sách dài (đã thử 20.000 mục, lọc < 1 ms): chỉ hiện `maxResults` kết quả đầu + dòng "còn n kết quả – gõ thêm để thu hẹp"; không cuộn ảo. Trên ~100.000 mục → tìm phía server |
| `DatePicker`, `DateRangePicker` (giá trị ISO `YYYY-MM-DD`, `min`/`max`) | Ngày nghiệp vụ; hiển thị dd/MM/yyyy (vi) hoặc MM/dd/yyyy (en); không lệch múi giờ. Cả hai **gõ tay được**; DateRangePicker có 2 ô Từ/Đến, báo lỗi sai định dạng, ngoài `min`/`max`, Từ > Đến; đồng bộ hai chiều với lịch. Trong `Field`, cả hai ô đều đọc kèm nhãn Field |

## 4b. Đa ngôn ngữ (VI/EN)

- Bọc gốc app bằng `<UiLocaleProvider locale={appearance.locale}>`. Mọi nhãn của `@kb/ui` (nút Đóng, aria-label, placeholder, trạng thái…) tự đổi theo ngôn ngữ; prop `labels` vẫn ghi đè từng nhãn.
- Component mới khai báo nhãn bằng `useMessages({ vi: {...}, en: {...} }, labels)` – đủ cả hai ngôn ngữ.
- Nội dung nghiệp vụ của app (tên menu, dữ liệu) do app tự dịch (next-intl), không nằm trong `@kb/ui`.

## 5. Quy tắc (máy kiểm tra – `pnpm lint`)

| Mã lỗi | Cấm | Phạm vi |
|---|---|---|
| `raw-hex`, `raw-color-fn` | Mã màu `#…`, `rgb()`, `oklch()`… | Mọi nơi trừ `tokens.css` và `packages/ui/src/theme/` |
| `tw-palette` | `bg-blue-500`, `text-white`… | Mọi nơi |
| `arbitrary-color` | `bg-[#fff]`, `bg-[var(--kb-…)]` | Mọi nơi |
| `dark-variant` | `dark:` | Mọi nơi (token tự đổi theo chế độ) |
| `inline-color` | `style={{ color: … }}` | Mọi nơi |
| `apps-arbitrary-value` | `w-[437px]`, `mt-[13px]` | `apps/*` |
| `apps-inline-style` | `style={{…}}` | `apps/*` |
| `apps-raw-control` | `<button>`, `<input>`, `<select>`, `<textarea>` | `apps/*` |
| `apps-radix-direct` / depcruise `apps-ui-via-public-api` | Import Radix hoặc ruột `@kb/ui` | `apps/*` |

Thoát hiểm (rất hiếm, reviewer phải đồng ý): comment `kb-allow-raw: <lý do cụ thể>` trên cùng dòng hoặc dòng ngay trên.

**Thiếu thứ gì thì thêm vào `@kb/ui` (skill `adding-ui-component`), không vá trong app.**

## 6. Không được làm (máy chưa bắt hết – review)

- Đặt tên màu theo cảm quan (`text-green`) – dùng nghĩa (`text-success-subtle-fg`).
- Truyền nghĩa chỉ bằng màu – luôn có chữ hoặc icon kèm nhãn.
- Viết chuỗi giao diện cứng trong `@kb/ui` mà không cho truyền nhãn qua props (cần cho đa ngôn ngữ).
- Ghép class động kiểu `` `grid-cols-${n}` `` – Tailwind không quét được; dùng bảng map tĩnh như `Grid`.
