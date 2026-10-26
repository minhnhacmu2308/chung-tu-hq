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
| Bo góc | `rounded-sm/md/lg/full` | Theo tùy chọn Bo góc (mặc định 6/10/14px) |
| Bóng | `shadow-sm/md/lg` | Nhiều lớp mỏng, ngả màu nền – thẻ/nút dùng `sm`, lớp nổi (menu, dialog, toast) dùng `lg` |
| Chuyển động | `motion-safe:animate-fade-in / pop-in / slide-in-right / slide-up` | Hiệu ứng vào của lớp nổi. **Luôn kèm `motion-safe:`**. Hover/focus của phần tử tương tác đã có transition 150ms mặc định ở lớp base |
| Chữ | `font-sans`, `font-mono` | App tải webfont bằng `next/font` và gắn biến `--kb-webfont-*` lên `<html>`. Số mặc định `tabular-nums`; tiêu đề `text-wrap: balance` |
| Khoảng cách | Thang Tailwind `p-1…p-12`, `gap-*`, `h-*` | Co giãn theo Mật độ (`--spacing`) |

Bảng màu mặc định của Tailwind (`blue-500`, `gray-100`…) **đã bị tắt**.

## 3. Tùy biến giao diện (theo ảnh cấu hình sản phẩm)

| Tùy chọn | Cơ chế | Ai đặt |
|---|---|---|
| Ngôn ngữ Tiếng Việt / English / 中文 (`vi`/`en`/`zh`) | `lang` + `<UiLocaleProvider>` (xem §4b) | Người dùng |
| Giao diện Sáng / Tối / Theo hệ thống | `data-theme` + `light-dark()` | Người dùng |
| Hiệu ứng con trỏ | `data-cursor-effect` + component `<CursorEffect />` (app gắn khi bật; chỉ chuột thật, tắt khi `prefers-reduced-motion`) | Người dùng |
| Mô tả trang | `data-page-description` → ẩn `[data-slot=page-description]` | Người dùng |
| Nền trang Phẳng / Aurora / Chuyển màu / Loang màu | `data-backdrop` – pha màu chính với màu phụ | Doanh nghiệp (có thể khóa) |
| Nền menu Mặc định / Pha nhạt / Pha đậm / Hình nền | `data-menu-style` + `data-menu-pattern` (Sóng / Chấm / Lưới / ảnh tải lên) → CSS trên `[data-slot=app-menu]` của `Sidebar`. Pha đậm đổi token chữ trong menu sang trắng; hình nền có lớp phủ bề mặt (họa tiết 70%, ảnh tải lên 80%) để chữ đủ tương phản | Người dùng |
| Vị trí menu Trái / Trên / Phải | `data-menu-position` → `--kb-shell-top`; app truyền `position` cho `Sidebar`. Ô chọn có hình mô phỏng bố cục | Người dùng |
| Mật độ Gọn / Chuẩn / Thoáng | `data-density` → `--spacing` | Người dùng |
| Dải xám Slate / Gray | `data-gray` → `--kb-gray-*` | Doanh nghiệp (có thể khóa) |
| Màu chính (thương hiệu) | `brandThemeCss()` trong `appearanceCss()` | Doanh nghiệp (có thể khóa) |
| Chất liệu khung Đặc / Kính mờ | `data-surface` → CSS lên `[data-glass]` (Card, Dialog + DialogFooter, AssistantPanel, DropdownMenu, Popover) và menu chính kiểu Mặc định: nền bề mặt ~55% + `backdrop-filter: blur`. Nút chính và nút phụ (`Button`, `data-glass-button`) cũng thành kính; nút xóa và bảng, ô nhập giữ nền đặc. Tự về nền đặc khi trình duyệt không hỗ trợ hoặc hệ điều hành bật giảm trong suốt / tăng tương phản. Component khung mới nên gắn `data-glass` | Người dùng |
| Màu phụ | `--kb-color-accent` trong `appearanceCss()`; chỉ để pha nền, không dùng cho chữ | Doanh nghiệp (có thể khóa) |
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
| `Button` (`primary/secondary/ghost/danger/link`, `sm/md/lg/icon/icon-sm`, `loading`, `asChild`) | Mọi nút. `asChild` để bọc `<Link>` |
| `Field` + `Input` / `Textarea` / `Select` / `Checkbox` | Mọi ô nhập. Field tự gắn nhãn, gợi ý, lỗi, `aria-*`. `Select` và `Checkbox` vẫn là control gốc của trình duyệt nhưng tự vẽ mũi tên / ô đánh dấu (utility `kb-checkbox`) để đồng bộ giữa các hệ điều hành. `orientation="horizontal"`: nhãn bên trái (2/5), ô bên phải khi vùng nội dung từ mốc `cq-md` – cho form dày ô như tờ khai. `framed`: khung **nền dịu, không viền**, nhãn nhỏ trên cùng (ô đứng riêng của form tờ khai – ô nhập bên trong đã có viền, không bọc thêm viền thành hai lớp), `labelAction` đặt nút (ⓘ hướng dẫn, `Button size="icon-sm"`) ngay sau nhãn. `FieldFrame legend` (+ `legendAction`): khung viền, tên trên đường viền cho **nhóm nhiều ô** / nhóm lặp; `variant="panel"` = khung nền như `framed` cho một ô đứng riêng |
| `Card` (`Header/Title/Description/Content/Footer`) | Khối nội dung |
| `Grid` (`cols={{ base:1, md:2, lg:4 }}`), `Stack` | Bố cục. Không tự viết `grid-cols-*` rời rạc. Mốc cột của `Grid` đo theo **vùng nội dung** (container query, biến thể `cq-sm/md/lg/xl`), không theo màn hình: panel neo bên phải hay popup hẹp thì thẻ tự xuống hàng. Cần tổ tiên `@container` – đã có ở `<main>` các shell, trang đăng nhập và thân `DialogContent` |
| `PageHeader` | Tiêu đề + mô tả + hành động của mỗi trang |
| `Badge`, `StatusBadge` | Nhãn. **Trạng thái nghiệp vụ luôn dùng `StatusBadge`** (PASS/WARN/FAIL, CROSS_CHECKED, CONFLICT…, luồng xanh/vàng/đỏ) |
| `Alert` | Thông báo trong trang. Tự kèm icon theo tông (không truyền nghĩa chỉ bằng màu) |
| `BrandMark` (`small`, `decorative`) | Ký hiệu logo KhaiBáo AI (tờ khai có góc giấy thành mũi tên gửi đi), vẽ bằng `currentColor`. `small` cho cỡ ≤ 24 px; `decorative` khi đứng cạnh tên viết bằng chữ. Bộ file gốc + quy tắc dùng: `docs/brand/` |
| `StatCard` (`label`, `value`, `hint`, `hintTone`, `icon`, `tone`, `loading`) | Thẻ chỉ số (KPI) dùng thống nhất ở mọi màn tổng quan. `value` là `number` → chạy đếm; chuỗi đã định dạng → hiển thị nguyên văn. Không tự dựng KPI bằng `Card` |
| `IconTile` (`icon`, `tone`, `size` sm/md/lg) | Ô vuông nền dịu chứa icon ở đầu thẻ, đầu dòng danh sách (StatCard dùng bên trong). Chỉ trang trí (`aria-hidden`) – nghĩa nằm ở chữ bên cạnh. Không tự ghép `span` + `bg-*-subtle` |
| `FormSection` (`title`, `description`) | Một nhóm trường của form dài: màn rộng tiêu đề/mô tả bên trái, ô nhập bên phải; tự kẻ đường ngăn giữa các nhóm. Form từ ~5 trường trở lên nên chia nhóm |
| `Skeleton`, `Spinner`, `EmptyState` | Trạng thái tải / trống. `EmptyState` không có `icon` tự hiện hình minh họa "trống"; `illustration="no-results" \| "not-found" \| "error"` cho không có kết quả / 404 / lỗi. `DataTable` trống tự có hình |
| `Illustration` | Hình minh họa SVG theo token (`empty`, `no-results`, `not-found`, `error`; `size` sm/md/lg), luôn `aria-hidden` |
| **Loading – chọn theo tình huống** | |
| `Spinner` (`sm/md/lg`) | Chỗ nhỏ: trong nút, cạnh một dòng chữ |
| `Loader` (`sm/md/lg`) | Biểu tượng tải mang thương hiệu (logo + vòng xoay): tải cả khối / cả màn |
| `LoadingDots` | Ba chấm nhún: AI đang soạn câu trả lời / đang xử lý |
| `LoadingState` (`title`, `description`) | CHƯA biết dáng nội dung sắp hiện (chờ AI, chờ Hải quan). Luôn nói rõ đang làm gì |
| `LoadingOverlay` (`loading`, `label`) | Tải lại / đang lưu trên nội dung ĐÃ có: giữ nguyên bố cục, làm mờ, chặn thao tác (`inert`) |
| `SkeletonText` / `SkeletonStats` / `SkeletonCard` / `SkeletonTable` / `SkeletonForm` / `SkeletonList` | ĐÃ biết dáng nội dung: khung tải đúng dáng để trang không nhảy. Không tự ghép `Skeleton className="h-80"` |
| `PageLoading` (`variant`: dashboard/table/form/detail) | Cả trang: `loading.tsx` của route và lúc tải dữ liệu chính của màn |
| `RowActions` (`rowLabel`, `actions`: id/label/icon/onSelect/tone/disabled/quick) | Thao tác trên một dòng: icon hiện khi rê chuột hoặc Tab vào dòng (cha phải có class `group` – dòng `DataTable` có sẵn), kèm nút "…" LUÔN chứa đủ mọi thao tác cho cảm ứng. Trong `DataTable` (`rowActions`) không chiếm cột: cả cụm nổi đè cuối dòng (nền + viền + bóng) khi rê chuột/Tab/menu mở, dính mép phải khi bảng cuộn ngang; cảm ứng chỉ hiện "…". Không tự dựng menu "…" trong app |
| `Grid` / `Stack` prop `stagger` | Phần tử con lần lượt trồi lên khi khối xuất hiện (thẻ KPI, danh sách). Không lạm dụng: một màn chỉ nên có 1–2 khối |
| `CountUp` (`value`, `duration`) | Số ĐẾM nguyên chạy từ 0 lên (KPI). **Không dùng cho tiền/trị giá** (Decimal hiển thị nguyên văn). Trình đọc màn hình nhận giá trị cuối |
| `AiBackdrop`, `AiScanCard` (`title`, `fields`) | Trang trí "AI" cho màn đăng nhập/giới thiệu: nền mạng tín hiệu + minh họa tia quét đọc chứng từ. `aria-hidden`, màu theo token, tắt khi giảm chuyển động |
| `Tabs` | Tab |
| `Dialog` (`presentation` / `defaultPresentation` / `onPresentationChange`) + `DialogContent` (`icon` **bắt buộc**, `size`, `tone: danger|warning` – icon trong ô màu + vạch màu đỉnh popup, nút chuyển trên header) + `DialogFooter` (dính đáy, có khoảng thở với ô cuối, nội dung cuộn mờ dần phía trên) | Popup. Cửa sổ = phủ nền, giữ focus, khóa cuộn. Panel bên phải = **drawer** trượt từ phải vào, cao hết màn hình, **nằm đè lên trang** (trang không bị đẩy/co lại), **không chặn trang** (thao tác song song); **kéo mép trái để đổi độ rộng** (phím ←/→, nhấp đúp về mặc định; nhớ theo `size` ở localStorage `kb-drawer-width:<size>`). Đổi qua lại **không mất dữ liệu đang nhập** |
| `ConfirmDialog` (`open`, `onOpenChange`, `title`, `icon`, `tone`: danger/warning, `description`, `subject`, `children` = hậu quả, `irreversible`, `confirmLabel`, `onConfirm`, `loading`, `labels.keep`) | **Mọi hộp xác nhận xóa / hủy / ngắt kết nối** (thao tác khó quay lại). Đỉnh popup vạch màu + icon trong ô màu, đối tượng bị ảnh hưởng in đậm, hậu quả trong `Alert` cùng tông (`irreversible` → tiêu đề "Không thể hoàn tác"), focus sẵn ở "Giữ lại", đang chạy thì không đóng được. Không có nút chuyển panel (hộp xác nhận luôn là cửa sổ). Không tự ghép `Dialog` + nút đỏ cho việc này |
| `AssistantPanel` (`floating/docked/fullscreen`), `AssistantLauncher` (`state`), `AssistantWelcome`, `SuggestionChips`, `ChatMessage`, `ChatComposer` | Trợ lý AI. Nút mở là linh vật `RobotAvatar`; app truyền `state="thinking"` khi trợ lý đang trả lời |
| `RobotAvatar` (`state`: idle/thinking/searching/listening/speaking/working/happy/error/sleeping, `size`, `interactive`, `antenna`) | Đầu robot hoạt hình (thư viện `robot-heads`, canvas). Màu vỏ/màn hình/viền đọc từ token `primary`/`primary-fg`/`primary-subtle` nên tự đổi theo theme và màu thương hiệu; chỉ vẽ phía client, `aria-hidden` |
| `RadioGroup` | Chọn một trong danh sách lựa chọn **dọc**, nhãn dài, có mô tả từng lựa chọn (vd câu hỏi của AI phân loại HS). `fieldset` + radio gốc (phím mũi tên tự đúng), utility `kb-radio`. `orientation="horizontal"`: lựa chọn ngắn xếp một hàng, tự xuống dòng khi hẹp (vd Nhóm loại hình trong form tờ khai – có thể chưa chọn). `framed`: khung nền như `Field framed` (+ `legendAction`). Lựa chọn ngắn, ít (2–4), luôn có giá trị, đặt cạnh nhãn (thanh cài đặt) → `SegmentedControl` |
| `SegmentedControl`, `ColorSwatchPicker`, `AppearancePanel` | Tùy chọn dạng phân đoạn / chọn màu / bảng cấu hình giao diện. Trong `AppearancePanel` mỗi lựa chọn là một thẻ có **hình mô phỏng** (sáng/tối, vị trí menu, mật độ, cỡ chữ, bo góc, nền, dải xám…); thêm tùy chọn mới thì thêm cả hình mô phỏng |
| `Sidebar` (`position`: left/right/top, `items` có nhóm con, `collapsed` / `onCollapsedChange`, `linkAs={Link}`, `mobileOpen` / `onMobileOpenChange`), `SidebarMobileTrigger`, `SidebarFooterButton`, `SidebarUser`, `BrandDot` | Menu chính co giãn: mở rộng ↔ thu gọn (cột icon + tooltip). `position="top"` = thanh ngang dính đầu trang (nhóm con thành menu xổ, chân menu thành cụm icon; phần tử dính trong trang dùng `top-shell` để nằm dưới thanh). Màn nhỏ: ngăn kéo mở bằng nút ☰. `SidebarUser`/`SidebarFooterButton` làm trigger được cho `DropdownMenu`/`Popover` (asChild) |
| `Stepper` (`steps`, `currentId`, `viewingId`, `onStepClick`, `action`) | Thanh các bước của hồ sơ; bước đã qua bấm được để xem lại; `viewingId` = bước đang xem lại (bước hiện tại khi đó bấm được để quay về); `action` để đặt nút "Xem cây quy trình". Màn nhỏ gọn thành "Bước 3/6 · …" |
| `StepProgress` (`steps`, `currentId`, `state`: `active`/`complete`/`stopped`) | Tiến độ bước gọn cho ô bảng và thẻ: tên bước + "3/6" + thanh chia đoạn (bước hiện tại tô nửa). `complete` → "Đã hoàn tất" màu xanh; `stopped` (hồ sơ hủy) → xám. Dùng ở danh sách hồ sơ |
| `WorkflowDiagram` (`nodes`: start/end/step/decision + `status`; `edges` có `label`) | Sơ đồ cây quy trình: tự bố cục (dagre), nhánh tách làn, đường đã đi tô màu, bước hiện tại gắn nhãn, phóng to/thu nhỏ. Thường đặt trong `DialogContent size="lg"` |
| `DocumentViewer` (`label`, `pages`, `pageAspects`, `pageInset`, `toolbarEnd`, `regions` {id, page, x/y/w/h theo %, `label`, `content`}, `highlightId`, `onRegionClick`, `page`/`onPageChange`, `onAreaSelect`) | Xem chứng từ gốc: chuyển trang, phóng to/thu nhỏ/vừa khung, tô vùng của một trường (tự sang trang chứa vùng, cuộn tới). Vị trí vùng truyền qua biến CSS cục bộ. Trang là ảnh trang PDF thật (`pageAspects` = tỉ lệ rộng/cao từng trang, `pageInset={false}`), hoặc trang dựng lại từ dữ liệu (`content` in chữ vào vùng – bản mock). `onAreaSelect` bật chế độ chọn vùng (kéo chuột vẽ khung, con trỏ chữ thập, vùng của trường tạm ẩn) → trả `DocumentArea` theo % – dùng cho "chỉ vị trí giá trị trên file"; luôn kèm cách nhập bằng bàn phím |
| `DocumentFileViewer` (`label`, `src`, `type`: `pdf`/`image`, `fileName`) | Xem **file gốc** qua trình xem PDF của trình duyệt (lật trang, phóng to, tìm chữ), ảnh vừa khung; nút "Mở ở tab mới". Không tô được vùng – màn OCR chỉ dùng làm dự phòng khi không dựng được trang PDF trong trang |
| `DataTable` (`columns` qua `createDataTableColumnHelper`, `selectable`, `rowActions`, `onRowClick`, `pagination`, `loading`, `empty*`, `searchable`, `columnToggle`, `resizable`, `toolbarActions`, `selectionActions` (thanh thao tác hàng loạt nổi giữa đáy màn hình khi chọn ≥ 1 dòng: "Đã chọn n" + nút + Bỏ chọn), `renderCard` (+ `view`/`defaultView`/`onViewChange`, `viewStorageKey`); điều khiển được: `columnVisibility`, `columnSizing`; `meta: { align, wrap, filter: "text"|"select", filterOptions, label, hideable, resizable }`; độ rộng qua `size`/`minSize`/`maxSize` của cột) | Mọi bảng danh sách. Sắp xếp, chọn dòng, phân trang client/server, header dính. Tìm toàn bảng + lọc theo cột **không dấu** (ô lọc nằm trong hộp mở từ **nút phễu cạnh ô tìm kiếm**, nút hiện số bộ lọc đang bật – không có hàng ô lọc dưới tiêu đề); ẩn/hiện cột; kéo đổi độ rộng (chuột, mũi tên ←/→, nhấp đúp để về mặc định). Mặc định không xuống dòng + cuộn ngang; cột dài bật `meta.wrap`. Lưu ý: tìm/lọc chạy trên dữ liệu đã tải (phân trang server chưa gửi bộ lọc lên server); tìm theo giá trị gốc, không theo nhãn hiển thị. **Dạng thẻ**: truyền `renderCard(row, parts)` (thường trả `RecordCard` với `parts.select` + `parts.actions`) → thanh công cụ có nút Bảng ↔ Thẻ; thẻ dùng chung tìm kiếm, lọc cột (cùng nút phễu), sắp xếp (chọn cột + đổi chiều), chọn, phân trang; `viewStorageKey` nhớ lựa chọn trong trình duyệt |
| `RecordCard` (`title`, `subtitle`, `leading`, `status`, `fields: {label, value, wide?}[]`, `footer`, `select`, `actions`, `children`, `tone`, `pattern: dots\|grid\|diagonal`, `art`, `titleLines: 1\|2`) | Thẻ một bản ghi cho danh sách dạng thẻ (đầu thẻ · lưới nhãn–giá trị · chân thẻ). Có `tone` → đầu thẻ nền dịu + họa tiết mờ dần + `art` (icon lớn chìm, vd phương thức vận chuyển) – chỉ trang trí. Danh sách thẻ nên truyền `titleLines` (cắt tiêu đề + giữ đủ chỗ, trạng thái xuống dòng riêng) để đầu thẻ cùng hàng cao bằng nhau. Lưới thẻ: 1 / 2 / 3 cột theo bề rộng vùng nội dung. Dùng trong `DataTable renderCard`; viền đổi theo rê chuột / đang chọn của thẻ bao |
| `Pagination` | Phân trang dùng riêng (DataTable đã tích hợp sẵn) |
| `Toaster` (đặt 1 lần ở gốc) + `toast({ tone, title, description, action })` | Thông báo nổi sau thao tác: lưu, gửi, lỗi mạng. danger/warning đọc ngay cho trình đọc màn hình |
| `Tooltip` | Gợi ý ngắn cho nút icon. Không đặt thao tác trong tooltip |
| `DropdownMenu*` (Item có `icon`, `shortcut`, `tone="danger"`; Checkbox/Radio/Sub) | Menu người dùng, nút "…" trên dòng bảng |
| `Popover*` (`showClose`) | Bộ lọc, nội dung phụ có tương tác |
| `FileDropzone` (`accept`, `maxSize`, `maxFiles`, `onFiles`, `onReject`, `size`: `md` vùng lớn cho cả bộ / `sm` một dòng gọn trong ô từng loại) + `FileUploadList` (`items`, `onRemove`, `onRetry`) | Upload chứng từ, chứng từ mẫu của Skill |
| `Progress` (`tone`, `value={null}` = không rõ tiến độ) | Tiến độ xử lý |
| `Avatar`, `AvatarGroup` | Người dùng, người duyệt |
| `Switch` (`label`, `description`) | Bật/tắt cấu hình |
| `Breadcrumb` (`items`, `linkAs`, `maxItems`) | Đường dẫn đầu trang |
| `Disclosure` (`title`, `meta`, `actions`, `defaultOpen`, `open`/`onOpenChange`) | Khối thu gọn/mở rộng: giấu phần ít dùng (thông tin phụ, lịch sử, từng dòng hàng). `meta` (số đếm, huy hiệu) nằm trong nút mở; `actions` (nút phụ) nằm ngoài nút mở |
| `PaperStack` / `PaperSheet` (`page`, `total`, `header`, `watermark`, `id`) / `PaperColumns` / `PaperField` (`label`, `value`, `state`, `compareTo`, `selected`, `onSelect`, `ariaLabel`, `span`, `align`, `ref` + thuộc tính DOM) | Trang giấy A4 mô phỏng bản in tờ khai VNACCS. `PaperSheet` là container `paper`: `PaperColumns` (hai vùng cạnh nhau của mẫu) chia hai cột theo bề rộng trang (`paper-wide`), một cột khi trang hẹp, luôn hai cột khi in. `PaperField` nhận `ref` và thuộc tính DOM (làm đích `Tooltip asChild` được); `compareTo` đọc kèm tiền tố "ước tính". `PaperStack` là gốc in (`data-print-root`); `PaperSheet` là vùng có tên "Trang n / tổng", watermark `aria-hidden`; `PaperField` là ô (có `onSelect` thì là nút, `aria-pressed`) với trạng thái `error`/`missing`/`estimate`/`edited` + số cũ `compareTo` – các dấu hiệu trạng thái (`data-paper-mark`) bị ẩn khi in. Token `bg-paper` / `text-paper-fg` / `border-paper-rule`; khi in luôn đen trên trắng và theo đúng kiểu bản in VNACCS: không khung ô, nhãn và giá trị cùng dòng (giá trị chữ đơn cách, ô rộng ≥ 6 cột canh giá trị theo cột), chỉ kẻ ngang giữa các khối của trang (`data-paper-body`) và kẻ dọc giữa hai cột `PaperColumns`; trên màn hình giữ khung ô để bấm sửa. `label`/`value` chỉ là nội dung dòng chữ (phrasing content), không chứa phần tử tương tác (Abbreviation/button/link) vì ô có thể là `<button>`; `ariaLabel` là tên ô, đọc trước giá trị và trạng thái |
| `Abbreviation` (`short`, `full`) | Chữ viết tắt cho nhãn dài làm vỡ lưới form (vd "Mã PLHH"): gạch chân chấm, bấm / Enter mở khung tên đầy đủ. Đặt được trong nhãn `Field` – tên truy cập của ô nhập vẫn có tên đầy đủ (chữ ẩn trong nút) |
| `Combobox` (`options`, `multiple`, `clearable`, `expandable` (nút Mở rộng: khung tới 36rem, nhãn/mô tả xuống dòng đọc hết), `maxResults` (mặc định 100), `onSearchChange` + `loading` cho tìm phía server); hàm `buildSearchIndex`/`searchOptions`/`foldVietnamese` | Chọn có tìm kiếm; **lọc không dấu tiếng Việt** ("hai phong" → Hải Phòng). Danh sách dài (đã thử 20.000 mục, lọc < 1 ms): chỉ hiện `maxResults` kết quả đầu + dòng "còn n kết quả – gõ thêm để thu hẹp"; không cuộn ảo. Trên ~100.000 mục → tìm phía server |
| `DatePicker`, `DateRangePicker` (giá trị ISO `YYYY-MM-DD`, `min`/`max`) | Ngày nghiệp vụ; hiển thị dd/MM/yyyy (vi), MM/dd/yyyy (en) hoặc yyyy/MM/dd (zh, gõ được cả `2024年12月5日`); tuần bắt đầu thứ Hai (vi, zh) / Chủ nhật (en); không lệch múi giờ. Cả hai **gõ tay được**; DateRangePicker có 2 ô Từ/Đến, báo lỗi sai định dạng, ngoài `min`/`max`, Từ > Đến; đồng bộ hai chiều với lịch. Trong `Field`, cả hai ô đều đọc kèm nhãn Field |

