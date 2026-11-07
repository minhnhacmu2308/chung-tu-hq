# Quan sát KhaiBáo AI trên stack dùng chung (hscodepro-observability)

KhaiBáo **không chạy Prometheus, Loki hay Grafana riêng**. Nó cắm vào stack sẵn có trên VPS của hscodepro:

| Thành phần | Có sẵn | KhaiBáo thêm |
|---|---|---|
| Prometheus v3.12 (mạng docker `hscodepro-observability`, không Alertmanager) | job `cadvisor`, `node-exporter` | job `khaibao-web`, `khaibao-worker`, `khaibao-postgres`, `khaibao-redis` + luật cảnh báo, nạp qua `scrape_config_files` / `rule_files` |
| Loki 3.7 + Alloy | đã thu log **mọi** container, nhãn `container`, `compose_project`, `compose_service` | không cần gì: log của KhaiBáo nằm ở `{compose_project="khaibao"}` |
| Grafana 13.2 (1Panel) | datasource `hscodepro-prometheus`, `hscodepro-loki` | dashboard `khaibao-overview`, cảnh báo Grafana-managed → Telegram |

Quyết định và lý do: `docs/adr/0012-observability-shared-stack.md`. Danh sách chỉ số, cách tra log và runbook từng cảnh báo:
`docs/OBSERVABILITY.md`.

## File trong thư mục này

| File | Đặt ở đâu trên VPS | Vai trò |
|---|---|---|
| `prometheus/khaibao.scrape.yml` | `/opt/khaibao/observability/prometheus/` | 4 job scrape (Bearer token đọc từ `metrics.token`) |
| `prometheus/khaibao.rules.yml` | `/opt/khaibao/observability/prometheus/` | 11 luật cảnh báo (nhãn `project=khaibao`) |
| `prometheus/khaibao.rules.test.yml` | (không cần chép) | unit test luật cho `promtool test rules` |
| `compose.monitoring.yml` | `/opt/khaibao/observability/` | postgres-exporter + redis-exporter, gắn web/worker vào mạng dùng chung |
| `grafana/khaibao-overview.json` | import trong Grafana | dashboard |
| `hscodepro-prometheus.patch.md` | sửa một lần ở repo/cấu hình hscodepro | cho Prometheus nạp thư mục của KhaiBáo |

Không file nào chứa bí mật. Token `metrics.token` chỉ tạo trên máy chủ.

## Cài đặt (một lần)

Ký hiệu: **[Bạn]** là bước bạn tự làm, vì nó cần quyền vào VPS, bí mật hoặc giao diện Grafana. Agent không chạm VPS và không đọc `.env`.
**[Đã làm]** là bước có sẵn trong code.

### 0. [Đã làm] Bản deploy phải có code chỉ số

Cần commit có `GET /api/metrics`, cổng chỉ số của worker và biến `METRICS_TOKEN`. Redeploy theo quy trình hiện tại: `git archive`
vào `/opt/khaibao/src`, `docker build -t khaibao:latest .`, kiểm build.log kết thúc `EXIT=0`. Chưa đặt `METRICS_TOKEN` thì cả hai
đều tắt: web trả 404, worker không mở cổng.

### 1. [Bạn] Kiểm trùng tên trên mạng dùng chung (quan trọng)

Web/worker sẽ có thêm mạng `hscodepro-observability`. Docker DNS trả lời theo **mọi** mạng một container gắn vào. Nếu trên mạng
đó có container của project khác mang tên service `redis`, `postgres`, `minio`, `fpt-mock` hoặc `web`, thì `REDIS_URL=redis://redis…`
của KhaiBáo có thể trỏ nhầm sang container đó.

```bash
docker network inspect hscodepro-observability \
  --format '{{range .Containers}}{{.Name}}{{"\n"}}{{end}}'
docker ps --filter network=hscodepro-observability --format '{{.Names}}\t{{.Label "com.docker.compose.service"}}'
```

Cột thứ hai (tên service) **không được** có `redis`, `postgres`, `minio`, `fpt-mock`, `web`, `worker`, `caddy`, `migrate` hay `backup`.
Nếu có, đừng gắn web/worker vào mạng đó. Thay vào đó, tạo mạng riêng `khaibao-metrics` cho exporter + web + worker và
`docker network connect khaibao-metrics <prometheus>`. Khi làm vậy, sửa `compose.monitoring.yml` cho khớp.

### 2. [Bạn] Chép file lên VPS

Từ máy dev, ở gốc repo:

```bash
ssh -i ~/.ssh/khaibao_deploy root@187.52.127.126 'mkdir -p /opt/khaibao/observability/prometheus'
scp -i ~/.ssh/khaibao_deploy ops/observability/prometheus/khaibao.scrape.yml ops/observability/prometheus/khaibao.rules.yml \
    root@187.52.127.126:/opt/khaibao/observability/prometheus/
scp -i ~/.ssh/khaibao_deploy ops/observability/compose.monitoring.yml root@187.52.127.126:/opt/khaibao/observability/
```

