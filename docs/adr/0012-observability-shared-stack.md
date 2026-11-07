# ADR 0012 – Quan sát hệ thống: cắm vào stack dùng chung của hscodepro, chỉ số chặn bằng token

- Trạng thái: Chấp nhận
- Ngày: 2026-11-07

## Bối cảnh

Production chạy một VPS dùng chung với hscodepro (`/opt/khaibao`, compose project `khaibao`, sau 1Panel). Trước đây KhaiBáo chỉ có log
JSON (`createLogger`) và `/api/health`. Không có số đo tốc độ, tỷ lệ lỗi, độ dài hàng đợi hay tình trạng gọi FPT.VNACCS, cũng không
có cảnh báo. Trên VPS đã có sẵn stack quan sát của hscodepro: Prometheus v3.12 trên mạng docker `hscodepro-observability` (không
Alertmanager, không remote-write), Loki 3.7 + Alloy thu log **mọi** container, cAdvisor, node-exporter và Grafana 13.2 (datasource
`hscodepro-prometheus`, `hscodepro-loki`).

## Quyết định

- **Dùng lại stack dùng chung**, không dựng Prometheus/Loki/Grafana riêng. Log không cần làm gì thêm, vì Alloy đã gắn nhãn
  `compose_project="khaibao"`.
- **KhaiBáo sở hữu file scrape và luật của mình.** Các file nằm trong repo (`ops/observability/prometheus/`), được chép vào
  `/opt/khaibao/observability/prometheus` và gắn read-only vào Prometheus. Prometheus nạp chúng qua `scrape_config_files` + `rule_files`
  (glob). Phía hscodepro chỉ sửa **một lần** (`ops/observability/hscodepro-prometheus.patch.md`). Sau đó KhaiBáo tự thêm job/luật mà
  không đụng repo của họ.
- **Chỉ số Prometheus trong app** bằng `prom-client`, gói trong `packages/core/src/observability` (export `@kb/core/observability`):
  - Tiền tố `khaibao_`, nhãn `service` (web|worker), nhãn ít giá trị (route mẫu, mã nghiệp vụ, tên queue; không id/orgId).
  - Registry một bản mỗi tiến trình, giữ trên `globalThis`. Web là một tiến trình `next start`, nên không cần gom nhiều worker.
  - Đây là hạ tầng cắt ngang giống log. Infrastructure, application và apps được gọi. Domain không được gọi (depcruise
    `domain-is-pure` đã chặn).
  - Điểm đo đặt ở chỗ hẹp nhất có sẵn: `route()` (HTTP), `FptRestClient.post()` (FPT), sự kiện Worker (job), `Queue.getJobCounts()`
    lúc scrape (độ dài hàng đợi), adapter Claude (lời gọi AI), `DrizzleUsageRecorder` (chi phí AI, chỉ khi dòng mới được ghi),
    `processOutbox()` (thông điệp Hải quan, tờ khai được chấp nhận).
- **Chặn truy cập bằng token:** web `GET /api/metrics`, worker `:METRICS_PORT/metrics` (mặc định 9464, không publish).
  - Phải gửi `Authorization: Bearer <METRICS_TOKEN>`. Token được so bằng `timingSafeEqual` trên SHA-256.
  - Không đặt `METRICS_TOKEN` → tắt hẳn: web 404, worker không mở cổng.
  - Token tạo trên máy chủ. Prometheus đọc token qua `credentials_file`. Không commit, không log.
  - `/api/metrics` không cần phiên đăng nhập. `proxy.ts` đã cho `/api/*` đi qua, còn route tự kiểm token.
- **Mạng:** web, worker và 2 exporter (postgres-exporter, redis-exporter, `ops/observability/compose.monitoring.yml`) gắn thêm mạng
  `hscodepro-observability`. Không publish cổng mới ra máy chủ. Exporter trỏ tới tên container (`khaibao-postgres-1`) để không nhầm với
  service cùng tên của project khác trên mạng dùng chung.
- **Cảnh báo Grafana-managed → Telegram.** Prometheus đánh giá luật trong `khaibao.rules.yml` (nhãn `project=khaibao`, `severity`,
  `runbook_url` về `docs/OBSERVABILITY.md`). Sau đó luật được import thành Grafana-managed rule và định tuyến theo `project=khaibao`.
  Sao lưu (không có chỉ số) dùng rule Loki trên log của container `backup`.

## Phương án đã loại

- **Stack riêng cho KhaiBáo:** tốn thêm 1–2 GB RAM trên VPS đã chung, thêm một Grafana nữa phải bảo trì. Log vẫn phải thu riêng.
- **Mở `/api/metrics` không chặn và chỉ dựa vào mạng nội bộ:** 1Panel chuyển tiếp mọi `/api/*` ra Internet. Chỉ số lộ tên route và
  khối lượng nghiệp vụ.
- **Gửi chỉ số bằng OTLP/remote-write:** Prometheus dùng chung không bật receiver. Mô hình pull đơn giản hơn với 1 web + 1 worker.
- **Nhãn theo doanh nghiệp (`orgId`):** số chuỗi thời gian tăng theo số khách và lộ thông tin khách trong hệ thống dùng chung. Điều tra
  theo doanh nghiệp làm bằng Loki (`| json | orgId=…`).

## Hệ quả

- Có dashboard `khaibao-overview` và 11 luật cảnh báo cho mục tiêu down, 5xx, p95, lỗi FPT, tồn hàng đợi, job hết lượt thử, RAM
  container, ổ đĩa, Postgres/Redis. Luật có unit test bằng `promtool test rules`.
- Phụ thuộc vào stack của hscodepro. Họ đổi tên mạng hoặc datasource uid thì phải sửa `compose.monitoring.yml` và dashboard. Prometheus
  của họ dừng thì KhaiBáo mất cảnh báo, nhưng app không bị ảnh hưởng.
- Chỉ số đếm theo tiến trình nên reset khi khởi động lại. Truy vấn dùng `rate()/increase()` sẽ tự bù. Chi phí AI trên dashboard chỉ để
  theo dõi, số tiền chuẩn vẫn là `usage_events` (Decimal).
- Thêm chỉ số mới: sửa `packages/core/src/observability/metrics.ts`, cập nhật bảng trong `docs/OBSERVABILITY.md` và dashboard/luật nếu cần.
