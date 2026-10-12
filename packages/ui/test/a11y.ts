import axe from "axe-core";
import { expect } from "vitest";

/**
 * Chạy axe-core trên phần tử đã render và yêu cầu 0 vi phạm.
 * Tắt "color-contrast" (jsdom không tính được màu thật – tương phản được test riêng ở theme/*.test.ts)
 * và "region" (component đứng riêng, không nằm trong landmark).
 */
export async function expectNoA11yViolations(container: Element): Promise<void> {
  const results = await axe.run(container, {
    rules: { "color-contrast": { enabled: false }, region: { enabled: false } },
  });
  expect(results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`)).toEqual([]);
}
