import { z } from "zod";
import { DocKindSchema } from "../common.js";

/** Kết quả phân loại các trang của một file: mỗi chứng từ phát hiện gồm loại + danh sách trang. */
export const ClassifyResultSchema = z.object({
  documents: z.array(
    z.object({
      kind: DocKindSchema.describe("Loại chứng từ"),
      pages: z.array(z.number().int().positive()).min(1).describe("Số trang (bắt đầu từ 1) thuộc chứng từ này"),
      isDuplicateCopy: z.boolean().describe("Bản sao Duplicate/Triplicate/Copy của một chứng từ đã có trong file"),
      supplierHint: z.string().nullable().describe("Tên nhà cung cấp/hãng nếu nhận ra (để chọn skill riêng)"),
    }),
  ),
});
export type ClassifyResult = z.infer<typeof ClassifyResultSchema>;
