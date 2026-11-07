# Quan sát hệ thống (observability)

KhaiBáo AI dùng chung stack quan sát của hscodepro trên VPS. Stack gồm Prometheus v3.12, Loki 3.7 + Alloy, cAdvisor, node-exporter
và Grafana 13.2. Lý do chọn: [ADR 0012](adr/0012-observability-shared-stack.md). Cài đặt từng bước:
[`ops/observability/README.md`](../ops/observability/README.md).

```
web  (Next, :3100)   GET /api/metrics      ─┐  Bearer METRICS_TOKEN
worker (:9464)       GET /metrics          ─┤
postgres-exporter    :9187                 ─┼──► Prometheus (mạng docker hscodepro-observability) ──► Grafana ──► Telegram
redis-exporter       :9121                 ─┤        + cadvisor (container) + node-exporter (VPS)
                                            │
stdout/stderr mọi container ── Alloy ──► Loki  {compose_project="khaibao", compose_service=…} ──► Grafana
```

## Đo gì

### Bật/tắt

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `METRICS_TOKEN` | trống | Token Bearer (≥ 16 ký tự, tạo bằng `openssl rand -hex 32` trên máy chủ). Trống = tắt: web `/api/metrics` trả **404**, worker không mở cổng. Sai/thiếu token = **401**. Không log, không commit. |
| `METRICS_PORT` | `9464` | Cổng chỉ số của worker (chỉ trong mạng docker, không publish). |
| `GIT_COMMIT` | trống | Mã commit của bản đang chạy, hiện ở nhãn `khaibao_build_info{commit}` (cắt 12 ký tự). |

Code nằm ở `packages/core/src/observability/` (export `@kb/core/observability`). File này có registry `prom-client` dùng một bản cho
mỗi tiến trình (giữ trên `globalThis`), hàm ghi chỉ số và `metricsAccess()`. Hàm `metricsAccess()` so token bằng
`timingSafeEqual` trên SHA-256. Web chạy **một** tiến trình `next start` và worker chạy một tiến trình, nên registry mặc định trong
tiến trình là đủ (không cần cluster aggregator). Mọi chỉ số có nhãn `service` = `web` | `worker`. Prometheus gắn thêm
`project="khaibao"`, `environment="prod"` và `job`.

### Danh sách chỉ số

Nhãn luôn ít giá trị. Route lấy dạng mẫu (`/api/dossiers/:id/fields/:code`): `routeTemplate()` thay giá trị tham số động của Next
bằng `:tên`, còn đoạn trông như id thì thành `:id`. Nhãn **không** chứa id, orgId, email hay đường dẫn thô.

| Chỉ số | Loại | Nhãn | Ghi ở đâu |
|---|---|---|---|
| `khaibao_http_requests_total` | counter | `method, route, status_class` (2xx…5xx) | `route()` – `apps/web/src/lib/server/route.ts` (mọi route API bọc `route()`; `/api/metrics`, `/api/health` không bọc nên không đếm) |
| `khaibao_http_request_duration_seconds` | histogram | `method, route` | như trên |
| `khaibao_fpt_requests_total` | counter | `op` (IDA, IDC, IID, VNACCSREP…), `outcome` = `ok` / `rejected` (DomainError: HTTP 4xx, phản hồi sai định dạng, token bị từ chối) / `error` (mạng, 429, 5xx) / `timeout` | `FptRestClient.post()` |
| `khaibao_fpt_request_duration_seconds` | histogram | `op` | như trên (gồm cả lần đăng nhập lại khi 401) |
| `khaibao_jobs_total` | counter | `queue`, `outcome` = `completed` / `retry` (lỗi, còn lượt thử) / `failed` (hết lượt hoặc `UnrecoverableError`) | sự kiện `completed`/`failed` của Worker – `apps/worker/src/index.ts` |
| `khaibao_job_duration_seconds` | histogram | `queue` | `finishedOn − processedOn` |
| `khaibao_queue_jobs` | gauge | `queue`, `state` = waiting / active / delayed / failed | đọc `Queue.getJobCounts()` **lúc scrape** (`registerQueueCollector`); Redis lỗi thì bỏ queue đó trong lần scrape |
| `khaibao_ai_calls_total` | counter | `kind` (AI_CLASSIFY, AI_EXTRACT, AI_DOSSIER_DRAFT, AI_EMAIL_DRAFT), `model` (model yêu cầu), `outcome` = `ok` / `invalid` (AiDataError: từ chối, bị cắt, sai cấu trúc) / `error` | adapter Claude trong `extraction/infrastructure` (`observeAiCall`). AI giả lập (`AI_PROVIDER=fake`) không đếm |
| `khaibao_ai_cost_vnd_total` | counter | `kind` | `DrizzleUsageRecorder.record()`. Chỉ cộng khi dòng `usage_events` mới được ghi, job chạy lại cùng `dedupeKey` thì không cộng. Chỉ để theo dõi: số tiền chuẩn nằm trong DB (Decimal) |
| `khaibao_customs_messages_total` | counter | `op`, `outcome` = `ok` / `rejected` (Hải quan trả lỗi nghiệp vụ hoặc lỗi vĩnh viễn) / `error` (lỗi tạm, sẽ thử lại) | `processOutbox()` – `integration/application/process-outbox.ts` (HYS đi nhánh riêng, không đếm) |
| `khaibao_declarations_accepted_total` | counter | `kind` = IDC / EDC | `processOutbox()` khi khai chính thức thành công, có phân luồng |
| `khaibao_build_info` | gauge (= 1) | `version, commit` | `configureMetrics()` |
| `khaibao_process_*`, `khaibao_nodejs_*` | | | `collectDefaultMetrics` (CPU, RAM, event loop lag, GC, heap) |

