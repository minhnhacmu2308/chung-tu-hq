import { EDA_MAPPINGS } from "./eda.js";
import { IDA_MAPPINGS } from "./ida.js";
import type { FieldMapping } from "./types.js";

export function mappingsFor(kind: "IDA" | "EDA"): FieldMapping[] {
  return kind === "IDA" ? IDA_MAPPINGS : EDA_MAPPINGS;
}
