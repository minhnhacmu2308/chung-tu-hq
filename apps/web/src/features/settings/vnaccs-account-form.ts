// Logic thuần của form tài khoản VNACCS: kiểm theo schema dùng chung, trả lỗi theo trường.
import { VnaccsAccountInputSchema, type VnaccsAccountInput } from "@kb/contracts";

export type VnaccsForm = VnaccsAccountInput;
export type VnaccsFormErrors = Partial<Record<keyof VnaccsForm, string>>;

/** Form trống; User ID/Terminal ID điền sẵn khi đổi tài khoản (mật khẩu/terminal key luôn nhập lại – máy chủ không trả về). */
export const emptyVnaccsForm = (current?: { userId: string | null; terminalId: string | null }): VnaccsForm => ({
  userId: current?.userId ?? "",
  password: "",
  terminalId: current?.terminalId ?? "",
  terminalAccessKey: "",
});

export function validateVnaccsForm(form: VnaccsForm): { ok: true; value: VnaccsAccountInput } | { ok: false; errors: VnaccsFormErrors } {
  const r = VnaccsAccountInputSchema.safeParse(form);
  if (r.success) return { ok: true, value: r.data };
  const errors: VnaccsFormErrors = {};
  for (const i of r.error.issues) {
    const k = i.path[0] as keyof VnaccsForm;
    errors[k] ??= i.message;
  }
  return { ok: false, errors };
}
