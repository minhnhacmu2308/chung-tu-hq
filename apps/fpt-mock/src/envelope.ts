// Vỏ phản hồi chung của FPT.VNACCS – đúng thứ tự key như response thật (OUTPUT_API_THANH_CONG / thatbai).
export type FptError = { errorCode: string; indexCode: string; nameCode: string; errorContent: string; proposedSolution: string; rowPosition: string };

export function fptEnvelope(account: unknown, patch: { errorList?: FptError[]; objIDA?: unknown[]; objEDA?: unknown[]; objAMA?: unknown[] } = {}) {
  return {
    objVNACCS_ACCOUNT: account ?? null,
    errorList: patch.errorList ?? null,
    objIDA: patch.objIDA ?? null,
    objEDA: patch.objEDA ?? null,
    objAMA: patch.objAMA ?? null,
    vaF8030: null,
    vaF8010: null,
    vaE8000: null,
    vaE4740: null,
    vaL0020: null,
    vaD8000: null,
    vaD4870: null,
  };
}

/** Lỗi chuẩn VNACCS đã thấy trong mẫu thật. FPT gửi A0004 hai lần giống hệt nhau – giữ nguyên. */
export const WRONG_PASSWORD: FptError = {
  errorCode: "A0004", indexCode: "A0004", nameCode: "Password",
  errorContent: "Mật khẩu không hợp lệ.", proposedSolution: "Nhập mật khẩu chính xác.", rowPosition: "0000",
};
export const DEPARTURE_IN_PAST: FptError = {
  errorCode: "S1139", indexCode: "SYM", nameCode: "Departure Planned Date",
  errorContent: "Ngày hàng đi dự kiến là ngày trong quá khứ khi so với Ngày khai báo (Dự kiến)\r\n", proposedSolution: "Kiểm tra nội dung đã nhập.\r\n", rowPosition: "0000",
};

/** Lỗi do mock tự đặt (chưa có mẫu thật) – mã có tiền tố MOCK- để không nhầm với mã VNACCS. */
export const mockError = (code: "MOCK-REQ" | "MOCK-FMT", index: string, name: string, content: string, row = 0): FptError => ({
  errorCode: code, indexCode: index, nameCode: name, errorContent: content,
  proposedSolution: code === "MOCK-REQ" ? "Nhập chỉ tiêu bắt buộc." : "Kiểm tra định dạng dữ liệu.", rowPosition: String(row).padStart(4, "0"),
});
