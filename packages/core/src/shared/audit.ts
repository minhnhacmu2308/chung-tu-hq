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

// ---------------------------------------------------------------------------------------------------------------------------------
// field_audit (bất biến 6): người dùng sửa trường → một dòng append-only. Bảng dùng chung (db/schema/shared.ts); mỗi module ghi qua repo
// `fieldAudit` trong uow của chính mình, CÙNG transaction với lệnh sửa – tiến trình chết giữa chừng thì mất cả hai, không mất riêng dòng audit.

export type FieldAuditSource = "HS_CONFIRM" | "DECL_EDIT" | "AMA_EDIT" | "CHARGE_EDIT" | "HYS_FILL" | "CONT_LIST_EDIT" | "CATALOG_EDIT";
/** Một ô đổi: `dossierId` là khóa đối tượng của lịch sử (hồ sơ; danh mục hàng hóa = id mặt hàng). */
export type FieldAuditEntry = { dossierId: string; key: string; oldValue: string; newValue: string; source: FieldAuditSource };
export type FieldAuditRecord = FieldAuditEntry & { id: string; orgId: string; userId: string; at: Date };

/** Repo field_audit trong uow của module (chỉ INSERT/SELECT). `userId` lấy từ ctx, `at` do use case truyền (deps.clock). */
export interface FieldAuditRepo {
  append(ctx: { orgId: OrgId; userId: UserId }, at: Date, entries: readonly FieldAuditEntry[]): Promise<void>;
  /** Lịch sử của một đối tượng theo nguồn, mới nhất trước, tối đa `limit` dòng. */
  listForObject(orgId: OrgId, objectId: string, source: FieldAuditSource, limit: number): Promise<FieldAuditRecord[]>;
}

/** Cho test: bảng field_audit trong bộ nhớ, dùng chung cho các uow in-memory; `repo(org)` mô phỏng RLS theo org của transaction. */
export class InMemoryFieldAuditLog {
  readonly rows: FieldAuditRecord[] = [];
  private seq = 0;
  repo(txOrgId: string): FieldAuditRepo {
    return {
      append: async (ctx, at, entries) => {
        if (ctx.orgId !== txOrgId) throw new Error("new row violates row-level security policy (field_audit)");
        for (const e of entries) this.rows.push({ ...e, id: `fld_${++this.seq}`, orgId: ctx.orgId, userId: ctx.userId, at });
      },
      listForObject: async (orgId, objectId, source, limit) =>
        this.rows
          .filter((r) => r.orgId === txOrgId && r.orgId === orgId && r.dossierId === objectId && r.source === source)
          .map((r, i) => ({ r, i }))
          .sort((a, b) => b.r.at.getTime() - a.r.at.getTime() || b.i - a.i)
          .slice(0, limit)
          .map(({ r }) => ({ ...r })),
    };
  }
}
