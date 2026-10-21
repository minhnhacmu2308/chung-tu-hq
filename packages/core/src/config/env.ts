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
    APP_URL: z.url(),
    AI_PROVIDER: z.enum(["fake", "claude"]).default("fake"),
    ANTHROPIC_API_KEY: z.string().optional(),
    AI_MODEL: z.string().default("claude-sonnet-5-5"),
    AI_USD_VND_RATE: z.coerce.number().positive().default(25400),
    CUSTOMS_GATEWAY: z.enum(["fake", "fpt"]).default("fake"),
    /** Gốc API FPT.VNACCS. Dev/test: apps/fpt-mock (http://localhost:7070) – KHÔNG dùng cổng thật (production). */
    FPT_API_BASE_URL: z.url().optional(),
    /** Tài khoản API (POST /api/auth/login → JWT), khác tài khoản VNACCS của doanh nghiệp. */
    FPT_API_USERNAME: z.string().optional(),
    FPT_API_PASSWORD: z.string().optional(),
    FPT_API_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
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
    MAIL: z.enum(["console", "smtp"]).default("console"),
    SMTP_URL: z.string().optional(),
  })
  .superRefine((e, ctx) => {
    const need = (cond: boolean, key: string, when: string) => {
      if (cond) ctx.addIssue({ code: "custom", path: [key], message: `${key} bắt buộc khi ${when}` });
    };
    need(e.AI_PROVIDER === "claude" && !e.ANTHROPIC_API_KEY, "ANTHROPIC_API_KEY", "AI_PROVIDER=claude");
    for (const k of ["S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"] as const) need(e.STORAGE === "s3" && !e[k], k, "STORAGE=s3");
    need(e.STORAGE === "azure" && !e.AZURE_STORAGE_CONNECTION_STRING, "AZURE_STORAGE_CONNECTION_STRING", "STORAGE=azure");
    need(e.CUSTOMS_GATEWAY === "fpt" && !e.FPT_API_BASE_URL, "FPT_API_BASE_URL", "CUSTOMS_GATEWAY=fpt");
    need(e.CUSTOMS_GATEWAY === "fpt" && !e.FPT_API_USERNAME, "FPT_API_USERNAME", "CUSTOMS_GATEWAY=fpt");
    need(e.CUSTOMS_GATEWAY === "fpt" && !e.FPT_API_PASSWORD, "FPT_API_PASSWORD", "CUSTOMS_GATEWAY=fpt");
    need(e.HS_CLASSIFIER === "hscodepro" && !e.HSCODEPRO_URL, "HSCODEPRO_URL", "HS_CLASSIFIER=hscodepro");
    need(e.HS_CLASSIFIER === "hscodepro" && !e.HSCODEPRO_INTERNAL_KEY, "HSCODEPRO_INTERNAL_KEY", "HS_CLASSIFIER=hscodepro");
    need(e.MAIL === "smtp" && !e.SMTP_URL, "SMTP_URL", "MAIL=smtp");
  });

export type Env = z.infer<typeof EnvSchema>;

/** Parse biến môi trường; biến rỗng "" coi như không đặt. Ném Error liệt kê từng biến sai. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const cleaned = Object.fromEntries(Object.entries(source).filter(([, v]) => v !== undefined && v !== ""));
  const r = EnvSchema.safeParse(cleaned);
  if (r.success) return r.data;
  const lines = r.error.issues.map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`);
  throw new Error(`Cấu hình môi trường không hợp lệ:\n${lines.join("\n")}`);
}
