import { defineMessages } from "@kb/ui";

export const NOT_FOUND_MESSAGES = defineMessages({
  vi: {
    title: "Không tìm thấy trang",
    description: "Đường dẫn này không tồn tại hoặc đã được chuyển đi. Kiểm tra lại địa chỉ, hoặc quay về trang tổng quan.",
    home: "Về trang tổng quan",
    back: "Quay lại trang trước",
    code: "Lỗi 404",
  },
  en: {
    title: "Page not found",
    description: "This link does not exist or has been moved. Check the address, or go back to the overview.",
    home: "Back to overview",
    back: "Go back",
    code: "Error 404",
  },
  zh: {
    title: "页面未找到",
    description: "该链接不存在或已被移动。请检查地址，或返回总览。",
    home: "返回总览",
    back: "返回上一页",
    code: "错误 404",
  },
});

export const APP_ERROR_MESSAGES = defineMessages({
  vi: {
    title: "Màn hình này gặp lỗi",
    description: "Dữ liệu của bạn không bị ảnh hưởng. Thử tải lại màn hình; nếu vẫn lỗi, quay về trang tổng quan.",
    retry: "Thử lại",
    home: "Về trang tổng quan",
  },
  en: {
    title: "Something went wrong on this screen",
    description: "Your data is not affected. Try reloading the screen; if it still fails, go back to the overview.",
    retry: "Try again",
    home: "Back to overview",
  },
  zh: {
    title: "此页面出现错误",
    description: "您的数据未受影响。请尝试重新加载；如仍出错，请返回总览。",
    retry: "重试",
    home: "返回总览",
  },
});
