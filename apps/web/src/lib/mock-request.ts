// Giả lập gọi mạng: độ trễ + bản sao dữ liệu (tránh màn hình sửa thẳng vào "DB").
import { getDb, saveDb, type MockDb } from "@/mocks/db";

const MIN_DELAY = 250;
const MAX_DELAY = 650;

function delay() {
  const ms = MIN_DELAY + Math.random() * (MAX_DELAY - MIN_DELAY);
  return new Promise((r) => setTimeout(r, ms));
}

export class ApiError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

/** Đọc dữ liệu. */
export async function query<T>(fn: (db: MockDb) => T): Promise<T> {
  await delay();
  return structuredClone(fn(getDb()));
}

/** Ghi dữ liệu: chạy fn trên DB rồi lưu localStorage. Ném ApiError để báo lỗi nghiệp vụ. */
export async function mutate<T>(fn: (db: MockDb) => T): Promise<T> {
  await delay();
  const result = fn(getDb());
  saveDb();
  return structuredClone(result);
}

export function newId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export const nowIso = () => new Date().toISOString();
