import { pickMessages, toast } from "@kb/ui";
import { ERROR_MESSAGES } from "./errors.messages";
import { getFormatLocale } from "./format";
import { errorText } from "./reason-codes";

/** onError chung cho thao tác lưu: báo lỗi bằng toast để không có thao tác nào thất bại trong im lặng. Lỗi có mã → dịch theo ngôn ngữ (errorText). */
export const toastMutationError = (title: string) => (error: unknown) =>
  toast({ tone: "danger", title, description: errorText(error, getFormatLocale(), pickMessages(ERROR_MESSAGES, getFormatLocale()).unknown) });
