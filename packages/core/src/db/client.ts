import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index.js";

export function createDb(url: string, opts: { max?: number } = {}) {
  const sql = postgres(url, { max: opts.max ?? 10, prepare: false });
  const db = drizzle(sql, { schema, casing: "snake_case" });
  return Object.assign(db, { close: () => sql.end({ timeout: 5 }) });
}
export type Db = ReturnType<typeof createDb>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
