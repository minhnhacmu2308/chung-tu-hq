import * as AvatarPrimitive from "@radix-ui/react-avatar";
import { cva, type VariantProps } from "class-variance-authority";
import { useMessages, type Messages } from "../lib/i18n.js";
import { cn } from "../lib/cn.js";

const MESSAGES = {
  vi: { more: "và {n} người khác" },
  en: { more: "and {n} more" },
} satisfies Messages<"more">;

const avatarVariants = cva(
  "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-subtle font-semibold text-primary-subtle-fg",
  {
    variants: { size: { sm: "h-6 w-6 text-xs", md: "h-8 w-8 text-xs", lg: "h-10 w-10 text-sm" } },
    defaultVariants: { size: "md" },
  },
);

/** 2 chữ cái đầu của 2 từ cuối trong tên (Lê Minh Châu → MC), giống SidebarUser. */
export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(-2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

export type AvatarProps = VariantProps<typeof avatarVariants> & {
  name: string;
  src?: string | undefined;
  initials?: string;
  className?: string;
};

export function Avatar({ name, src, initials, size, className }: AvatarProps) {
  return (
    <AvatarPrimitive.Root className={cn(avatarVariants({ size }), className)} role="img" aria-label={name}>
      {src && <AvatarPrimitive.Image src={src} alt="" className="h-full w-full object-cover" />}
      {/* Không có ảnh: hiện chữ ngay; có ảnh: chờ ngắn để tránh nháy chữ khi ảnh tải nhanh */}
      <AvatarPrimitive.Fallback aria-hidden="true" {...(src ? { delayMs: 300 } : {})}>
        {initials ?? initialsOf(name)}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}

export type AvatarGroupProps = VariantProps<typeof avatarVariants> & {
  people: readonly { name: string; src?: string }[];
  /** Số avatar hiển thị tối đa, phần còn lại gộp thành "+N". */
  max?: number;
  labels?: Partial<Record<"more", string>>;
  className?: string;
};

export function AvatarGroup({ people, max = 4, size, labels, className }: AvatarGroupProps) {
  const t = useMessages(MESSAGES, labels);
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  return (
    <div role="group" aria-label={people.map((p) => p.name).join(", ")} className={cn("flex items-center -space-x-2", className)}>
      {shown.map((p, i) => (
        <Avatar key={`${p.name}-${i}`} name={p.name} src={p.src} size={size} className="ring-2 ring-surface" />
      ))}
      {rest > 0 && (
        <span
          role="img"
          aria-label={t.more.replace("{n}", String(rest))}
          className={cn(avatarVariants({ size }), "bg-surface-muted text-fg-muted ring-2 ring-surface")}
        >
          <span aria-hidden="true">+{rest}</span>
        </span>
      )}
    </div>
  );
}
