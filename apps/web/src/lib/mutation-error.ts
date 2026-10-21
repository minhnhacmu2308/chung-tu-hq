import { pickMessages, toast } from "@kb/ui";
import { ERROR_MESSAGES } from "./errors.messages";
import { getFormatLocale } from "./format";

/** onError chung cho thao tác lưu: báo lỗi bằng toast để không có thao tác nào thất bại trong im lặng. */
export const toastMutationError = (title: string) => (error: unknown) =>
  toast({ tone: "danger", title, description: error instanceof Error ? error.message : pickMessages(ERROR_MESSAGES, getFormatLocale()).unknown });
