// Chạy: pnpm fpt-mock (cổng 7070). Cấu hình qua biến môi trường FPT_MOCK_* – xem README.md.
import { createServer } from "node:http";
import { z } from "zod";
import { createFptMock } from "./app.js";

const env = z.object({
  FPT_MOCK_PORT: z.coerce.number().int().default(7070),
  /** "user:pass,user2:pass2" – tài khoản gọi /api/auth/login. */
  FPT_MOCK_API_USERS: z.string().default("test:test"),
  FPT_MOCK_VNACCS_PASSWORD: z.string().default("12345678"),
  FPT_MOCK_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(3 * 3600),
  FPT_MOCK_POLLS_TO_CLEAR: z.coerce.number().int().positive().default(2),
  /** Khóa X-Internal-Api-Key của HSCodePro giả lập. */
  FPT_MOCK_HSCODEPRO_KEY: z.string().min(1).default("dev-hs-key"),
}).parse(process.env);

const apiUsers = Object.fromEntries(env.FPT_MOCK_API_USERS.split(",").map((p) => p.split(":") as [string, string]).filter(([u, pw]) => u && pw !== undefined));
const mock = createFptMock({
  apiUsers, vnaccsPassword: env.FPT_MOCK_VNACCS_PASSWORD, tokenTtlSeconds: env.FPT_MOCK_TOKEN_TTL_SECONDS, pollsToClear: env.FPT_MOCK_POLLS_TO_CLEAR, hscodeproKey: env.FPT_MOCK_HSCODEPRO_KEY,
  log: (line) => console.log(`[fpt-mock] ${new Date().toISOString()} ${line}`),
});
createServer(mock.handler).listen(env.FPT_MOCK_PORT, () => {
  console.log(`[fpt-mock] http://localhost:${env.FPT_MOCK_PORT} · API user: ${Object.keys(apiUsers).join(", ")} · VNACCS password: ${env.FPT_MOCK_VNACCS_PASSWORD} · HSCodePro: /internal/v1/hs-classifications (khóa đặt qua FPT_MOCK_HSCODEPRO_KEY)`);
});
