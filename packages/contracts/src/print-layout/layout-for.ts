import { PRINT_EDA } from "./eda-print.js";
import { PRINT_IDA } from "./ida-print.js";
import type { PrintLayout } from "./types.js";

/** Bố cục bản in theo loại tờ khai. */
export function printLayoutFor(kind: "IDA" | "EDA"): PrintLayout {
  return kind === "IDA" ? PRINT_IDA : PRINT_EDA;
}
