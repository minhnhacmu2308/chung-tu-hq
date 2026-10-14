// Test double dùng chung cho use case identity.
import type { Clock } from "../../../../shared/clock.js";
import type { Mailer, PasswordHasher, RateLimiter, TaxRegistryLookup } from "../ports.js";

export class FakeHasher implements PasswordHasher {
  async hash(p: string) {
    return `h:${p}`;
  }
  async verify(hash: string, p: string) {
    return hash === `h:${p}`;
  }
}

export class InMemoryRateLimiter implements RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();
  constructor(private clock: Clock) {}
  async hit(key: string, limit: number, windowSec: number) {
    const now = this.clock.now().getTime();
    const cur = this.hits.get(key);
    const entry = cur && cur.resetAt > now ? cur : { count: 0, resetAt: now + windowSec * 1000 };
    entry.count += 1;
    this.hits.set(key, entry);
    return { allowed: entry.count <= limit, remaining: Math.max(0, limit - entry.count) };
  }
}

export class RecordingMailer implements Mailer {
  readonly sent: { to: string; subject: string; text: string }[] = [];
  async send(msg: { to: string; subject: string; text: string }) {
    this.sent.push(msg);
  }
}

export class FakeTaxRegistry implements TaxRegistryLookup {
  async lookup(taxCode: string) {
    if (taxCode.endsWith("000")) return { found: false as const };
    return { found: true as const, name: `CÔNG TY TNHH MST ${taxCode}`, address: "Địa chỉ theo đăng ký thuế (dữ liệu giả)" };
  }
}
