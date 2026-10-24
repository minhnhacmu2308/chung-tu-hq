// Nhật ký hoạt động của doanh nghiệp (org_audit, append-only): ai làm gì với đối tượng nào – mời/khóa thành viên, chuyển chủ sở hữu,
// đổi cấu hình, chứng thư, tài khoản VNACCS, hộp thư, duyệt/mở lại tờ khai, hủy hồ sơ, danh mục hàng hóa, skill.
// Khác field_audit (sửa từng trường chứng từ) và admin_audit (đội vận hành). Module chỉ mô tả sự kiện; identity ghi bảng.
import type { OrgId, UserId } from "./ids.js";

export type OrgAuditEntry = {
  /** Mã hành động ổn định, SCREAMING_SNAKE: MEMBER_INVITED, DECLARATION_APPROVED… – giao diện dịch theo mã. */
  action: string;
  /** Loại đối tượng: member, organization, certificate, vnaccs_account, mailbox, dossier, declaration, product, skill. */
  targetType: string;
  targetId: string;
  /** Tên hiển thị của đối tượng tại thời điểm đó (email thành viên, mã hồ sơ…) – đối tượng bị xóa vẫn đọc được. */
  targetLabel: string;
  /** Chi tiết nhỏ (vai trò cũ/mới, số dòng…) – không chứa bí mật. */
  detail?: Record<string, unknown>;
};

export interface OrgAuditWriter {
  record(ctx: { orgId: OrgId; userId: UserId }, entry: OrgAuditEntry): Promise<void>;
}

export const noopOrgAudit: OrgAuditWriter = { record: async () => {} };

/** Cho test: ghi lại mọi sự kiện. */
export class RecordingOrgAudit implements OrgAuditWriter {
  readonly entries: ({ orgId: string; userId: string } & OrgAuditEntry)[] = [];
  async record(ctx: { orgId: OrgId; userId: UserId }, entry: OrgAuditEntry) {
    this.entries.push({ orgId: ctx.orgId, userId: ctx.userId, ...entry });
  }
}
