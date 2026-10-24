import { defineMessages } from "@kb/ui";

/** Thông báo lỗi do chính app sinh ra (lỗi mạng, sai định dạng, lỗi không rõ). Lỗi backend trả về giữ nguyên. */
export const ERROR_MESSAGES = defineMessages({
  vi: {
    network: "Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.",
    contractMismatch: "Dữ liệu máy chủ trả về không đúng định dạng.",
    serverError: "Lỗi máy chủ ({status})",
    unknown: "Có lỗi xảy ra, thử lại sau.",
  },
  en: {
    network: "Couldn't reach the server. Check your network and try again.",
    contractMismatch: "The server returned data in an unexpected format.",
    serverError: "Server error ({status})",
    unknown: "Something went wrong. Please try again later.",
  },
  zh: {
    network: "无法连接服务器。请检查网络后重试。",
    contractMismatch: "服务器返回的数据格式不正确。",
    serverError: "服务器错误（{status}）",
    unknown: "发生错误，请稍后重试。",
  },
});
