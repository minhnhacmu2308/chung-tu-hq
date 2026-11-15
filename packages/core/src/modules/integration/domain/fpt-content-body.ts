// Body nội dung tờ khai gửi FPT (IDA/EDA, IDA01/EDA01) – một chỗ duy nhất cho gateway (gửi thật) và xem trước (FPT_DEBUG_TRACE) để hai bên không lệch.
// IDA/EDA: output của schema cổng (Zod bỏ key lạ, đổi kiểu theo đặc tả). IDA01/EDA01: như IDA/EDA + số tờ khai ở đầu tờ khai (tK_ICN/tK_ECN)
// + chỉ thị Hải quan objVN_<KIND>_CTHQ gửi lại NGUYÊN VĂN (không qua schema – không trim, không đổi kiểu). Thuần.
import { EdaRequestSchema, IdaRequestSchema, shapeEdaBody, shapeIdaBody } from "@kb/contracts";
import { describeSchemaIssue, type SchemaIssueView } from "./schema-issues.js";

type Obj = Record<string, unknown>;
export const fptNumberField = (kind: "IDA" | "EDA") => (kind === "IDA" ? "tK_ICN" : "tK_ECN");

export function fptContentBody(
  kind: "IDA" | "EDA",
  request: unknown,
  amend?: { declarationNo: string },
): { ok: true; body: Obj } | { ok: false; issues: SchemaIssueView[] } {
  const parsed = (kind === "IDA" ? IdaRequestSchema : EdaRequestSchema).safeParse(request);
  if (!parsed.success) return { ok: false, issues: parsed.error.issues.map(describeSchemaIssue) };
  // Đủ mọi key theo mẫu request FPT, ô trống gửi ""/null (thiếu key → S0049) – shapeIdaBody / shapeEdaBody.
  const shape = (b: Obj) => (kind === "IDA" ? shapeIdaBody(b) : shapeEdaBody(b));
  if (!amend) return { ok: true, body: shape(parsed.data as Obj) };
  const cthqKey = `objVN_${kind}_CTHQ`;
  const cthq = (request as Obj | undefined)?.[cthqKey];
  const body = { ...(parsed.data as Obj), ...(cthq && typeof cthq === "object" ? { [cthqKey]: cthq } : {}) };
  const head = { ...((body[`objVN_${kind}`] ?? {}) as Obj), [fptNumberField(kind)]: Number(amend.declarationNo) };
  return { ok: true, body: shape({ ...body, [`objVN_${kind}`]: head }) };
}