### 3. [Bạn] Tạo token trên máy chủ, không in ra màn hình

```bash
cd /opt/khaibao/observability/prometheus
umask 077
openssl rand -hex 32 > metrics.token
# Prometheus chạy với user nobody (65534) trong container → cho nobody đọc được token:
chown 65534:65534 metrics.token && chmod 0400 metrics.token
chmod 0755 /opt/khaibao/observability /opt/khaibao/observability/prometheus

# Ghi METRICS_TOKEN vào .env của KhaiBáo mà không hiện token (thay dòng cũ nếu đã có):
cd /opt/khaibao
cp .env ".env.bak-$(date +%Y%m%d%H%M%S)"
sed -i '/^METRICS_TOKEN=/d' .env
printf 'METRICS_TOKEN=%s\n' "$(cat observability/prometheus/metrics.token)" >> .env
# (tùy chọn) mã commit cho khaibao_build_info – không phải bí mật:
#   printf 'GIT_COMMIT=%s\n' "<sha của bản đã deploy>" >> .env
```

Phương án khác: nếu không muốn `chown` sang uid 65534, dùng `chmod 0644 metrics.token` trong thư mục `0755` của root.
Cách này chấp nhận được **chỉ vì** `/opt/khaibao/observability` không được web server nào phục vụ và VPS không có user shell khác.
Nếu điều đó thay đổi, quay về 0400 + chown.

### 4. [Bạn] Áp dụng thay đổi một lần ở Prometheus của hscodepro

Làm theo `hscodepro-prometheus.patch.md`: thêm `scrape_config_files` và `rule_files`, gắn volume
`/opt/khaibao/observability/prometheus:/etc/prometheus/khaibao:ro`, rồi chạy `docker compose up -d prometheus` trong thư mục
compose của hscodepro.

### 5. [Bạn] Khởi động exporter + gắn mạng

Server có `docker-compose.override.yml` riêng (tắt Caddy, web ở 127.0.0.1:3200, MinIO). Khi gõ `-f` thì compose **không** tự nạp
override nữa, nên phải liệt kê đủ 3 file. Cách gọn nhất là đặt `COMPOSE_FILE` trong `.env`. Biến này không phải bí mật, và các lần
redeploy sau chỉ cần `docker compose up -d` như cũ:

```bash
cd /opt/khaibao
sed -i '/^COMPOSE_FILE=/d' .env
echo 'COMPOSE_FILE=docker-compose.yml:docker-compose.override.yml:observability/compose.monitoring.yml' >> .env
docker compose config --services        # phải có postgres-exporter, redis-exporter
docker compose up -d                     # tạo lại web, worker (thêm mạng + METRICS_TOKEN) và 2 exporter
```

Thử từ bên trong mạng dùng chung. Lệnh dưới không in token:

```bash
docker run --rm --network hscodepro-observability -v /opt/khaibao/observability/prometheus/metrics.token:/t:ro curlimages/curl:8.11.1 \
  sh -c 'curl -s -o /dev/null -w "web %{http_code}\n" -H "Authorization: Bearer $(cat /t)" http://khaibao-web-1:3100/api/metrics;
         curl -s -o /dev/null -w "worker %{http_code}\n" -H "Authorization: Bearer $(cat /t)" http://khaibao-worker-1:9464/metrics;
         curl -s -o /dev/null -w "pg %{http_code}\n" http://khaibao-postgres-exporter:9187/metrics;
         curl -s -o /dev/null -w "redis %{http_code}\n" http://khaibao-redis-exporter:9121/metrics;
         curl -s -o /dev/null -w "web không token %{http_code} (mong đợi 401)\n" http://khaibao-web-1:3100/api/metrics'
```

`/api/metrics` cũng đi qua domain công khai, vì 1Panel/OpenResty chuyển tiếp mọi `/api/*`, nhưng không có token thì chỉ nhận 401.
Muốn chặn hẳn từ Internet: trong website 1Panel thêm `location = /api/metrics { return 404; }`. Prometheus scrape qua mạng docker
nên không bị ảnh hưởng.

### 6. [Bạn] Kiểm cấu hình rồi reload Prometheus

```bash
P=$(docker ps --format '{{.Names}}' | grep -i prometheus | head -1)
docker exec "$P" promtool check config /etc/prometheus/prometheus.yml
docker exec "$P" promtool check rules /etc/prometheus/khaibao/khaibao.rules.yml
docker exec "$P" kill -HUP 1
```

