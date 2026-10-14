import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { ensureAppRole, runMigrations } from "./migrate.js";

export type TestDb = { adminUrl: string; appUrl: string; stop: () => Promise<void> };

/** Postgres thật trong Docker, migration đã chạy, có role kb_app. ~5–10s lần đầu. */
export async function startTestDb(): Promise<TestDb> {
  const c: StartedPostgreSqlContainer = await new PostgreSqlContainer("postgres:16-alpine").withDatabase("khaibao_test").start();
  const adminUrl = c.getConnectionUri();
  await ensureAppRole(adminUrl, "kb_app");
  await runMigrations(adminUrl);
  const u = new URL(adminUrl);
  u.username = "kb_app";
  u.password = "kb_app";
  return {
    adminUrl,
    appUrl: u.toString(),
    stop: async () => {
      await c.stop();
    },
  };
}
