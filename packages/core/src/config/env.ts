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
    REDIS_URL: z.url(),
    S3_ENDPOINT: z.url(),
    S3_BUCKET: z.string().min(1),
    S3_ACCESS_KEY_ID: z.string().min(1),
    S3_SECRET_ACCESS_KEY: z.string().min(1),
    S3_REGION: z.string().default("auto"),
    S3_FORCE_PATH_STYLE: bool.default(true),
    APP_MASTER_KEY: base64Key32,
    APP_URL: z.url(),
    AI_PROVIDER: z.enum(["fake", "claude"]).default("fake"),
    ANTHROPIC_API_KEY: z.string().optional(),
    AI_MODEL: z.string().default("claude-sonnet-5-5"),
    AI_USD_VND_RATE: z.coerce.number().positive().default(25400),
    CUSTOMS_GATEWAY: z.enum(["fake", "fpt"]).default("fake"),
    FPT_API_BASE_URL: z.url().optional(),
    HS_CLASSIFIER: z.enum(["fake", "hscodepro"]).default("fake"),
    HSCODEPRO_URL: z.url().optional(),
    MAIL: z.enum(["console", "smtp"]).default("console"),
    SMTP_URL: z.string().optional(),
  })
  .superRefine((e, ctx) => {
    const need = (cond: boolean, key: string, when: string) => {
      if (cond) ctx.addIssue({ code: "custom", path: [key], message: `${key} bắt buộc khi ${when}` });
    };
    need(e.AI_PROVIDER === "claude" && !e.ANTHROPIC_API_KEY, "ANTHROPIC_API_KEY", "AI_PROVIDER=claude");
    need(e.CUSTOMS_GATEWAY === "fpt" && !e.FPT_API_BASE_URL, "FPT_API_BASE_URL", "CUSTOMS_GATEWAY=fpt");
    need(e.HS_CLASSIFIER === "hscodepro" && !e.HSCODEPRO_URL, "HSCODEPRO_URL", "HS_CLASSIFIER=hscodepro");
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
