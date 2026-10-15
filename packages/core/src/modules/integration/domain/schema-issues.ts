// Lỗi Zod khi kiểm payload FPT (E-SCHEMA) → câu tiếng Việt theo tên chỉ tiêu trong đặc tả, thay vì đường dẫn JSON.
import {
  fptKey, VN_EDA_CON_FIELDS, VN_EDA_FIELDS, VN_EDA_HANG_FIELDS, VN_IDA_FIELDS, VN_IDA_HANG_FIELDS, VN_IDA_KTG_FIELDS, VN_IDA_VANDON_FIELDS, type FptFieldMeta,
} from "@kb/contracts";

type Issue = { path: PropertyKey[]; message: string; code?: string; input?: unknown };

const labels = (fields: FptFieldMeta[]) => new Map(fields.map((f) => [fptKey(f.name) as string, `${f.label} (${f.name})`]));
const OBJECTS: Record<string, { name: string; labels: Map<string, string> }> = {
  objVN_IDA: { name: "Tờ khai", labels: labels(VN_IDA_FIELDS) },
  objVN_IDA_HANG: { name: "Dòng hàng", labels: labels(VN_IDA_HANG_FIELDS) },
  objVN_IDA_VANDON: { name: "Vận đơn", labels: labels(VN_IDA_VANDON_FIELDS) },
  objVN_IDA_KTG: { name: "Tờ khai trị giá", labels: labels(VN_IDA_KTG_FIELDS) },
  objVN_EDA: { name: "Tờ khai", labels: labels(VN_EDA_FIELDS) },
  objVN_EDA_HANG: { name: "Dòng hàng", labels: labels(VN_EDA_HANG_FIELDS) },
  objVN_EDA_CON: { name: "Container", labels: labels(VN_EDA_CON_FIELDS) },
};

export type SchemaIssueView = { code: "E-SCHEMA"; field: string; message: string; solution: string };

export function describeSchemaIssue(i: Issue): SchemaIssueView {
  const path = i.path.map(String);
  const obj = OBJECTS[path[0] ?? ""];
  const row = path.length === 3 && /^\d+$/.test(path[1]!) ? Number(path[1]) + 1 : null;
  const key = path.at(-1) ?? "";
  const label = obj?.labels.get(key);
  const where = `${obj?.name ?? path[0] ?? "Tờ khai"}${row ? ` dòng ${row}` : ""}`;
  const missing = i.input === undefined || /received undefined/.test(i.message);
  const message = label ? (missing ? `${where}: thiếu chỉ tiêu bắt buộc "${label}"` : `${where}: "${label}" không hợp lệ – ${i.message}`) : `${path.join(".")}: ${i.message}`;
  return { code: "E-SCHEMA", field: path.join("."), message, solution: missing ? "Nhập chỉ tiêu này trên tờ khai (Sửa ở bước Kiểm tra), rồi mở lại và truyền" : "Sửa chỉ tiêu trên tờ khai" };
}
