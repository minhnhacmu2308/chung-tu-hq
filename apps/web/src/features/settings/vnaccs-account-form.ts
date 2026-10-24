// Logic thuần của form tài khoản VNACCS: kiểm theo schema dùng chung, trả lỗi theo trường.
import { VnaccsAccountInputSchema, type VnaccsAccountInput } from "@kb/contracts";
import { fill, pickMessages, type UiLocale } from "@kb/ui";
import { VNACCS_ACCOUNT_MESSAGES } from "./vnaccs-account.messages";

export type VnaccsForm = VnaccsAccountInput;
export type VnaccsFormErrors = Partial<Record<keyof VnaccsForm, string>>;

/** Form trống; User ID/Terminal ID điền sẵn khi đổi tài khoản (mật khẩu/terminal key luôn nhập lại – máy chủ không trả về). */
export const emptyVnaccsForm = (current?: { userId: string | null; terminalId: string | null }): VnaccsForm => ({
  userId: current?.userId ?? "",
  password: "",
  terminalId: current?.terminalId ?? "",
  terminalAccessKey: "",
});

const REQUIRED = {
  userId: "requiredUserId",
  password: "requiredPassword",
  terminalId: "requiredTerminalId",
  terminalAccessKey: "requiredTerminalAccessKey",
} as const;

/** Thông báo lỗi theo ngôn ngữ giao diện (schema dùng chung chỉ có tiếng Việt): dịch theo mã lỗi Zod. */
export function validateVnaccsForm(form: VnaccsForm, locale: UiLocale = "vi"): { ok: true; value: VnaccsAccountInput } | { ok: false; errors: VnaccsFormErrors } {
  const r = VnaccsAccountInputSchema.safeParse(form);
  if (r.success) return { ok: true, value: r.data };
  const t = pickMessages(VNACCS_ACCOUNT_MESSAGES, locale);
  const errors: VnaccsFormErrors = {};
  for (const i of r.error.issues) {
    const k = i.path[0] as keyof VnaccsForm;
    const message =
      i.code === "too_small" && k in REQUIRED ? t[REQUIRED[k]] : i.code === "too_big" ? fill(t.tooLong, { n: Number(i.maximum) }) : i.message;
    errors[k] ??= message;
  }
  return { ok: false, errors };
}
