// Bộ giao diện trợ lý AI. Chỉ hiển thị: gọi AI, lưu lịch sử, đính kèm file do app xử lý qua props.
import { useRef, useState, type ComponentProps, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "../lib/cn.js";
import { useMessages, type Messages } from "../lib/i18n.js";
import { RobotAvatar, type RobotAvatarState } from "./robot-avatar.js";

const PANEL_MESSAGES = {
  vi: { floating: "Khung nổi", docked: "Ghim bên cạnh", fullscreen: "Toàn màn hình", close: "Đóng trợ lý", history: "Lịch sử hội thoại", modes: "Chế độ hiển thị", assistant: "Trợ lý AI" },
  en: { floating: "Floating", docked: "Docked", fullscreen: "Full screen", close: "Close assistant", history: "Conversation history", modes: "Display mode", assistant: "AI assistant" },
  zh: { floating: "浮动窗口", docked: "停靠侧边", fullscreen: "全屏", close: "关闭助手", history: "对话历史", modes: "显示模式", assistant: "AI 助手" },
} satisfies Messages<"floating" | "docked" | "fullscreen" | "close" | "history" | "modes" | "assistant">;

const LAUNCHER_MESSAGES = { vi: { open: "Mở trợ lý AI" }, en: { open: "Open AI assistant" }, zh: { open: "打开 AI 助手" } } satisfies Messages<"open">;
const CHIPS_MESSAGES = { vi: { suggestions: "Gợi ý câu hỏi" }, en: { suggestions: "Suggested questions" }, zh: { suggestions: "推荐问题" } } satisfies Messages<"suggestions">;
const COMPOSER_MESSAGES = {
  vi: { input: "Nội dung tin nhắn", attach: "Đính kèm tệp", mic: "Nhập bằng giọng nói", send: "Gửi", removeFile: "Bỏ tệp", placeholder: "Nhập câu hỏi hoặc kéo tệp vào đây…" },
  en: { input: "Message", attach: "Attach files", mic: "Voice input", send: "Send", removeFile: "Remove file", placeholder: "Ask a question or drop files here…" },
  zh: { input: "消息内容", attach: "添加附件", mic: "语音输入", send: "发送", removeFile: "移除文件", placeholder: "输入问题或将文件拖到此处…" },
} satisfies Messages<"input" | "attach" | "mic" | "send" | "removeFile" | "placeholder">;

/** floating = khung nổi góc màn hình; docked = ghim cạnh phải, đẩy nội dung; fullscreen = toàn màn hình. */
export type AssistantMode = "floating" | "docked" | "fullscreen";

const iconBtn =
  "inline-flex h-8 w-8 items-center justify-center rounded-sm text-fg-muted hover:bg-surface-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus aria-pressed:bg-primary-subtle aria-pressed:text-primary-subtle-fg";

const Svg = ({ children }: { children: ReactNode }) => (
  <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);
const Icons = {
  sparkle: <Svg><path d="M8 1.5l1.3 3.7 3.7 1.3-3.7 1.3L8 11.5 6.7 7.8 3 6.5l3.7-1.3z" /><path d="M13 11l.5 1.5L15 13l-1.5.5L13 15l-.5-1.5L11 13l1.5-.5z" /></Svg>,
  floating: <Svg><path d="M3 3.5h10v7H7l-3 2.5v-2.5H3z" /></Svg>,
  docked: <Svg><rect x="2" y="3" width="12" height="10" rx="1.5" /><path d="M8.5 3v10" /></Svg>,
  fullscreen: <Svg><path d="M9.5 2.5h4v4M6.5 13.5h-4v-4M13.5 2.5L9 7M2.5 13.5L7 9" /></Svg>,
  close: <Svg><path d="M4 4l8 8M12 4l-8 8" /></Svg>,
  history: <Svg><rect x="2.5" y="2.5" width="11" height="11" rx="1.5" /><path d="M6 2.5v11" /></Svg>,
  attach: <Svg><path d="M13 7.5l-5.2 5.2a3 3 0 01-4.3-4.3L9 3a2 2 0 012.8 2.8l-5.4 5.4a1 1 0 01-1.4-1.4L10 4.8" /></Svg>,
  mic: <Svg><rect x="6" y="2" width="4" height="7.5" rx="2" /><path d="M3.5 8a4.5 4.5 0 009 0M8 12.5V14" /></Svg>,
  send: <Svg><path d="M8 13V3M4 7l4-4 4 4" /></Svg>,
};

/* ---------------- AssistantPanel ---------------- */

export type AssistantPanelProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: AssistantMode;
  onModeChange: (mode: AssistantMode) => void;
  name: ReactNode;
  /** Nhãn phụ cạnh tên, vd mã doanh nghiệp. */
  tag?: ReactNode;
  /** Số hội thoại cũ; bấm để mở lịch sử. Bỏ trống để ẩn nút. */
  historyCount?: number;
  onHistoryClick?: () => void;
  children: ReactNode;
  /** Ô soạn tin, luôn nằm đáy panel. */
  composer?: ReactNode;
  labels?: Partial<Record<AssistantMode | "close" | "history" | "modes" | "assistant", string>>;
  className?: string;
};