Exporter ngoài app: `pg_*` (postgres-exporter: `pg_up`, `pg_stat_activity_count`, `pg_settings_max_connections`,
`pg_stat_database_*`), `redis_*` (redis_exporter), `container_*` (cAdvisor, lọc `name=~"khaibao-.+"`), `node_*` (node-exporter).

Thêm chỉ số mới: khai báo trong `packages/core/src/observability/metrics.ts` (tiền tố `khaibao_`, nhãn ít giá trị, có `help` tiếng
Việt), thêm hàm ghi nhỏ, rồi cập nhật bảng trên. **Domain không được import** module này (depcruise `domain-is-pure`). Chỉ gọi từ
infrastructure, application (giống log) hoặc apps.

## Tra log trong Loki

Alloy thu stdout/stderr của mọi container. Nhãn có `container`, `compose_project`, `compose_service`. Web và worker ghi JSON một dòng
(`createLogger`: `t, level, name, msg, requestId, jobId, orgId, dossierId…`), nên lọc được bằng `| json`.

| Muốn | LogQL |
|---|---|
| Toàn bộ log KhaiBáo | `{compose_project="khaibao"}` |
| Lỗi của web | `{compose_project="khaibao", compose_service="web"} \| json \| level="error"` |
| Một request người dùng báo (mã ở header `x-request-id` / thân lỗi 500) | `{compose_project="khaibao"} \|= "<requestId>"` |
| Một job | `{compose_project="khaibao", compose_service="worker"} \| json \| jobId="<id>"` |
| Một doanh nghiệp (chỉ khi điều tra, đừng làm nhãn) | `{compose_project="khaibao"} \| json \| orgId="org_…"` |
| Job hết lượt thử | `{compose_service="worker", compose_project="khaibao"} \|= "hết số lần thử"` |
| Chi phí không ghi được / billing | `{compose_project="khaibao"} \|~ "\\[usage\\]\|\\[billing\\]"` |
| Sao lưu | `{compose_project="khaibao", compose_service="backup"}` |
| Số dòng lỗi theo service | `sum by (compose_service) (count_over_time({compose_project="khaibao"} \| json \| level="error" [5m]))` |

Logger đã che khóa nhạy cảm, nhưng log vẫn có MST/tên doanh nghiệp trong một số dòng nghiệp vụ. Vì vậy chỉ người vận hành được quyền
Explore trên `hscodepro-loki`.

## Dashboard

`ops/observability/grafana/khaibao-overview.json` (uid `khaibao-overview`) có các hàng: Tổng quan (up web/worker/pg/redis, req/s, %
5xx, p95, phiên bản) · HTTP theo route · FPT.VNACCS theo nghiệp vụ · Hàng đợi job · AI (lời gọi, chi phí VND/ngày) · Nghiệp vụ (tờ
khai được chấp nhận/ngày, thông điệp Hải quan) · Postgres/Redis · Container khaibao (cAdvisor) · Log (Loki). Biến lọc: `route`,
`queue`, `service` (log).

## Runbook

Cảnh báo nằm trong `ops/observability/prometheus/khaibao.rules.yml`. Prometheus đánh giá chúng, rồi chúng được import thành
Grafana-managed rule gửi Telegram theo nhãn `project=khaibao`. Mỗi cảnh báo có `runbook_url` trỏ về đúng mục dưới đây.

Lệnh chung trên VPS (`/opt/khaibao`):

- `docker compose ps`
- `docker compose logs --tail 200 web` (hoặc `worker`)
- `curl -s 127.0.0.1:3200/api/health` (readiness: Postgres + Redis + storage)

