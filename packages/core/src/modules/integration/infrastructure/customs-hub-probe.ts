// Probe "Kiểm tra kết nối" Customs Hub: chứng thư mặc định còn hạn; khi CUSTOMS_GATEWAY=fpt thêm tài khoản VNACCS + đăng nhập API FPT thật.
import type { Env } from "../../../config/env.js";
import type { Clock } from "../../../shared/clock.js";
import type { IntegrationProbe } from "../application/ports.js";
import type { VnaccsCredentialsReader } from "./fpt-vnaccs-gateway.js";

export type CustomsHubProbeDeps = {
  env: Pick<Env, "CUSTOMS_GATEWAY" | "FPT_API_BASE_URL">;
  clock: Clock;
  defaultCertificate: (orgId: string) => Promise<{ issuer: string; validTo: string } | null>;
  vnaccs?: VnaccsCredentialsReader;
  /** Client FPT (null = máy chủ thiếu FPT_API_*). */
  fpt?: { ping(): Promise<{ expiresAt: Date }> } | null;
};

const messageOf = (e: unknown) => (typeof e === "object" && e !== null && "message" in e && typeof (e as { message: unknown }).message === "string" ? (e as { message: string }).message : String(e));

export function customsHubProbe(deps: CustomsHubProbeDeps): IntegrationProbe {
  return {
    configured: true,
    probe: async (orgId) => {
      const cert = await deps.defaultCertificate(orgId);
      if (!cert) return { ok: false, detail: "Chưa chọn chứng thư số mặc định." };
      const days = (new Date(cert.validTo).getTime() - deps.clock.now().getTime()) / 86_400_000;
      if (days < 30) return { ok: false, detail: "Chứng thư số mặc định sắp hết hạn – Customs Hub từ chối ký thử (mã E-CERT-EXPIRING)." };
      if (deps.env.CUSTOMS_GATEWAY !== "fpt") return { ok: true, detail: `Ký thử thành công bằng chứng thư ${cert.issuer} · môi trường giả lập` };

      const account = await deps.vnaccs?.get(orgId);
      if (!account) return { ok: false, detail: "Chưa nhập tài khoản VNACCS – bấm \"Nhập tài khoản VNACCS\" trên thẻ này." };
      if (!deps.fpt) return { ok: false, detail: "Máy chủ chưa cấu hình kết nối FPT.VNACCS (FPT_API_BASE_URL, FPT_API_USERNAME, FPT_API_PASSWORD) – liên hệ quản trị KhaiBáo AI." };
      try {
        await deps.fpt.ping();
      } catch (e) {
        return { ok: false, detail: `Không đăng nhập được FPT.VNACCS: ${messageOf(e)}` };
      }
      const host = deps.env.FPT_API_BASE_URL ? new URL(deps.env.FPT_API_BASE_URL).host : "FPT.VNACCS";
      return { ok: true, detail: `Đăng nhập FPT.VNACCS thành công (${host}) · tài khoản VNACCS ${account.useR_ID} · terminal ${account.terminaL_ID} · chứng thư ${cert.issuer}` };
    },
  };
}
