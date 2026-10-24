import { inboxFileAccepted } from "@kb/contracts";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { fixedClock } from "../../../shared/clock.js";
import { FakeDevMailProvider } from "./fake-dev-provider.js";

const clock = fixedClock("2026-10-22T03:00:00Z");

describe("FakeDevMailProvider", () => {
  it("kết nối chuyển thẳng về callback kèm code giả + state", async () => {
    const p = new FakeDevMailProvider("GMAIL", clock);
    expect(p.authorizeUrl("a.b", "http://localhost:3000/api/mailbox/oauth/callback")).toBe("http://localhost:3000/api/mailbox/oauth/callback?code=fake-gmail&state=a.b");
    expect((await new FakeDevMailProvider("OUTLOOK", clock).exchangeCode("fake-outlook", "x")).email).toBe("demo.outlook@khaibao.local");
  });

  it("lần đầu trả email mẫu cũ nhất trước; lấy từ mốc sau đó không còn gì; file PDF đọc được", async () => {
    const p = new FakeDevMailProvider("GMAIL", clock);
    const tokens = (await p.exchangeCode("fake-gmail", "x")).tokens;
    const first = await p.listMessages(tokens, new Date("2026-09-22T03:00:00Z"), 100);
    expect(first.length).toBeGreaterThanOrEqual(3);
    expect(first.map((m) => m.receivedAt.getTime())).toEqual([...first.map((m) => m.receivedAt.getTime())].sort((a, b) => a - b));
    expect(first.flatMap((m) => m.attachments).some((a) => !inboxFileAccepted(a.fileName, a.size))).toBe(true);
    expect(await p.listMessages(tokens, clock.now(), 100)).toEqual([]);

    for (const m of first)
      for (const a of m.attachments.filter((x) => x.mime === "application/pdf")) {
        const bytes = await p.getAttachment(tokens, m.id, a.id);
        const doc = await PDFDocument.load(bytes);
        expect([doc.getPageCount(), doc.isEncrypted]).toEqual([1, false]);
      }
  });
});
