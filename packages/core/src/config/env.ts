import { z } from "zod";

const bool = z.enum(["true", "false"]).transform((v) => v === "true");
const base64Key32 = z.string().refine((s) => {
  try {
    return Buffer.from(s, "base64").length === 32;
  } catch {
    return false;
  }
}, "APP_MASTER_KEY phải là base64 của 32 byte");

export const EnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z.url(),
    DATABASE_ADMIN_URL: z.url(),
    /** Kết nối của khu Quản trị hệ thống (role kb_platform, ADR 0006). Thiếu → DATABASE_URL với user kb_platform. */
    DATABASE_PLATFORM_URL: z.url().optional(),
    REDIS_URL: z.url(),
    /** Nơi lưu file chứng từ: s3 (MinIO dev / R2) hoặc azure (Azure Blob Storage). */
    STORAGE: z.enum(["s3", "azure"]).default("s3"),
    S3_ENDPOINT: z.url().optional(),
    S3_BUCKET: z.string().min(1).optional(),
    S3_ACCESS_KEY_ID: z.string().min(1).optional(),
    S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
    S3_REGION: z.string().default("auto"),
    S3_FORCE_PATH_STYLE: bool.default(true),
    /** Connection string của Storage account (Azure Portal → Access keys). Cần AccountKey để tạo link xem file (SAS). */
    AZURE_STORAGE_CONNECTION_STRING: z.string().optional(),
    AZURE_STORAGE_CONTAINER: z.string().regex(/^[a-z0-9](?!.*--)[a-z0-9-]{1,61}[a-z0-9]$/, "Tên container Azure: 3–63 ký tự a-z, 0-9, dấu - (không đứng đầu/cuối, không liền nhau)").default("khaibao-documents"),
    APP_MASTER_KEY: base64Key32,
    /**
     * Vòng khóa để xoay khóa mã hóa bí mật: `v2:<base64 32 byte>,v1:<base64 32 byte>`. Mã hóa mới dùng phiên bản lớn nhất;
     * giải mã theo `key_version` của từng dòng. Thiếu → chỉ APP_MASTER_KEY (phiên bản 1). Sau khi thêm khóa mới chạy
     * `pnpm --filter @kb/core secrets:rotate` để mã hóa lại dữ liệu cũ, rồi mới bỏ khóa cũ khỏi vòng.
     */
    APP_MASTER_KEYS: z.string().optional(),
    APP_URL: z.url(),
    /**
     * Số reverse proxy tin cậy đứng trước web (Caddy/nginx/Cloudflare…): IP khách lấy ở vị trí thứ N từ cuối chuỗi X-Forwarded-For
     * (proxy ghi thêm vào cuối; phần đầu do khách gửi có thể giả). 0 = không có proxy → bỏ qua X-Forwarded-For.
     */
    TRUSTED_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(1),
    AI_PROVIDER: z.enum(["fake", "claude"]).default("fake"),
    ANTHROPIC_API_KEY: z.string().optional(),
    AI_MODEL: z.string().default("claude-sonnet-5-5"),
    /** Model rẻ cho việc nhỏ không cần suy luận (Nhờ AI điền form Tạo hồ sơ – ADR 0010). */
    AI_FAST_MODEL: z.string().default("claude-haiku-4-5-20251001"),
    AI_USD_VND_RATE: z.coerce.number().positive().default(25400),
    /** Timeout một lời gọi AI (ms). SDK chỉ thử lại 1 lần – BullMQ đã thử lại job 5 lần. */
    AI_TIMEOUT_MS: z.coerce.number().int().positive().default(180_000),
    /** Trần chi phí AI (VND) mỗi doanh nghiệp mỗi ngày (giờ VN); "0" = không giới hạn. Vượt → chứng từ báo lỗi, không gọi AI. */
    AI_DAILY_COST_CAP_VND: z.string().regex(/^\d+(\.\d+)?$/, "Số VND không âm").default("0"),
    /** Số lời gọi AI tối đa mỗi phút trên toàn worker (limiter BullMQ của queue extract-document). */
    AI_RATE_PER_MINUTE: z.coerce.number().int().positive().default(30),
    /** Cổng HTTP health của worker (/health/live, /health/ready); bỏ trống = không mở. */
    WORKER_HEALTH_PORT: z.coerce.number().int().min(1).max(65535).optional(),
    /**
     * Token Bearer cho chỉ số Prometheus (web `GET /api/metrics`, worker `:METRICS_PORT/metrics`) – ADR 0012, docs/OBSERVABILITY.md.
     * Trống = tắt: web trả 404, worker không mở cổng. Tạo trên máy chủ bằng `openssl rand -hex 32`, không log, không commit.
     */
    METRICS_TOKEN: z.string().min(16, "METRICS_TOKEN tối thiểu 16 ký tự (openssl rand -hex 32)").optional(),
    /** Cổng HTTP chỉ số của worker (chỉ mở khi có METRICS_TOKEN). */
    METRICS_PORT: z.coerce.number().int().min(1).max(65535).default(9464),
    /** Mã commit của bản đang chạy (nhãn khaibao_build_info); trống = "unknown". */
    GIT_COMMIT: z.string().optional(),
    /** Số job đọc chứng từ / chạy agent đồng thời tối đa của MỘT doanh nghiệp – khách lớn không chiếm hết worker. */
    WORKER_MAX_PER_ORG: z.coerce.number().int().positive().default(2),
    CUSTOMS_GATEWAY: z.enum(["fake", "fpt"]).default("fake"),
    /** Gốc API FPT.VNACCS. Dev/test: apps/fpt-mock (http://localhost:7070) – KHÔNG dùng cổng thật (production). */
    FPT_API_BASE_URL: z.url().optional(),
    /** Tài khoản API (POST /api/auth/login → JWT), khác tài khoản VNACCS của doanh nghiệp. */
    FPT_API_USERNAME: z.string().optional(),
    FPT_API_PASSWORD: z.string().optional(),
    FPT_API_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
    /**
     * GỠ LỖI TẠM: true = lưu body gửi FPT + phản hồi thô (Redis, 100 lần gọi gần nhất/doanh nghiệp, 7 ngày) và hiện khung "Nhật ký API FPT" ở màn Truyền.
     * Mật khẩu/terminal key đã che nhưng body có dữ liệu tờ khai đầy đủ (MST, tên, địa chỉ) – chỉ bật khi thử tích hợp. Bỏ tính năng: grep FPT_DEBUG_TRACE.
     */
    FPT_DEBUG_TRACE: bool.default(false),
    /** Thử cổng test Hải quan: ghi đè tK_CH (mã Hải quan) trên mọi body gửi FPT, vd 88AB. Trống = lấy theo ô Cơ quan Hải quan của tờ khai. */
    FPT_FORCE_TK_CH: z.string().trim().regex(/^[0-9A-Z]{4}$/, "FPT_FORCE_TK_CH là mã Hải quan 4 ký tự, vd 88AB").optional().or(z.literal("").transform(() => undefined)),
    /** Tài khoản VNACCS dùng khi doanh nghiệp chưa nhập (T5: chưa có màn nhập). Chỉ để dev/test với fpt-mock. */
    FPT_VNACCS_USER_ID: z.string().optional(),
    FPT_VNACCS_PASSWORD: z.string().optional(),
    FPT_VNACCS_TERMINAL_ID: z.string().optional(),
    FPT_VNACCS_TERMINAL_ACCESS_KEY: z.string().optional(),
    HS_CLASSIFIER: z.enum(["fake", "hscodepro"]).default("fake"),
    /** HSCodePro – phân loại HS (docs/integrations/hscodepro-api-v1.md). Dev: https://dev.aixuatnhapkhau.cloud; giả lập: http://localhost:7070 (pnpm fpt-mock). */
    HSCODEPRO_URL: z.url().optional(),
    /** Header X-Internal-Api-Key – chỉ dùng phía máy chủ, không log. */
    HSCODEPRO_INTERNAL_KEY: z.string().optional(),
    /**
     * Giá vốn HSCodePro: VND cho mỗi dòng hàng gửi phân loại (tạo lượt, phân loại lại, trả lời câu hỏi) – ghi usage_events.
     * Chưa có giá hợp đồng → để trống = 0. Chuỗi thập phân (tiền tính bằng Decimal).
     */
    HSCODEPRO_PRICE_PER_ITEM_VND: z.string().regex(/^\d+(\.\d+)?$/, "Đơn giá VND không âm, dạng 1500 hoặc 1500.5").default("0"),
    /** Giá vốn Customs Hub (FPT.VNACCS): VND cho mỗi thông điệp gửi (IDA, IDC, HYS…) hoặc hỏi trạng thái (IID/IEX). Trống = 0. */
    CUSTOMS_HUB_PRICE_PER_MESSAGE_VND: z.string().regex(/^\d+(\.\d+)?$/, "Đơn giá VND không âm, dạng 1500 hoặc 1500.5").default("0"),
    /**
     * Hộp thư chứng từ (kết nối Gmail / Outlook): `fake` = hộp thư giả lập (dev/demo, không gọi Google/Microsoft);
     * `live` = OAuth thật – nhà cung cấp nào có đủ client id + secret thì nút kết nối mới bật.
     * Redirect URI phải khai báo ở Google Cloud Console (OAuth client "Web application") và Azure App registrations (Web):
     * `${APP_URL}/api/mailbox/oauth/callback`. Hướng dẫn từng bước: `docs/MAILBOX-SETUP.md`.
     */
    MAILBOX_PROVIDER: z.enum(["fake", "live"]).default("fake"),
    /**
     * Google OAuth client (Google Cloud Console → APIs & Services → Credentials), bật Gmail API.
     * gmail.readonly là "restricted scope": chạy công khai trên production phải qua Google verification + đánh giá bảo mật (CASA);
     * khi app ở chế độ Testing chỉ tối đa 100 test user khai báo sẵn dùng được.
     */
    GOOGLE_OAUTH_CLIENT_ID: z.string().optional(),
    GOOGLE_OAUTH_CLIENT_SECRET: z.string().optional(),
    /** Microsoft Entra ID (Azure App registrations), quyền delegated Mail.Read + User.Read + offline_access. */
    MICROSOFT_OAUTH_CLIENT_ID: z.string().optional(),
    MICROSOFT_OAUTH_CLIENT_SECRET: z.string().optional(),
    /** `common` (mọi tài khoản Microsoft 365 + Outlook.com), `organizations`, hoặc tenant id riêng. */
    MICROSOFT_OAUTH_TENANT: z.string().default("common"),
    MAIL: z.enum(["console", "smtp"]).default("console"),
    SMTP_URL: z.string().optional(),
    /**
     * Cổng thanh toán mua lượt (ADR 0011) – fail-closed:
     * - `payos` = PayOS thật, cần đủ 3 khóa kênh thanh toán;
     * - `none` = tắt thanh toán online (mua lượt báo chưa bật, webhook 404; đội vận hành vẫn nạp tay) – **mặc định khi NODE_ENV=production**;
     * - `fake` = giả lập (dev/demo/test – checkout quay về /settings?tab=plan&payment=…&fake=1, route dev giả lập "đã trả") – mặc định ngoài production,
     *   **bị từ chối khi NODE_ENV=production** (ai cũng tự cộng lượt được).
     * Khóa chỉ dùng phía máy chủ: không gửi xuống trình duyệt, không log, không ghi vào payments.raw.
     */
    PAYMENT_PROVIDER: z.enum(["none", "fake", "payos"]).optional(),
    PAYOS_CLIENT_ID: z.string().optional(),
    PAYOS_API_KEY: z.string().optional(),
    PAYOS_CHECKSUM_KEY: z.string().optional(),
    /** Đổi chỉ khi PayOS đổi địa chỉ API. */
    PAYOS_API_URL: z.url().default("https://api-merchant.payos.vn"),
  })
  .superRefine((e, ctx) => {
    const need = (cond: boolean, key: string, when: string) => {
      if (cond) ctx.addIssue({ code: "custom", path: [key], message: `${key} bắt buộc khi ${when}` });
    };
    need(e.AI_PROVIDER === "claude" && !e.ANTHROPIC_API_KEY, "ANTHROPIC_API_KEY", "AI_PROVIDER=claude");
    for (const k of ["S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"] as const) need(e.STORAGE === "s3" && !e[k], k, "STORAGE=s3");
    need(e.STORAGE === "azure" && !e.AZURE_STORAGE_CONNECTION_STRING, "AZURE_STORAGE_CONNECTION_STRING", "STORAGE=azure");
    need(e.CUSTOMS_GATEWAY === "fpt" && !e.FPT_API_BASE_URL, "FPT_API_BASE_URL", "CUSTOMS_GATEWAY=fpt");
    // Cổng FPT/Hải quan chỉ nhận HTTPS (thống nhất với đội nghiệp vụ 01/11/2026). Production: http chỉ cho máy nội bộ (localhost, tên service docker không có dấu chấm – vd fpt-mock).
    if (e.NODE_ENV === "production" && e.CUSTOMS_GATEWAY === "fpt" && e.FPT_API_BASE_URL && !isHttpsOrInternal(e.FPT_API_BASE_URL))
      ctx.addIssue({ code: "custom", path: ["FPT_API_BASE_URL"], message: "FPT_API_BASE_URL phải dùng https:// ở production" });
    need(e.CUSTOMS_GATEWAY === "fpt" && !e.FPT_API_USERNAME, "FPT_API_USERNAME", "CUSTOMS_GATEWAY=fpt");
    need(e.CUSTOMS_GATEWAY === "fpt" && !e.FPT_API_PASSWORD, "FPT_API_PASSWORD", "CUSTOMS_GATEWAY=fpt");
    need(e.HS_CLASSIFIER === "hscodepro" && !e.HSCODEPRO_URL, "HSCODEPRO_URL", "HS_CLASSIFIER=hscodepro");
    need(e.HS_CLASSIFIER === "hscodepro" && !e.HSCODEPRO_INTERNAL_KEY, "HSCODEPRO_INTERNAL_KEY", "HS_CLASSIFIER=hscodepro");
    need(e.MAIL === "smtp" && !e.SMTP_URL, "SMTP_URL", "MAIL=smtp");
    for (const k of ["PAYOS_CLIENT_ID", "PAYOS_API_KEY", "PAYOS_CHECKSUM_KEY"] as const) need(e.PAYMENT_PROVIDER === "payos" && !e[k], k, "PAYMENT_PROVIDER=payos");
    if (e.NODE_ENV === "production" && e.PAYMENT_PROVIDER === "fake")
      ctx.addIssue({ code: "custom", path: ["PAYMENT_PROVIDER"], message: "PAYMENT_PROVIDER=fake không được dùng ở production (ai cũng tự cộng lượt được) – dùng payos (kèm khóa) hoặc none" });
    if (e.APP_MASTER_KEYS !== undefined) {
      const bad = parseKeyRing(e.APP_MASTER_KEYS).error;
      if (bad) ctx.addIssue({ code: "custom", path: ["APP_MASTER_KEYS"], message: bad });
    }
  })
  // Mặc định cổng thanh toán theo môi trường: production → none (tắt), còn lại → fake.
  .transform((e) => ({ ...e, PAYMENT_PROVIDER: e.PAYMENT_PROVIDER ?? (e.NODE_ENV === "production" ? ("none" as const) : ("fake" as const)) }));