## 4b. Đa ngôn ngữ (VI / EN / ZH)

Giao diện có 3 ngôn ngữ: **tiếng Việt** (`vi`, mặc định), **tiếng Anh** (`en`), **tiếng Trung giản thể** (`zh`). Danh sách nằm ở `UI_LOCALES` (`packages/ui/src/lib/i18n.tsx`); thêm ngôn ngữ thứ tư → thêm vào đó, TypeScript chỉ ra mọi bộ nhãn còn thiếu.

- Bọc gốc app bằng `<UiLocaleProvider locale={appearance.locale}>`. Mọi nhãn của `@kb/ui` (nút Đóng, aria-label, placeholder, `StatusBadge`, định dạng ngày của `DatePicker`…) tự đổi theo ngôn ngữ; prop `labels` vẫn ghi đè từng nhãn. Đổi ngôn ngữ thì app dựng lại cả cây (key theo locale).
- Ô chọn Ngôn ngữ trong `AppearancePanel` ghi tên mỗi ngôn ngữ bằng chính ngôn ngữ đó ("Tiếng Việt", "English", "中文") – không dịch, để người không đọc được ngôn ngữ đang hiện vẫn tìm ra.

| API | Dùng khi |
|---|---|
| `defineMessages({ vi: {...}, en: {...}, zh: {...} })` | Khai báo bộ nhãn. Khóa suy từ chính bộ nhãn; thiếu ngôn ngữ hoặc thiếu khóa ở một ngôn ngữ là **lỗi TypeScript**. Trong `@kb/ui` dùng `{...} satisfies Messages<K>` cũng được |
| `useMessages(catalog, overrides?)` | Trong component: `const t = useMessages(M, labels)` → `t.save` |
| `fill(template, vars)` | Điền tham số: `fill(t.sent, { n })` với `"Đã gửi {n} nghiệp vụ"`. Không ghép chuỗi bằng `+` – thứ tự từ mỗi ngôn ngữ khác nhau |
| `pickMessages(catalog, locale)` | Hàm thuần (không phải component): nhận `locale: UiLocale`, nơi gọi truyền `useUiLocale()` |
| `useUiLocale()`, `intlLocale(locale)` | Lấy ngôn ngữ hiện tại; locale BCP-47 cho `Intl` (`vi-VN`/`en-US`/`zh-CN`) |
| `statusLabel(status, locale)` | Nhãn `StatusBadge` ngoài component (bộ lọc bảng, xuất file). `STATUS_META[s].label` chỉ là bản tiếng Việt |

