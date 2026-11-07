# Thay đổi một lần ở stack quan sát của hscodepro

KhaiBáo **không sửa job hay luật của hscodepro**. Chỉ cần Prometheus dùng chung nạp thêm file của KhaiBáo từ một thư mục
KhaiBáo sở hữu (`/opt/khaibao/observability/prometheus` trên VPS). Sau lần sửa này, KhaiBáo thêm/sửa job scrape và luật cảnh báo
bằng cách thay file trong thư mục đó rồi reload Prometheus. Không phải đụng lại repo hscodepro.

Prometheus v3 hỗ trợ `scrape_config_files` (glob). Khi đặt sai đường dẫn, Prometheus chỉ bỏ qua glob không khớp file nào, không dừng.
Lỗi cú pháp trong file KhaiBáo thì khác: lần reload bị từ chối và Prometheus giữ cấu hình cũ. Vì vậy luôn chạy `promtool check`
trước khi reload (README bước 6).

## 1. `prometheus.yml`

Đoạn dưới chỉ minh họa. Giữ nguyên mọi dòng hiện có và chỉ thêm các dòng `+`.

```diff
 global:
   scrape_interval: 15s
   evaluation_interval: 15s

 rule_files:
   - /etc/prometheus/rules/*.yml          # (luật hiện có của hscodepro – giữ nguyên, tên có thể khác)
+  - /etc/prometheus/khaibao/*.rules.yml  # KhaiBáo AI – ops/observability/prometheus/khaibao.rules.yml

+# KhaiBáo AI – job khaibao-web, khaibao-worker, khaibao-postgres, khaibao-redis (ops/observability/prometheus/khaibao.scrape.yml)
+scrape_config_files:
+  - /etc/prometheus/khaibao/*.scrape.yml

 scrape_configs:
   - job_name: prometheus
     ...
   - job_name: cadvisor
     ...
   - job_name: node-exporter
     ...
```

Nếu `prometheus.yml` chưa có khối `rule_files`, thêm cả khối:

```diff
+rule_files:
+  - /etc/prometheus/khaibao/*.rules.yml
```

## 2. Service `prometheus` trong compose của hscodepro

```diff
   prometheus:
     image: prom/prometheus:v3.12.0
     volumes:
       - ./prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro
       - prometheus_data:/prometheus
+      # KhaiBáo AI: file scrape + luật + token (đọc chỉ đọc). Thư mục do KhaiBáo quản lý trên VPS.
+      - /opt/khaibao/observability/prometheus:/etc/prometheus/khaibao:ro
     networks:
       - hscodepro-observability
```

Không cần thêm mạng: web, worker và exporter của KhaiBáo tự gắn vào `hscodepro-observability`
(`ops/observability/compose.monitoring.yml`).

## 3. Áp dụng

```bash
cd <thư mục compose observability của hscodepro>
docker compose up -d prometheus        # tạo lại container để nhận volume mới (mất vài giây dữ liệu scrape)
docker exec <prometheus-container> promtool check config /etc/prometheus/prometheus.yml
```

Về sau, khi chỉ sửa file trong `/opt/khaibao/observability/prometheus`, không phải tạo lại container. Reload là đủ:

```bash
docker exec <prometheus-container> kill -HUP 1
# hoặc, nếu Prometheus chạy với --web.enable-lifecycle:
# curl -X POST http://127.0.0.1:9090/-/reload
```

## Hoàn tác

Xóa 2 dòng `/etc/prometheus/khaibao/...` trong `prometheus.yml` và dòng volume, rồi `docker compose up -d prometheus`.
