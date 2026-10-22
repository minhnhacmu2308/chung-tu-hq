import { ulid } from "ulid";

declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

export type OrgId = Brand<string, "OrgId">;
export type UserId = Brand<string, "UserId">;
export type DossierId = Brand<string, "DossierId">;
export type DocumentId = Brand<string, "DocumentId">;
export type SkillId = Brand<string, "SkillId">;
export type DeclarationId = Brand<string, "DeclarationId">;

export const asOrgId = (s: string) => s as OrgId;
export const asUserId = (s: string) => s as UserId;
export const asDossierId = (s: string) => s as DossierId;
export const asDocumentId = (s: string) => s as DocumentId;
export const asSkillId = (s: string) => s as SkillId;
export const asDeclarationId = (s: string) => s as DeclarationId;

export type IdPrefix =
  | "org" | "usr" | "mem" | "ses" | "tok" | "dos" | "doc" | "fld" | "chk" | "itm" | "dec" | "run" | "msg" | "sk" | "smp" | "ntf" | "use" | "job" | "cert" | "aud" | "ann" | "sec" | "hsj" | "sug" | "pam" | "pal" | "prd";

export interface IdGen {
  next(prefix: IdPrefix): string;
}

export const ulidIdGen: IdGen = { next: (prefix) => `${prefix}_${ulid()}` };

/** Cho test: id tăng dần, dễ đọc. */
export function sequentialIdGen(): IdGen {
  let n = 0;
  return { next: (prefix) => `${prefix}_${String(++n).padStart(4, "0")}` };
}