### KhaibaoTargetDown

`up == 0` trong 2 phút cho một job `khaibao-*`. Nhãn `job` cho biết đích nào.

1. `docker compose ps` – container còn chạy không, có restart loop không? Nếu không chạy thì xem log của chính nó
   (`docker compose logs --tail 200 <service>`).
2. Container chạy mà vẫn down: vào Prometheus › Status › Targets, xem lỗi của job.
   - `401`: token lệch. `METRICS_TOKEN` trong `.env` khác `metrics.token`, hoặc chưa `up -d` lại sau khi đổi `.env`.
   - `404` ở web: chưa đặt `METRICS_TOKEN`.
   - `no such host` / `connection refused`: container chưa gắn mạng `hscodepro-observability`. Thường do compose chạy thiếu
     `compose.monitoring.yml` (kiểm `COMPOSE_FILE` trong `.env`) hoặc container mang tên khác `khaibao-web-1`.
3. Job `khaibao-postgres` / `khaibao-redis` down nghĩa là exporter chết. Postgres/Redis down thật sẽ báo bằng
   `KhaibaoPostgresDown` / `KhaibaoRedisDown` (exporter vẫn sống, `pg_up` / `redis_up` = 0).
4. `KhaibaoRedisDown`: kiểm `docker compose logs redis` (thường do đầy ổ đĩa và AOF ghi lỗi) rồi `docker compose restart redis`.
   Worker/web tự nối lại. Job trong queue vẫn còn nhờ appendonly.

### KhaibaoPostgresDown

`pg_up == 0` (Postgres không trả lời exporter). Cùng mục này: **KhaibaoPostgresConnectionsHigh** (> 80% `max_connections`).

