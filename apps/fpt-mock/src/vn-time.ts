// FPT trả ngày/giờ theo giờ Việt Nam (UTC+7, không có giờ mùa hè), dạng dd/MM/yyyy [HH:mm:ss].
const VN_OFFSET_MS = 7 * 3_600_000;
const pad = (n: number) => String(n).padStart(2, "0");

export function vnDate(now: Date): string {
  const d = new Date(now.getTime() + VN_OFFSET_MS);
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

export function vnDateTime(now: Date): string {
  const d = new Date(now.getTime() + VN_OFFSET_MS);
  return `${vnDate(now)} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

/** Giờ VN dạng HHmmss (trường giờ VNACCS Text 6). */
export function vnHms(at: Date): string {
  const d = new Date(at.getTime() + VN_OFFSET_MS);
  return `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
}

/** "dd/MM/yyyy" → số so sánh được (yyyymmdd); sai dạng/ngày không tồn tại → null. */
export function parseFptDate(s: string): number | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (!m) return null;
  const [dd, mm, yyyy] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(yyyy, mm - 1, dd));
  if (d.getUTCFullYear() !== yyyy || d.getUTCMonth() !== mm - 1 || d.getUTCDate() !== dd) return null;
  return yyyy * 10_000 + mm * 100 + dd;
}
