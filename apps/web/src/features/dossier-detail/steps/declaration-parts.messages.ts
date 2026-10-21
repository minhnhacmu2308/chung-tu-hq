// Nhãn mảnh giao diện dùng chung bước 4–6 (declaration-parts.tsx).
import { defineMessages } from "@kb/ui";

export const DECLARATION_PARTS_MESSAGES = defineMessages({
  vi: {
    sourcePrefix: "Nguồn: ",
    loading: "Đang tải",
    loadFailed: "Không tải được dữ liệu",
    retry: "Thử lại",
    unknownError: "Lỗi không xác định",
    genericError: "Có lỗi xảy ra, thử lại sau",
  },
  en: {
    sourcePrefix: "Source: ",
    loading: "Loading",
    loadFailed: "Couldn't load data",
    retry: "Retry",
    unknownError: "Unknown error",
    genericError: "Something went wrong, please try again later",
  },
  zh: {
    sourcePrefix: "来源：",
    loading: "加载中",
    loadFailed: "无法加载数据",
    retry: "重试",
    unknownError: "未知错误",
    genericError: "出现错误，请稍后重试",
  },
});