const PANEL_MODE: Record<AssistantMode, string> = {
  floating: "fixed bottom-4 right-4 z-40 h-[min(40rem,calc(100dvh-2rem))] w-[min(26rem,calc(100vw-2rem))] rounded-lg border shadow-lg motion-safe:animate-pop-in",
  // Màn nhỏ (< md) không đủ chỗ ghim cạnh nội dung → tự phủ toàn màn hình.
  docked: "sticky top-(--kb-shell-top) h-[calc(100dvh-var(--kb-shell-top))] w-full max-w-md shrink-0 border-l max-md:fixed max-md:inset-0 max-md:z-50 max-md:max-w-none max-md:border-l-0 motion-safe:animate-slide-in-right",
  fullscreen: "fixed inset-0 z-50 motion-safe:animate-fade-in",
};

/**
 * Khung trợ lý. Chế độ "docked" là phần tử trong luồng layout: đặt nó trong một flex row cạnh nội dung chính
 * để nội dung co lại thay vì bị che.
 */
export function AssistantPanel({
  open,
  onOpenChange,
  mode,
  onModeChange,
  name,
  tag,
  historyCount,
  onHistoryClick,
  children,
  composer,
  labels,
  className,
}: AssistantPanelProps) {
  const l = useMessages(PANEL_MESSAGES, labels); // gọi hook trước return sớm
  if (!open) return null;
  return (
    <aside
      aria-label={typeof name === "string" ? name : l.assistant}
      data-mode={mode}
      data-glass=""
      className={cn("flex flex-col border-border bg-surface text-fg", PANEL_MODE[mode], className)}
    >
      <header className="flex items-center gap-2 border-b border-border px-3 py-2">
        <span className="text-primary">{Icons.sparkle}</span>
        <span className="text-sm font-semibold">{name}</span>
        {tag && <span className="rounded-sm border border-border px-1.5 text-xs uppercase text-fg-subtle">{tag}</span>}
        <div className="ml-auto flex items-center gap-0.5 rounded-md border border-border p-0.5" role="group" aria-label={l.modes}>
          {(["floating", "docked", "fullscreen"] as const).map((m) => (
            <button key={m} type="button" className={iconBtn} aria-label={l[m]} aria-pressed={mode === m} onClick={() => onModeChange(m)}>
              {Icons[m]}
            </button>
          ))}
        </div>
        <button type="button" className={iconBtn} aria-label={l.close} onClick={() => onOpenChange(false)}>
          {Icons.close}
        </button>
      </header>
      {historyCount !== undefined && (
        <div className="px-3 pt-3">
          <button
            type="button"
            onClick={onHistoryClick}
            aria-label={`${l.history} (${historyCount})`}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs text-fg-muted hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            {Icons.history}
            {historyCount}
          </button>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3" aria-live="polite">
        {children}
      </div>
      {composer && <div className="border-t border-border p-3">{composer}</div>}
    </aside>
  );
}

/* ---------------- AssistantLauncher ---------------- */

export interface AssistantLauncherProps extends ComponentProps<"button"> {
  label?: string;
  /** Trạng thái robot: "thinking" khi trợ lý đang trả lời, mặc định "idle". */
  state?: RobotAvatarState;
}

/** Nút mở trợ lý: linh vật robot nổi ở góc dưới phải, quay đầu theo con trỏ. */
export function AssistantLauncher({ className, label, state = "idle", ...props }: AssistantLauncherProps) {
  const t = useMessages(LAUNCHER_MESSAGES);
  return (
    <button
      type="button"
      aria-label={label ?? t.open}
      className={cn(
        "fixed bottom-4 right-4 z-30 inline-flex items-center justify-center rounded-md p-1 transition-transform hover:-translate-y-0.5",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
        className,
      )}
      {...props}
    >
      <RobotAvatar state={state} size={72} />
    </button>
  );
}

/* ---------------- AssistantWelcome ---------------- */

export function AssistantWelcome({ avatar, role, name, description }: { avatar?: ReactNode; role?: ReactNode; name: ReactNode; description?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1.5 px-2 py-6 text-center">
      <div aria-hidden="true" className="mb-1 inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary-subtle text-primary-subtle-fg">
        {avatar ?? Icons.sparkle}
      </div>
      {role && <p className="text-xs text-fg-subtle">{role}</p>}
      <p className="text-base font-semibold">{name}</p>
      {description && <p className="max-w-sm text-sm text-fg-muted">{description}</p>}
    </div>
  );
}

/* ---------------- SuggestionChips ---------------- */

export function SuggestionChips({ suggestions, onPick, label }: { suggestions: readonly string[]; onPick: (s: string) => void; label?: string }) {
  const t = useMessages(CHIPS_MESSAGES);
  if (!suggestions.length) return null;
  return (
    <ul aria-label={label ?? t.suggestions} className="flex flex-col items-start gap-2">
      {suggestions.map((s) => (
        <li key={s}>
          <button
            type="button"
            onClick={() => onPick(s)}
            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-left text-xs text-fg-muted hover:border-primary hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            {s}
          </button>
        </li>
      ))}
    </ul>
  );
}

/* ---------------- ChatMessage ---------------- */

export type ChatMessageProps = { role: "user" | "assistant"; children: ReactNode; meta?: ReactNode; pending?: boolean };

export function ChatMessage({ role, children, meta, pending = false }: ChatMessageProps) {
  const mine = role === "user";
  return (
    <div className={cn("flex flex-col gap-1", mine ? "items-end" : "items-start")} data-role={role}>
      <div
        aria-busy={pending || undefined}
        className={cn(
          "max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm",
          mine ? "bg-primary text-primary-fg" : "bg-surface-muted text-fg",
          pending && "animate-pulse",
        )}
      >
        {children}
      </div>
      {meta && <span className="text-xs text-fg-subtle">{meta}</span>}
    </div>
  );
}

/* ---------------- ChatComposer ---------------- */

export type ChatComposerProps = {
  onSend: (text: string, files: File[]) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Đang chờ AI trả lời: khóa gửi. */
  busy?: boolean;
  /** Cho đính kèm file (vd chứng từ mẫu). */
  accept?: string;
  onMicClick?: () => void;
  labels?: Partial<Record<"input" | "attach" | "mic" | "send" | "removeFile" | "placeholder", string>>;
};

/** Enter = gửi, Shift+Enter = xuống dòng. Kéo-thả file vào ô để đính kèm. */
export function ChatComposer({
  onSend,
  placeholder,
  disabled = false,
  busy = false,
  accept,
  onMicClick,
  labels,
}: ChatComposerProps) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const l = useMessages(COMPOSER_MESSAGES, labels);
  const canSend = !disabled && !busy && (text.trim().length > 0 || files.length > 0);

  const send = () => {
    if (!canSend) return;
    onSend(text.trim(), files);
    setText("");
    setFiles([]);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div
      className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-2 focus-within:ring-2 focus-within:ring-focus"
      onDragOver={(e) => accept !== undefined && e.preventDefault()}
      onDrop={(e) => {
        if (accept === undefined) return;
        e.preventDefault();
        setFiles((f) => [...f, ...Array.from(e.dataTransfer.files)]);
      }}
    >
      {files.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="inline-flex items-center gap-1 rounded-sm bg-surface-muted px-2 py-0.5 text-xs text-fg-muted">
              {f.name}
              <button type="button" aria-label={`${l.removeFile} ${f.name}`} className="text-fg-subtle hover:text-fg" onClick={() => setFiles((x) => x.filter((_, j) => j !== i))}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <textarea
        aria-label={l.input}
        rows={2}
        value={text}
        disabled={disabled}
        placeholder={placeholder ?? l.placeholder}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        className="w-full resize-none bg-transparent px-1 text-sm text-fg placeholder:text-fg-subtle focus-visible:outline-none"
      />
      <div className="flex items-center gap-1">
        {accept !== undefined && (
          <>
            <button type="button" className={iconBtn} aria-label={l.attach} disabled={disabled} onClick={() => fileRef.current?.click()}>
              {Icons.attach}
            </button>
            <input
              ref={fileRef}
              type="file"
              multiple
              accept={accept}
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(e) => setFiles((f) => [...f, ...Array.from(e.target.files ?? [])])}
            />
          </>
        )}
        <span className="flex-1" />
        {onMicClick && (
          <button type="button" className={iconBtn} aria-label={l.mic} disabled={disabled} onClick={onMicClick}>
            {Icons.mic}
          </button>
        )}
        <button
          type="button"
          aria-label={l.send}
          disabled={!canSend}
          onClick={send}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-fg hover:bg-primary-hover disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        >
          {Icons.send}
        </button>
      </div>
    </div>
  );
}
