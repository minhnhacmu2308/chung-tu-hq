# ADR 0017 – Thông báo realtime qua SSE + Redis pub/sub; thông báo máy tính bằng Notification API; Web Push để sau

- Trạng thái: Chấp nhận
- Ngày: 2026-11-16

## Bối cảnh

Thông báo (phân luồng, bị từ chối, thông quan, đọc chứng từ xong…) được ghi bảng `notifications` từ cả worker lẫn web qua
`createNotifier`. Trước đây huy hiệu chuông chỉ cập nhật khi tải lại query – người khai không biết tờ khai vừa có kết quả Hải quan nếu
không bấm chuông, nhất là khi đang ở tab khác. Hạ tầng sẵn có: Redis (ioredis), route SSE `/api/dossiers/:id/events` (`sseResponse`),
production sau 1Panel OpenResty (nginx).

## Quyết định

- **Một chiều, SSE** (không WebSocket): server chỉ cần đẩy; EventSource tự nối lại, đi qua proxy HTTP thường, dùng cookie phiên có sẵn.
- **Đẩy sau commit:** `createNotifier` ghi các dòng trong transaction, transaction xong mới `NotificationPublisher.publish` một sự kiện mỗi
  người nhận vào **một kênh Redis `kb:notify`** (`NOTIFICATION_CHANNEL`). Payload chỉ `{id, orgId, userId, category, title, body, href, at}`
  (`NotificationEventSchema`, `@kb/contracts`) – không bí mật. Đẩy **không await** và mọi lỗi chỉ ghi log `warn`: Redis dùng
  `maxRetriesPerRequest: null` nên khi mất kết nối PUBLISH chờ mãi – không được giữ job/request; thông báo vẫn nằm trong DB.
  Port `NotificationPublisher` (`shared/notifier.ts`, có `noopNotificationPublisher` cho test); hiện thực `RedisNotificationPublisher`.
- **Một kết nối SUBSCRIBE mỗi tiến trình web** (`createNotificationHub(() => redis.duplicate())`, `container.notificationHub`), phát lại
  trong tiến trình cho các luồng SSE – không mở một kết nối Redis cho mỗi trình duyệt.
- **Route `GET /api/notifications/stream`** (runtime nodejs, dynamic): `requireSession` → `sseResponse` với `retry: 5000`, heartbeat
  `: ping` 25 giây, header `Cache-Control: no-cache, no-transform`, `Connection: keep-alive`, **`X-Accel-Buffering: no`** (nginx/OpenResty
  tắt đệm theo header này – không cần sửa cấu hình proxy). Mỗi message đi qua `notificationEventFor(ctx, raw)` (thuần, có test): parse Zod,
  chỉ chuyển sự kiện có `userId` = người đăng nhập **và** `orgId` = doanh nghiệp của phiên. Đóng luồng khi `req.signal` abort.
- **Giao diện:** `useNotificationStream` gắn một lần trong `AppShell`: có sự kiện → `invalidateQueries(sessionKeys.notifications)` (panel +
  huy hiệu) + toast (nút "Mở" → `router.push(href)`). Lỗi 3 lần liên tiếp chưa nối lại được, hoặc trình duyệt bỏ hẳn luồng (401, 502 khi
  deploy – `readyState` CLOSED) → huy hiệu poll 60 giây + tải lại khi quay về tab; nối lại được thì thôi poll. Chế độ mock: `subscribe`
  giả + nút "Gửi thông báo thử" trong cài đặt thông báo (chỉ mock) để demo.
- **Thông báo trên máy tính (Notification API)** khi trang đang mở ở một tab/cửa sổ nào đó: nút bánh răng trong panel Thông báo → bật
  (`Notification.requestPermission()` chỉ khi người dùng bấm), trạng thái đã bật / bị chặn (kèm hướng dẫn mở quyền) / không hỗ trợ,
  phạm vi "Chỉ kết quả Hải quan" (mặc định, nhóm `CUSTOMS`) | "Mọi thông báo" | "Tắt" lưu **theo trình duyệt** (`localStorage`
  `kb-desktop-notifications`). Chỉ hiện khi đã cho phép **và** trang không được nhìn (`document.hidden` hoặc `!document.hasFocus()`) –
  đang nhìn thì chỉ toast. `tag = id` nên nhiều tab cùng mở chỉ còn một thông báo; icon là logo doanh nghiệp (`orgLogoSrc`) hoặc
  `/icon.svg`; bấm → focus cửa sổ + mở `href`.

## Hệ quả

- Số kết nối SSE đang mở: gauge `khaibao_notification_stream_clients` (mỗi tiến trình web).
- Nhiều bản web: mỗi bản một kết nối SUBSCRIBE; sự kiện đến mọi bản, bản nào có luồng của người nhận thì chuyển – không cần sticky session.
- Thông báo ghi thẳng bằng repo (không qua `Notifier`: chứng thư sắp hết hạn, đăng ký, duyệt tham gia, chuyển quyền sở hữu, thông báo
  hệ thống của Quản trị) **chưa đẩy realtime** – vẫn hiện khi tải lại / poll. Muốn đẩy: chuyển sang `Notifier` hoặc gọi publisher sau commit.
- Mỗi tab mở một EventSource (HTTP/1.1 giới hạn ~6 kết nối/host – qua HTTPS + HTTP/2 của OpenResty thì không đáng kể).
- Sự kiện phát lúc không có tab nào mở thì mất (pub/sub không lưu) – người dùng vẫn thấy trong panel/huy hiệu khi mở lại.

## Để sau: Web Push

Thông báo khi **không** có tab nào mở cần Service Worker + Push API + khóa VAPID + bảng đăng ký theo thiết bị + gửi qua dịch vụ push của
trình duyệt. Chưa làm vì: người khai thường để trang mở cả ngày; cần quản lý đăng ký/hết hạn và xin quyền thêm. Khi làm: tái dùng
`NotificationPublisher` (thêm hiện thực gửi Web Push trong worker) và cùng tùy chọn phạm vi.
