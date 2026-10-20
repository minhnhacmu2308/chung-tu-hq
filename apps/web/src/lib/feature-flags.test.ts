import { afterEach, describe, expect, it, vi } from "vitest";
import { legacyReviewForm } from "./feature-flags";

afterEach(() => vi.unstubAllEnvs());

describe("legacyReviewForm", () => {
  it("không đặt biến → bản in (mặc định)", () => {
    vi.stubEnv("NEXT_PUBLIC_REVIEW_LEGACY_FORM", "");
    expect(legacyReviewForm()).toBe(false);
  });
  it('"1" → form cũ', () => {
    vi.stubEnv("NEXT_PUBLIC_REVIEW_LEGACY_FORM", "1");
    expect(legacyReviewForm()).toBe(true);
  });
  it('"true" → không bật (chỉ nhận "1")', () => {
    vi.stubEnv("NEXT_PUBLIC_REVIEW_LEGACY_FORM", "true");
    expect(legacyReviewForm()).toBe(false);
  });
});
