import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { ensureAppRole, ensurePlatformRole, runMigrations } from "./migrate.js";

export type TestDb = { adminUrl: string; appUrl: string; platformUrl: string; stop: () => Promise<void> };

/** Postgres thật trong Docker, migration đã chạy, có role kb_app. ~5–10s lần đầu. */
export async function startTestDb(): Promise<TestDb> {
  const c: StartedPostgreSqlContainer = await new PostgreSqlContainer("postgres:16-alpine").withDatabase("khaibao_test").start();
  const adminUrl = c.getConnectionUri();
  await ensureAppRole(adminUrl, "kb_app");
  await ensurePlatformRole(adminUrl, "kb_platform");
  await runMigrations(adminUrl);
  const u = new URL(adminUrl);
  u.username = "kb_app";
  u.password = "kb_app";
  const p = new URL(adminUrl);
  p.username = "kb_platform";
  p.password = "kb_platform";
  return {
    adminUrl,
    appUrl: u.toString(),
    platformUrl: p.toString(),
    stop: async () => {
      await c.stop();
    },
  };
}
