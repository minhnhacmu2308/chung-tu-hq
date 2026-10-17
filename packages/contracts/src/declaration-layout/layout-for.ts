import { LAYOUT_EDA } from "./eda.js";
import { LAYOUT_IDA } from "./ida.js";
import type { DeclarationLayout } from "./types.js";

/** Bố cục theo mẫu tờ khai: IDA (Mẫu 01) / EDA (Mẫu 02). */
export const layoutFor = (kind: "IDA" | "EDA"): DeclarationLayout => (kind === "IDA" ? LAYOUT_IDA : LAYOUT_EDA);
