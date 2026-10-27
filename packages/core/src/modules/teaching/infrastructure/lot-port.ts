// TeachLotPort nối từ các module khác qua public index (composition): hồ sơ (dossier), bản đọc chứng từ (extraction), tờ khai nháp (declaration), tên doanh nghiệp (identity).
import type { Ctx } from "../../../shared/ctx.js";
import { asOrgId, asUserId } from "../../../shared/ids.js";
import type { DeclarationDeps } from "../../declaration/index.js";
import { getDeclarationView, mappingsFor } from "../../declaration/index.js";
import type { DossierDeps } from "../../dossier/index.js";
import { reviewedDocuments, type ExtractionDeps } from "../../extraction/index.js";
import type { IdentityDeps } from "../../identity/index.js";
import type { TeachLotPort } from "../application/ports.js";

const ident = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
/** Số vận đơn trên tờ khai đường biển có tiền tố ngày DDMMYY (220425FANS25040166) – hồ sơ lưu số gốc. */
export const billCandidates = (bill: string) => {
  const b = ident(bill);
  return [...new Set([b, ...(/^\d{6}[A-Z]/.test(b) ? [b.slice(6)] : [])])].filter((x) => x.length >= 4);
};

export function createTeachLotPort(m: { dossier: DossierDeps; extraction: ExtractionDeps; declaration: DeclarationDeps; identity: IdentityDeps }): TeachLotPort {
  // Đọc nội bộ (job / sau khi người dùng đã qua kiểm quyền của mục Dạy khai báo): ngữ cảnh hệ thống của đúng org.
  const sys = (orgId: string): Ctx => ({ orgId: asOrgId(orgId), userId: asUserId(""), role: "OWNER" });
  const labels = Object.fromEntries(mappingsFor("IDA").map((x) => [x.code, x.label]));
  return {
    findDossier: async (orgId, bill) => {
      for (const q of billCandidates(bill)) {
        const rows = await m.dossier.uow.asOrg(sys(orgId), (r) => r.dossiers.list(orgId, { q }, { limit: 20, offset: 0 }));
        const hit = rows.find((d) => d.billNo && ident(d.billNo) === q);
        if (hit) return { id: hit.id, code: hit.code };
      }
      return null;
    },
    draft: async (orgId, dossierId) => {
      const v = await getDeclarationView(m.declaration, sys(orgId), dossierId);
      if (!v.ok || !v.value.declaration) return null;
      const shipment = await m.declaration.shipments.latest(orgId, dossierId);
      return {
        fields: v.value.declaration.fields.map((f) => ({ code: f.code, label: f.label, value: f.value, source: f.source })),
        lines: v.value.items.map((it) => ({
          lineNo: it.lineNo, description: it.description, amount: it.amount, hs: it.hsConfirmed ?? it.hsSuggested ?? null, importRate: it.importDutyRate ?? null, vatRate: it.vatRate ?? null,
          partNo: shipment?.items.find((x) => x.lineNo === it.lineNo)?.partNo?.value ?? null,
        })),
      };
    },
    lot: async (orgId, dossierId) => {
      const d = await m.dossier.uow.asOrg(sys(orgId), (r) => r.dossiers.get(orgId, dossierId));
      if (!d) return null;
      const docs = await reviewedDocuments(m.extraction, sys(orgId), dossierId);
      const shipment = await m.declaration.shipments.latest(orgId, dossierId);
      return {
        docs: docs.ok ? docs.value.map((x) => ({ kind: x.kind, data: x.data })) : [],
        sellerName: shipment?.parties.seller.name.value ?? d.partner ?? null, mode: d.transportMode ?? null, office: d.customsOfficeCode ?? null,
      };
    },
    fieldLabels: () => labels,
    orgName: async (orgId) => (await m.identity.uow.asOrg(sys(orgId), (r) => r.orgs.findById(orgId)))?.name ?? orgId,
  };
}
