"use client";
// Nút bánh răng trong panel Thông báo → cài đặt thông báo trên máy tính (+ nút gửi thử, chỉ chế độ mock để demo).
import { Badge, Button, Field, Popover, PopoverContent, PopoverTrigger, Select, Tooltip, useMessages, type Tone } from "@kb/ui";
import { useMutation } from "@tanstack/react-query";
import { BellRing, Send, Settings2 } from "lucide-react";
import { sendTestNotification } from "@/api/session";
import { dataSource } from "@/lib/data-source";
import { toastMutationError } from "@/lib/mutation-error";
import { useDesktopNotifications, type DesktopPermission, type DesktopScope } from "./desktop-notifications";
import { DESKTOP_NOTIFICATION_MESSAGES } from "./shell.messages";

type LabelKey = keyof (typeof DESKTOP_NOTIFICATION_MESSAGES)["vi"];
// Quyền của trình duyệt (không phải trạng thái nghiệp vụ) → màu huy hiệu + khóa nhãn.
const STATE: Record<DesktopPermission, [Tone, LabelKey]> = {
  granted: ["success", "stateOn"],
  default: ["neutral", "stateOff"],
  denied: ["danger", "stateBlocked"],
  unsupported: ["neutral", "stateUnsupported"],
};

export function DesktopNotificationSettings() {
  const t = useMessages(DESKTOP_NOTIFICATION_MESSAGES);
  const { scope, setScope, permission, enable } = useDesktopNotifications();
  const [tone, stateKey] = STATE[permission];
  const test = useMutation({ mutationFn: sendTestNotification, onError: toastMutationError(t.sendTestFailed) });
  return (
    <Popover>
      <Tooltip content={t.settings}>
        <PopoverTrigger asChild>
          <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" aria-label={t.settings}>
            <Settings2 className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent align="end" collisionPadding={16} className="w-80" showClose aria-label={t.title}>
        <div className="flex flex-col gap-3 text-sm">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <BellRing aria-hidden="true" className="h-4 w-4 text-fg-muted" />
              <p className="font-medium text-fg">{t.title}</p>
              <Badge tone={tone}>{t[stateKey]}</Badge>
            </div>
            <p className="text-fg-muted">{t.desc}</p>
          </div>
          {permission === "denied" && <p className="text-fg-muted">{t.blockedHelp}</p>}
          {permission === "unsupported" && <p className="text-fg-muted">{t.unsupportedHelp}</p>}
          {permission === "default" && (
            <Button size="sm" className="self-start" onClick={() => void enable()}>
              {t.enable}
            </Button>
          )}
          <Field label={t.scope}>
            <Select
              value={scope}
              disabled={permission === "unsupported"}
              onChange={(e) => setScope(e.target.value as DesktopScope)}
              options={[
                { value: "customs", label: t.scopeCustoms },
                { value: "all", label: t.scopeAll },
                { value: "off", label: t.scopeOff },
              ]}
            />
          </Field>
          {dataSource() === "mock" && (
            <Button size="sm" variant="secondary" className="self-start" leftIcon={<Send className="h-4 w-4" />} loading={test.isPending} onClick={() => test.mutate()}>
              {t.sendTest}
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
