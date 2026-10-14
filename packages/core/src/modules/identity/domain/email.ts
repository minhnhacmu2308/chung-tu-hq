export const normalizeEmail = (s: string) => s.trim().toLowerCase();

/** "chau.le@x" → "Chau Le" – tên tạm cho người được mời, giống mock. */
export function displayNameFromEmail(email: string): string {
  const local = normalizeEmail(email).split("@")[0] ?? "";
  return local
    .replace(/[._-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
