// Nhật ký có cấu trúc (một dòng JSON / sự kiện) dùng chung web + worker: máy gom log (Loki, CloudWatch, Datadog…) lọc được theo
// requestId / jobId / orgId / dossierId. Không phụ thuộc thư viện ngoài; đổi sang pino sau chỉ cần giữ interface Logger.
export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogFields = Record<string, unknown>;

export interface Logger {
  debug(msg: string, fields?: LogFields): void;
  info(msg: string, fields?: LogFields): void;
  warn(msg: string, fields?: LogFields): void;
  error(msg: string, fields?: LogFields): void;
  /** Logger con mang sẵn một số trường (vd { jobId, orgId }) – mọi dòng ghi sau đều kèm theo. */
  child(fields: LogFields): Logger;
}

const LEVEL_RANK: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
/** Khóa có tên nhạy cảm bị che trước khi ghi – không bao giờ lộ mật khẩu/token/khóa API trong log. */
const SENSITIVE_KEY = /pass(word)?|secret|token|api[-_]?key|[_-]key$|authorization|cookie|private/i;

export function parseLogLevel(raw: string | undefined, fallback: LogLevel = "info"): LogLevel {
  return raw && raw in LEVEL_RANK ? (raw as LogLevel) : fallback;
}

/** Chuẩn hóa giá trị để JSON.stringify: Error → {name, message, stack}; khóa nhạy cảm → "[che]". Giới hạn độ sâu để không treo vì vòng tham chiếu. */
export function sanitizeFields(fields: LogFields, depth = 0): LogFields {
  const out: LogFields = {};
  for (const [k, v] of Object.entries(fields)) out[k] = SENSITIVE_KEY.test(k) ? "[che]" : sanitizeValue(v, depth);
  return out;
}

function sanitizeValue(v: unknown, depth: number): unknown {
  if (v instanceof Error) return { name: v.name, message: v.message, ...(v.stack ? { stack: v.stack } : {}), ...("code" in v ? { code: (v as { code: unknown }).code } : {}) };
  if (v === null || typeof v !== "object") return typeof v === "bigint" ? v.toString() : v;
  if (depth >= 4) return "[sâu]";
  if (Array.isArray(v)) return v.slice(0, 50).map((x) => sanitizeValue(x, depth + 1));
  if (v instanceof Date) return v.toISOString();
  return sanitizeFields(v as LogFields, depth + 1);
}

export type LoggerOptions = {
  /** Mức thấp nhất được ghi; mặc định LOG_LEVEL hoặc "info". */
  level?: LogLevel;
  /** Tên tiến trình: "web" | "worker" | tên script. */
  name?: string;
  /** Nơi ghi một dòng; mặc định stdout (error/warn → stderr). Test truyền hàm thu dòng. */
  sink?: (line: string, level: LogLevel) => void;
  now?: () => Date;
};

export function createLogger(opts: LoggerOptions = {}): Logger {
  const level = opts.level ?? parseLogLevel(process.env["LOG_LEVEL"]);
  const now = opts.now ?? (() => new Date());
  const sink = opts.sink ?? ((line, lvl) => (LEVEL_RANK[lvl] >= LEVEL_RANK.warn ? process.stderr : process.stdout).write(`${line}\n`));
  const make = (base: LogFields): Logger => {
    const write = (lvl: LogLevel, msg: string, fields?: LogFields) => {
      if (LEVEL_RANK[lvl] < LEVEL_RANK[level]) return;
      const record = { t: now().toISOString(), level: lvl, ...(opts.name ? { name: opts.name } : {}), msg, ...sanitizeFields({ ...base, ...(fields ?? {}) }) };
      let line: string;
      try {
        line = JSON.stringify(record);
      } catch {
        line = JSON.stringify({ t: record.t, level: lvl, msg, logError: "không stringify được trường kèm theo" });
      }
      sink(line, lvl);
    };
    return {
      debug: (m, f) => write("debug", m, f),
      info: (m, f) => write("info", m, f),
      warn: (m, f) => write("warn", m, f),
      error: (m, f) => write("error", m, f),
      child: (fields) => make({ ...base, ...fields }),
    };
  };
  return make({});
}

/** Logger không ghi gì – cho test/use case không quan tâm log. */
export const silentLogger: Logger = { debug() {}, info() {}, warn() {}, error() {}, child: () => silentLogger };
