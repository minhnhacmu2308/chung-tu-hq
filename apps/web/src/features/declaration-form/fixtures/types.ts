import type { FormValues } from "../form-state";

/** Giai đoạn tờ khai trong bản mẫu: nháp (chưa khai) → đã khai (có số, thuế, phân luồng) → đã thông quan (có cấp phép). */
export type Stage = "nhap" | "da-khai" | "thong-quan";

/** Dữ liệu giả của bản mẫu – khóa = tên trường VNACCS (hoặc APP_…), ngày dạng YYYY-MM-DD. */
export type PrototypeFixture = {
  code: string;
  /** Ô người khai nhập (thông tin chung) và từng dòng hàng. */
  declarant: FormValues;
  items: FormValues[];
  /** Ô Hải quan trả về theo giai đoạn (giai đoạn sau đã gồm dữ liệu giai đoạn trước); items theo đúng thứ tự dòng. */
  customsByStage: Record<Exclude<Stage, "nhap">, { header: FormValues; items: FormValues[] }>;
  messages: { code: string; name: string; at: string }[];
};
