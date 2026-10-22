// File PDF một trang dựng tại chỗ (mock): dùng làm "file đính kèm" khi xem trước, vì chế độ mock không có kho file thật.
// Chỉ ký tự ASCII (font chuẩn Helvetica của PDF) – nội dung là tên file + dòng ghi chú mẫu.

const ascii = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[đĐ]/g, "d").replace(/[^\x20-\x7e]/g, "?").replace(/([\\()])/g, "\\$1");

export function samplePdf(lines: string[]): Blob {
  const text = lines.map((l, i) => `BT /F1 ${i === 0 ? 18 : 11} Tf 56 ${780 - i * 28} Td (${ascii(l)}) Tj ET`).join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`,
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((n) => `${String(n).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Blob([out], { type: "application/pdf" });
}