Xem trong Grafana › Explore (hscodepro-prometheus): `up{project="khaibao"}` phải ra 4 dòng = 1. Lỗi thì xem Runbook
[KhaibaoTargetDown](../../docs/OBSERVABILITY.md#khaibaotargetdown).

### 7. [Bạn] Import dashboard

Grafana › Dashboards › New › Import › tải lên `grafana/khaibao-overview.json`. Dashboard có uid `khaibao-overview` và dùng sẵn
datasource uid `hscodepro-prometheus` / `hscodepro-loki`, nên không phải chọn lại.

### 8. [Bạn] Kênh Telegram

1. Telegram › @BotFather › `/newbot` › lấy **bot token** (bí mật, không dán vào repo hay chat).
2. Thêm bot vào nhóm nhận cảnh báo, gửi một tin bất kỳ trong nhóm, rồi mở `https://api.telegram.org/bot<TOKEN>/getUpdates` để lấy
   `chat.id` (nhóm có dạng `-100…`).
3. Grafana › Alerting › Contact points › **+ Add contact point**: tên `khaibao-telegram`, integration **Telegram**, nhập Bot API token
   + Chat ID, Parse mode `HTML` (hoặc để trống). Bấm **Test**.
4. Grafana › Alerting › Notification policies › **+ New child policy** dưới policy gốc: matcher `project = khaibao`, contact point
   `khaibao-telegram`, group by `alertname, job, queue, name`, group wait 30s, group interval 5m, repeat interval 4h.
   Muốn tách mức độ: thêm policy con `severity = critical` với repeat 1h.

### 9. [Bạn] Đưa luật cảnh báo sang Grafana-managed alerting

Prometheus dùng chung không có Alertmanager. Luật trong `khaibao.rules.yml` được **đánh giá** và hiện ở Grafana › Alerting › Alert rules
(mục data source-managed của `hscodepro-prometheus`), nhưng **không gửi** đi đâu cả. Để có Telegram:

1. Grafana › Alerting › Alert rules › **More › Import to Grafana-managed rules** (Grafana 12+).
2. Nguồn: data source `hscodepro-prometheus`. Lọc namespace `/etc/prometheus/khaibao/khaibao.rules.yml` (hoặc các group `khaibao-*`).
   Thư mục đích: `KhaiBáo`. Bật **Pause** cho rule đã import nếu muốn xem trước.
3. Sau khi import, các rule mang sẵn nhãn `project=khaibao` + `severity` nên policy ở bước 8 tự định tuyến. Kiểm một rule:
   *Edit › Preview*.
4. Để không đánh giá trùng, có thể bỏ `rule_files` của KhaiBáo khỏi Prometheus. Tuy vậy, giữ lại thì luôn có bản "nguồn" để
   import lại khi file thay đổi.

Nếu bản Grafana không có nút Import: tạo tay từng rule (Alerting › New alert rule), dán `expr` từ file và đặt `for`, nhãn, annotation
như file.

#### Cảnh báo sao lưu (Loki, tạo tay trong Grafana)

Container `backup` không xuất chỉ số, nhưng log mỗi lần dump (`deploy/backup/backup.sh`). Tạo 2 rule Grafana-managed với datasource
`hscodepro-loki`, nhãn `project=khaibao`:

| Rule | Truy vấn (Loki, instant) | Điều kiện | Pending |
|---|---|---|---|
| KhaibaoBackupStale (critical) | `sum(count_over_time({compose_project="khaibao", compose_service="backup"} \|= "đã tạo" [26h]))` | `< 1`, hoặc No data → Alerting | 30m |
| KhaibaoBackupFailed (warning) | `sum(count_over_time({compose_project="khaibao", compose_service="backup"} \|= "LỖI" [1h]))` | `> 0` | 0m |

Runbook: [KhaibaoBackupStale](../../docs/OBSERVABILITY.md#khaibaobackupstale).

## Cập nhật về sau

- Sửa job/luật: sửa file trong repo, chạy `promtool test rules` (lệnh ở đầu `khaibao.rules.test.yml`), chép lên
  `/opt/khaibao/observability/prometheus/`, rồi làm lại bước 6. Nếu luật đã import sang Grafana thì sửa luôn rule Grafana tương ứng.
- Xoay token: làm lại bước 3, rồi `docker compose up -d web worker` (nạp `.env` mới) và `kill -HUP 1` Prometheus.
  Prometheus đọc lại `credentials_file` ở mỗi lần scrape.

## Kiểm cục bộ (không cần VPS)

```bash
cd ops/observability/prometheus
docker run --rm -v "$PWD":/r -w /r --entrypoint promtool prom/prometheus:v3.12.0 check rules khaibao.rules.yml
docker run --rm -v "$PWD":/r -w /r --entrypoint promtool prom/prometheus:v3.12.0 test rules khaibao.rules.test.yml
```
