import { z } from "zod";

/** Tham số phân trang server (query string): `limit` 1–200 (mặc định 50), `offset` ≥ 0. */
export const PageQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(200).default(50), offset: z.coerce.number().int().min(0).default(0) });
export type PageQuery = z.infer<typeof PageQuerySchema>;

/** Một trang kết quả: `items` của đúng trang + `total` để dựng phân trang. */
export const pageOf = <T extends z.ZodTypeAny>(item: T) => z.object({ items: z.array(item), total: z.number().int().min(0), limit: z.number().int().min(1), offset: z.number().int().min(0) });
export type Page<T> = { items: T[]; total: number; limit: number; offset: number };

/** Danh sách không phân trang (API cũ, màn lọc/tìm phía client) vẫn bị chặn trên: không bao giờ trả quá số dòng này. */
export const UNPAGED_LIST_CAP = 500;
