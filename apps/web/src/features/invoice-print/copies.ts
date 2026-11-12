// Bộ bản in theo UCP600 17: ít nhất 1 bản gốc (ORIGINAL), còn lại là bản sao (COPY). Tối đa 10 + 10 như LcInputSchema.
export type CopyKind = "ORIGINAL" | "COPY";

export function copySet(originals: number, copies: number): CopyKind[] {
  const o = Math.min(10, Math.max(1, Math.trunc(originals)));
  const c = Math.min(10, Math.max(0, Math.trunc(copies)));
  return [...Array<CopyKind>(o).fill("ORIGINAL"), ...Array<CopyKind>(c).fill("COPY")];
}