/** https://…, hoặc http tới máy nội bộ (localhost/127.0.0.1/tên service docker không có dấu chấm). */
export function isHttpsOrInternal(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol === "https:") return true;
    return u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1" || !u.hostname.includes("."));
  } catch {
    return false;
  }
}

export type MasterKeyRing = { current: number; keys: Map<number, string> };

/** "v2:xxx,v1:yyy" → { current: 2, keys } ; lỗi định dạng → `error`. */
export function parseKeyRing(raw: string): { ring?: MasterKeyRing; error?: string } {
  const keys = new Map<number, string>();
  for (const part of raw.split(",").map((s) => s.trim()).filter(Boolean)) {
    const m = /^v(\d{1,4}):(.+)$/.exec(part);
    if (!m) return { error: `APP_MASTER_KEYS: mục "${part.slice(0, 12)}…" phải dạng v<số>:<base64 32 byte>` };
    const version = Number(m[1]);
    if (keys.has(version)) return { error: `APP_MASTER_KEYS: trùng phiên bản v${version}` };
    if (!base64Key32.safeParse(m[2]).success) return { error: `APP_MASTER_KEYS: khóa v${version} phải là base64 của 32 byte` };
    keys.set(version, m[2]!);
  }
  if (keys.size === 0) return { error: "APP_MASTER_KEYS rỗng" };
  return { ring: { current: Math.max(...keys.keys()), keys } };
}

/** Vòng khóa hiệu lực: APP_MASTER_KEYS (nếu có) + APP_MASTER_KEY làm phiên bản 1 khi vòng chưa có v1 (dữ liệu cũ vẫn giải mã được). */
export function masterKeyRing(env: Pick<Env, "APP_MASTER_KEY" | "APP_MASTER_KEYS">): MasterKeyRing {
  const ring = env.APP_MASTER_KEYS ? parseKeyRing(env.APP_MASTER_KEYS).ring : undefined;
  if (!ring) return { current: 1, keys: new Map([[1, env.APP_MASTER_KEY]]) };
  if (!ring.keys.has(1)) ring.keys.set(1, env.APP_MASTER_KEY);
  return ring;
}

export type Env = z.infer<typeof EnvSchema>;

/** Parse biến môi trường; biến rỗng "" coi như không đặt. Ném Error liệt kê từng biến sai. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const cleaned = Object.fromEntries(Object.entries(source).filter(([, v]) => v !== undefined && v !== ""));
  const r = EnvSchema.safeParse(cleaned);
  if (r.success) return r.data;
  const lines = r.error.issues.map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`);
  throw new Error(`Cấu hình môi trường không hợp lệ:\n${lines.join("\n")}`);
}
