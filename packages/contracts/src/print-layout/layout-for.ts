import { PRINT_IDA } from "./ida-print.js";
import type { PrintLayout } from "./types.js";

/** Bố cục bản in theo loại tờ khai. EDA: Task 2 (eda-print.ts). */
export function printLayoutFor(kind: "IDA" | "EDA"): PrintLayout {
  if (kind === "IDA") return PRINT_IDA;
  throw new Error("Chưa có bố cục bản in EDA");
}
