// @vitest-environment jsdom
// Lưu chỉ tiêu tờ khai: tải lại tờ khai, hồ sơ và bản truyền (sentChanges / cảnh báo 1.51 ở Review cập nhật ngay).
import { UiLocaleProvider } from "@kb/ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { customsKeys } from "@/api/customs";
import { declarationKeys } from "@/api/declaration";
import { dossierKeys } from "@/api/dossiers";
import { useSaveDeclarationEdits } from "./use-save-edits";

vi.mock("@/api/declaration", async (orig) => ({ ...(await orig<typeof import("@/api/declaration")>()), updateDeclarationField: vi.fn(async () => undefined) }));

describe("useSaveDeclarationEdits", () => {
  it("lưu xong → invalidate tờ khai, hồ sơ và customsKeys.submission của hồ sơ", async () => {
    const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const spy = vi.spyOn(qc, "invalidateQueries");
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>
        <UiLocaleProvider locale="vi">{children}</UiLocaleProvider>
      </QueryClientProvider>
    );
    const { result } = renderHook(() => useSaveDeclarationEdits("dos_028"), { wrapper });
    result.current.mutate([{ code: "CQHQ", value: "01AB" }]);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const keys = spy.mock.calls.map((c) => c[0]?.queryKey);
    expect(keys).toContainEqual(declarationKeys.view("dos_028"));
    expect(keys).toContainEqual(dossierKeys.all);
    expect(keys).toContainEqual(customsKeys.submission("dos_028"));
  });
});
