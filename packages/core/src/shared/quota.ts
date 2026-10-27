// Hạn mức hồ sơ theo tháng – code thuần, dùng chung cho admin (nới hạn mức), identity (báo cho khách) và composition root (chặn tạo hồ sơ).
const VN_OFFSET = 7 * 3_600_000;

/** Tháng theo giờ Việt Nam "YYYY-MM" (hạn mức, báo cáo tính theo tháng VN). */
export const vnMonth = (at: Date) => new Date(at.getTime() + VN_OFFSET).toISOString().slice(0, 7);

/** Hồ sơ nới thêm còn hiệu lực: chỉ đúng tháng đã nới. */
export const activeQuotaBonus = (o: { quotaBonus: number; quotaBonusMonth: string | null }, now: Date) => (o.quotaBonusMonth === vnMonth(now) ? o.quotaBonus : 0);

/** Còn được tạo hồ sơ không. `totalAfter` = số hồ sơ trong tháng SAU khi tạo (đã gồm hồ sơ đang tạo) – không cộng thêm số đã dùng lần nữa. */
export const withinDossierQuota = (perMonth: number, o: { quotaBonus: number; quotaBonusMonth: string | null }, totalAfter: number, now: Date) =>
  totalAfter <= perMonth + activeQuotaBonus(o, now);
