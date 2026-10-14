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

/** Xóa toàn bộ dữ liệu + lịch sử migration (schema `drizzle`) để migrate lại từ đầu. Chỉ dev/test. */
export async function resetSchema(adminUrl: string) {
  const sql = postgres(adminUrl, { max: 1 });
  try {
    await sql`drop schema if exists drizzle cascade`;
    await sql`drop schema public cascade`;
    await sql`create schema public`;
    await sql`grant usage on schema public to kb_app`;
  } finally {
    await sql.end();
  }
}
