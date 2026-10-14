import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const migrationsFolder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../drizzle");

/** Chạy migration bằng admin, rồi cấp quyền cho role ứng dụng trên mọi bảng hiện có và bảng tạo sau. */
export async function runMigrations(adminUrl: string) {
  const sql = postgres(adminUrl, { max: 1 });
  try {
    await migrate(drizzle(sql), { migrationsFolder });
    await sql`grant usage on schema public to kb_app`;
    await sql`grant select, insert, update, delete on all tables in schema public to kb_app`;
    await sql`alter default privileges in schema public grant select, insert, update, delete on tables to kb_app`;
    // kb_platform (ADR 0006): chỉ DML, không DDL. Cấp khi role đã có (ensurePlatformRole).
    const rows = await sql<{ exists: boolean }[]>`select exists (select 1 from pg_roles where rolname = 'kb_platform') as exists`;
    if (rows[0]?.exists) {
      await sql`grant usage on schema public to kb_platform`;
      await sql`grant select, insert, update, delete on all tables in schema public to kb_platform`;
      await sql`alter default privileges in schema public grant select, insert, update, delete on tables to kb_platform`;
    }
  } finally {
    await sql.end();
  }
}

export async function ensureAppRole(adminUrl: string, password: string) {
  const sql = postgres(adminUrl, { max: 1 });
  try {
    const pw = password.replaceAll("'", "''");
    await sql.unsafe(
      `do $$ begin if not exists (select 1 from pg_roles where rolname = 'kb_app') then create role kb_app login password '${pw}'; end if; end $$;`,
    );
  } finally {
    await sql.end();
  }
}

/**
 * Role của khu Quản trị hệ thống (ADR 0006): đăng nhập được, BYPASSRLS để đọc xuyên doanh nghiệp, không sở hữu bảng.
 * Cần user migration là superuser (dev/test: kb_admin của docker). Gọi trước runMigrations để được cấp quyền bảng.
 */
export async function ensurePlatformRole(adminUrl: string, password: string) {
  const sql = postgres(adminUrl, { max: 1 });
  try {
    const pw = password.replaceAll("'", "''");
    await sql.unsafe(
      `do $$ begin if not exists (select 1 from pg_roles where rolname = 'kb_platform') then create role kb_platform login bypassrls password '${pw}'; end if; end $$;`,
    );
  } finally {
    await sql.end();
  }
}

/** URL kết nối của kb_platform: DATABASE_PLATFORM_URL, hoặc DATABASE_URL đổi user thành kb_platform (cùng mật khẩu). */
export function platformDbUrl(env: { DATABASE_URL: string; DATABASE_PLATFORM_URL?: string | undefined }): string {
  if (env.DATABASE_PLATFORM_URL) return env.DATABASE_PLATFORM_URL;
  const u = new URL(env.DATABASE_URL);
  u.username = "kb_platform";
  return u.toString();
}

/** Xóa toàn bộ dữ liệu + lịch sử migration (schema `drizzle`) để migrate lại từ đầu. Chỉ dev/test. */
export async function resetSchema(adminUrl: string) {
  const sql = postgres(adminUrl, { max: 1 });
  try {
    await sql`drop schema if exists drizzle cascade`;
    await sql`drop schema public cascade`;
    await sql`create schema public`;
    await sql`grant usage on schema public to kb_app`;
    await sql`do $$ begin if exists (select 1 from pg_roles where rolname = 'kb_platform') then grant usage on schema public to kb_platform; end if; end $$`;
  } finally {
    await sql.end();
  }
}