```ts
// submit-step.messages.ts
import { defineMessages } from "@kb/ui";
export const SUBMIT_MESSAGES = defineMessages({
  vi: { title: "Khai báo Hải quan", sent: "Đã gửi {n} nghiệp vụ" },
  en: { title: "Customs filing", sent: "Sent {n} operations" },
  zh: { title: "海关申报", sent: "已发送 {n} 项业务" },
});
// submit-step.tsx
const t = useMessages(SUBMIT_MESSAGES);
<h2>{t.title}</h2> <p>{fill(t.sent, { n })}</p>
```

**Quy ước file trong app:**
- `*.messages.ts` cạnh component (vd `submit-step.messages.ts`) hoặc `messages.ts` cho cả thư mục – chứa bộ nhãn `defineMessages`.
- `*.vi.ts` – nội dung **chỉ có tiếng Việt vì pháp lý** (nhãn trên bản in tờ khai VNACCS, chuỗi gửi Hải quan, regex khớp chữ trên chứng từ). Không dịch.
- Không dịch: dữ liệu nghiệp vụ, lỗi backend trả về, mã kỹ thuật (IDA, AMA, VNACCS, HS…). Comment code giữ tiếng Việt.
- Luật lint `apps-hardcoded-text` (§5) bắt chữ tiếng Việt có dấu viết cứng trong code app; dòng lẻ bắt buộc tiếng Việt thì đặt `// kb-allow-raw: <lý do>` ngay trên.

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
| `apps-row-menu` | Tự dựng menu "…" (`MoreHorizontal`) – thao tác trên dòng dùng `RowActions` | `apps/*` |
| `apps-dialog-toggle-off` | `allowPresentationToggle={false}` – popup phải giữ nút chuyển cửa sổ ↔ panel | `apps/*` |
| `apps-raw-table` | `<table>` tự viết – dùng `DataTable` / `PermissionMatrix` | `apps/*` |
| `apps-viewport-layout` | `sm:`/`md:`/`lg:`/`xl:`/`max-sm:` – bố cục theo màn hình. Dùng `Grid` hoặc `cq-sm/md/lg/xl:`, `cq-max-sm:` (theo vùng nội dung) | `apps/*` trừ `features/**/shell` |
| `apps-svg-selector` | `[&>svg]:…` tự chỉnh icon – dùng `leftIcon`/`rightIcon`, `IconTile`, `Badge icon` | `apps/*` |
| `apps-icon-tile` | Tự ghép ô icon `justify-center` + `bg-*-subtle` – dùng `IconTile` | `apps/*` |
| `apps-actions-column` | Cột thao tác tự dựng (`id: "actions"`, `sticky: "end"`) – truyền `rowActions` cho `DataTable` | `apps/*` |
| `apps-status-map` | Bảng `{ label, tone }` tự dựng cho trạng thái – dùng `StatusBadge` (thêm vào `STATUS_META` + nhãn EN); nhãn phụ không phải trạng thái ghi `kb-allow-raw` kèm lý do | `apps/*` |
| `apps-big-skeleton` | `<Skeleton className="h-64…">` nguyên khối – dùng `PageLoading` / `Skeleton*` đúng dáng | `apps/*` |
| `apps-hardcoded-text` | Chữ tiếng Việt có dấu viết cứng trong code (không tính comment) – đưa vào bộ nhãn `defineMessages` trong `*.messages.ts`, dùng `useMessages` (§4b) | `apps/web/src/{features,components,app,lib}` trừ `*.messages.ts`, `*.vi.ts`, test, `app/api`, `lib/server` |

