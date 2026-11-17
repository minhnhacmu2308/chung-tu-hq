"use client";
// FPT báo máy ký chưa mở cổng ký (SIGNING_PORT_CLOSED): lỗi môi trường ký số, không phải dữ liệu – một khung chung cho mọi nghiệp vụ
// (khai báo tờ khai, sửa đổi, định danh, KVGS): hướng dẫn mở cổng ký rồi gửi lại, không bảo sửa dữ liệu đã khai.
import { SIGNING_PORT_CLOSED } from "@kb/contracts";
import { Alert, useMessages } from "@kb/ui";
import { SIGNING_PORT_MESSAGES } from "./signing-port-alert.messages";

export const hasSigningPortError = (errors: readonly { code: string }[] | null | undefined) => Boolean(errors?.some((e) => e.code === SIGNING_PORT_CLOSED));

export function SigningPortAlert() {
  const t = useMessages(SIGNING_PORT_MESSAGES);
  return <Alert tone="warning" title={t.title}>{t.body}</Alert>;
}