1. `docker compose ps postgres`, rồi `docker compose logs --tail 200 postgres`. Hay gặp: hết ổ đĩa
   (xem [KhaibaoDiskLow](#khaibaodisklow)), OOM.
2. Khởi động lại: `docker compose up -d postgres`. Sau đó migrate/web/worker tự chờ healthcheck.
3. Kết nối cao: `docker compose exec postgres psql -U kb_admin -d khaibao -c "select state, count(*) from pg_stat_activity group by 1"`.
   Nếu có nhiều `idle in transaction`, đó là dấu hiệu transaction giữ kết nối rồi gọi ra ngoài (sự cố 28/10/2026,
   `docs/ARCHITECTURE.md` §4). Tìm route/job gây ra bằng p95 route và log, rồi `docker compose restart web` để giải phóng tạm.

### KhaibaoHigh5xxRate

Hơn 5% request API trả 5xx trong 10 phút (khi lưu lượng > 0,05 req/s).

1. Dashboard › HTTP theo route › "Lỗi theo nhóm mã trạng thái" và "Request/giây theo route": tìm route nào lỗi.
2. Loki: `{compose_project="khaibao", compose_service="web"} | json | level="error"`. Mỗi lỗi 500 có `requestId`, `path` và `err`.
3. Nhiều route cùng lỗi thì thường là hạ tầng: `curl 127.0.0.1:3200/api/health` để xem Postgres/Redis/storage nào `error`.
   502 từ FPT (`GATEWAY_ERROR`) xem [KhaibaoFptErrorRate](#khaibaofpterrorrate).
4. Lỗi xuất hiện ngay sau một lần deploy: so `khaibao_build_info` rồi cân nhắc quay về image trước.

### KhaibaoHighP95Latency

p95 > 3 giây trong 15 phút. Luật đã bỏ các route dài theo bản chất: SSE `/events`, tải file, xuất Excel, nhập danh mục, AI điền
nháp, gửi thử, đồng bộ hộp thư.

1. Dashboard › "p95 theo route" / "Top route chậm" để biết route nào chậm.
2. Nếu mọi route cùng chậm: CPU/RAM container web, kết nối Postgres (pool 10, xem
   [KhaibaoPostgresDown](#khaibaopostgresdown)), event loop lag `khaibao_nodejs_eventloop_lag_p99_seconds{service="web"}`.
3. Nếu chỉ một route chậm: xem log route đó. Gọi ngoài (AI/FPT) không được chạy đồng bộ trong request, mà phải đưa vào job
   (skill `adding-backend-use-case`).

### KhaibaoFptErrorRate

Lỗi tạm + timeout khi gọi FPT.VNACCS > 20% trong 10 phút (≥ 5 lời gọi).

1. Dashboard › FPT: nghiệp vụ nào lỗi, outcome là `timeout` hay `error`.
2. Loki: `{compose_service="worker", compose_project="khaibao"} |~ "FPT (trả HTTP|không phản hồi|Không kết nối)"`.
3. Production hiện trỏ `FPT_API_BASE_URL=http://fpt-mock:7070` (container `khaibao-fpt-mock`, không nằm trong compose):
   `docker ps --filter name=khaibao-fpt-mock`, `docker logs --tail 100 khaibao-fpt-mock`, rồi `docker restart khaibao-fpt-mock`.
   Mock giữ trạng thái trong RAM, nên restart sẽ mất các lô đang mô phỏng.
4. Cổng FPT thật: liên hệ FPT. Job `customs-send` tự thử lại (backoff). Hết lượt thì outbox `FAILED` và người dùng bấm Gửi lại.
   Không cần thao tác DB.
5. `rejected` tăng (không nằm trong cảnh báo này): thường do sai `FPT_API_USERNAME/PASSWORD`, đường dẫn API, hoặc body sai định dạng.
   Xem `GATEWAY_ERROR` trong log.

### KhaibaoQueueBacklog

Hơn 50 job `waiting` trong một queue trong 15 phút.

1. `docker compose ps worker`, rồi log worker. Nếu worker chết hoặc treo thì `docker compose restart worker` (tắt êm 30 s).
2. `extract-document`: bị giới hạn `AI_RATE_PER_MINUTE` và `WORKER_MAX_PER_ORG` theo thiết kế. Một doanh nghiệp đẩy lô lớn sẽ tự
   vơi dần. Xem "Lời gọi AI": nếu `error` tăng thì do Anthropic quá tải hoặc 529.
3. `customs-*`: xem [KhaibaoFptErrorRate](#khaibaofpterrorrate).
4. Redis chậm hoặc đầy: dashboard Postgres/Redis › "Bộ nhớ Redis" (`noeviction`, đầy là ghi lỗi).

### KhaibaoJobsFailing

Hơn 5 job của một queue hết số lần thử trong 15 phút.

1. Loki: `{compose_service="worker", compose_project="khaibao"} |= "hết số lần thử" | json | queue="<queue>"`, đọc `err.message`.
2. `onFinalFailure` đã đánh dấu bản ghi liên quan (chứng từ ERROR, outbox FAILED, agent run ERROR…), nên người dùng thấy và bấm
   thử lại. Không sửa DB tay.
3. Lỗi giống nhau hàng loạt: thường do cấu hình (khóa AI hết hạn, `AI_DAILY_COST_CAP_VND`, tài khoản FPT/HSCodePro) hoặc bản deploy
   mới có lỗi. Sửa nguyên nhân rồi để người dùng thử lại.

### KhaibaoContainerMemoryHigh

RAM container `khaibao-*` > 90% `mem_limit`, hoặc > 2 GiB nếu container không đặt giới hạn, trong 10 phút. VPS dùng chung với hscodepro.

1. Dashboard › Container khaibao › RAM. Tăng dần đều là dấu hiệu rò bộ nhớ. Tăng vọt là lô lớn (PDF nặng, xuất Excel).
2. Web/worker: `khaibao_process_resident_memory_bytes`, `khaibao_nodejs_heap_size_used_bytes` theo `service`.
3. Tạm thời: `docker compose restart <service>`. Worker tắt êm, job dở được BullMQ chạy lại.
4. Lâu dài: đặt `mem_limit` trong compose (thì cảnh báo so với giới hạn), giảm concurrency queue nặng.

### KhaibaoDiskLow

Ổ gốc VPS còn < 10%.

1. `df -h /`, rồi `du -sh /var/lib/docker/* /opt/khaibao/backups 2>/dev/null | sort -h | tail`.
2. Dọn an toàn: `docker image prune -f` (image cũ sau mỗi lần build). Bản sao lưu cũ hơn `BACKUP_KEEP_DAYS` tự xóa. Có thể giảm số
   ngày giữ nếu đã đẩy ra ngoài (`BACKUP_REMOTE`).
3. **Không** xóa volume `pgdata`, `redisdata` hay dữ liệu MinIO. Hỏi chủ VPS trước khi dọn dữ liệu của hscodepro.

### KhaibaoBackupStale

Rule Grafana-managed trên Loki (cách tạo: `ops/observability/README.md`): 26 giờ không có dòng `[backup] … đã tạo`, hoặc có dòng `LỖI`.

1. `docker compose ps backup` và `docker compose logs --tail 50 backup` (dòng `lần tới:` cho biết lịch).
2. Thử ngay: `docker compose exec backup backup.sh once`. Lệnh in ra `đã tạo …` là ổn. `ls -lh /opt/khaibao/backups | tail`.
3. Lỗi `rclone`: kiểm biến `RCLONE_CONFIG_BK_*` và kho ngoài. Bản dump trên máy vẫn được tạo trước bước đẩy.
