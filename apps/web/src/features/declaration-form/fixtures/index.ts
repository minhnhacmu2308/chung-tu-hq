import type { FormValues } from "../form-state";
import { EDA_B13 } from "./eda-b13.vi";
import { IDA_A44 } from "./ida-a44.vi";
import type { PrototypeFixture, Stage } from "./types";

export type { PrototypeFixture, Stage } from "./types";

export const fixtureFor = (kind: "IDA" | "EDA"): PrototypeFixture => (kind === "IDA" ? IDA_A44 : EDA_B13);

/** Giá trị hiển thị ở một giai đoạn: ô người khai + ô Hải quan của giai đoạn đó (nháp: chưa có ô Hải quan). */
export function valuesAt(f: PrototypeFixture, stage: Stage): { header: FormValues; items: FormValues[] } {
  if (stage === "nhap") return { header: { ...f.declarant }, items: f.items.map((it) => ({ ...it })) };
  const hq = f.customsByStage[stage];
  return { header: { ...f.declarant, ...hq.header }, items: f.items.map((it, i) => ({ ...it, ...hq.items[i] })) };
}
