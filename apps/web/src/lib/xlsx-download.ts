// Tải một Blob (vd file Excel dựng trong trình duyệt) về máy với tên file cho trước.
export function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Thu hồi sau một nhịp: thu hồi ngay sau click làm Chrome hủy lượt tải.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
