import { defineMessages } from "@kb/ui";

export const ADMIN_ERROR_MESSAGES = defineMessages({
  vi: {
    title: "Màn hình này gặp lỗi",
    description: "Chưa có thao tác nào bị thực hiện dở. Thử tải lại màn hình; nếu vẫn lỗi, quay về tổng quan vận hành.",
    retry: "Thử lại",
    back: "Về tổng quan vận hành",
  },
  en: {
    title: "This screen ran into an error",
    description: "No action was left half-done. Try reloading the screen; if it still fails, go back to the operations overview.",
    retry: "Try again",
    back: "Back to operations overview",
  },
  zh: {
    title: "此页面出错",
    description: "没有任何操作执行到一半。请重新加载页面；如仍出错，请返回运营概览。",
    retry: "重试",
    back: "返回运营概览",
  },
});