Thoát hiểm (rất hiếm, reviewer phải đồng ý): comment `kb-allow-raw: <lý do cụ thể>` trên cùng dòng hoặc dòng ngay trên.

**Thiếu thứ gì thì thêm vào `@kb/ui` (skill `adding-ui-component`), không vá trong app.**

## 6. Không được làm (máy chưa bắt hết – review)

- Đặt tên màu theo cảm quan (`text-green`) – dùng nghĩa (`text-success-subtle-fg`).
- Truyền nghĩa chỉ bằng màu – luôn có chữ hoặc icon kèm nhãn.
- Viết chuỗi giao diện cứng trong `@kb/ui` mà không cho truyền nhãn qua props (cần cho đa ngôn ngữ).
- Ghép class động kiểu `` `grid-cols-${n}` `` – Tailwind không quét được; dùng bảng map tĩnh như `Grid`.
- Tự dựng lại thứ đã có component chuẩn: KPI (→ `StatCard`), nhóm form (→ `FormSection`), nhãn trạng thái nghiệp vụ (→ `StatusBadge`), báo lỗi tải (→ `LoadError`). Bảng tra đầy đủ: skill `building-frontend-feature`, mục "Cần gì → dùng gì".
- `useMutation` không có `onError` – thao tác thất bại trong im lặng. Mặc định dùng `toastMutationError`.
- Khai báo bảng trạng thái `{ label, tone }` trong feature – cùng một trạng thái sẽ lệch nhãn giữa các màn. Thêm vào `STATUS_META`.
- Chiều cao cứng cho nội dung trong `Dialog`, `top-0`/`top-4` cho phần tử dính – dùng `dialog-fill`, `top-shell` (cách mép 1rem) hoặc `top-shell-flush` (sát mép, cho thanh dính cần nền liền như thanh chọn nhóm trên mobile).
- Báo "xong" một thay đổi giao diện khi chưa mở trình duyệt thật (sáng + tối, desktop + mobile). Cách đo: skill `adding-ui-component`, mục "Kiểm tra bằng trình duyệt".
