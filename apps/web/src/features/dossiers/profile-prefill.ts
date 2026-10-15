// Điền sẵn loại hình + chi cục ở form Tạo hồ sơ từ Mặc định khai báo (giá trị lưu dạng "mã – tên", form dùng mã).
const codePart = (v: string | undefined) => (v ? v.split(/\s+[–-]\s+/)[0]!.trim() : "");

export function prefillFromProfile<F extends { typeCode: string | null; customsOffice: string | null }>(form: F, values: Record<string, string>, touched: ReadonlySet<string>): F {
  const typeCode = !touched.has("typeCode") ? codePart(values["MA_LH"]) : "";
  const office = !touched.has("customsOffice") ? codePart(values["CQHQ"]) : "";
  if (!typeCode && !office) return form;
  return { ...form, ...(typeCode ? { typeCode } : {}), ...(office ? { customsOffice: office } : {}) };
}
