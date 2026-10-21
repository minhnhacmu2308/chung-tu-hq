// Tiêu đề tab trình duyệt của app khách. Metadata dựng phía máy chủ – chưa biết ngôn ngữ người dùng (lưu ở client)
// nên metadata lấy bản "vi"; khung app/khung đăng nhập đổi document.title theo ngôn ngữ ở phía client (usePageTitle).
// Chỉ import kiểu từ @kb/ui: file này được trang máy chủ dùng, không kéo code client vào.
import type { UiLocale } from "@kb/ui";

type TitleKey =
  | "brand" | "template" | "description" | "overview" | "dossiers" | "newDossier" | "customs" | "skills" | "settings"
  | "declarationSample" | "login" | "register" | "notFound";

export const APP_TITLES: Record<UiLocale, Record<TitleKey, string>> = {
  vi: {
    brand: "KhaiBáo AI",
    template: "%s · KhaiBáo AI",
    description: "Từ bộ chứng từ đến tờ khai hải quan trong một luồng.",
    overview: "Tổng quan",
    dossiers: "Hồ sơ khai báo",
    newDossier: "Tạo hồ sơ",
    customs: "Khai báo Hải quan",
    skills: "Cấu hình Skill AI",
    settings: "Tài khoản & tích hợp",
    declarationSample: "Bản mẫu tờ khai đầy đủ",
    login: "Đăng nhập",
    register: "Đăng ký",
    notFound: "Không tìm thấy trang",
  },
  en: {
    brand: "KhaiBáo AI",
    template: "%s · KhaiBáo AI",
    description: "From documents to customs declaration in one flow.",
    overview: "Overview",
    dossiers: "Dossiers",
    newDossier: "New dossier",
    customs: "Customs filing",
    skills: "AI Skill setup",
    settings: "Account & integrations",
    declarationSample: "Full declaration sample",
    login: "Sign in",
    register: "Register",
    notFound: "Page not found",
  },
  zh: {
    brand: "KhaiBáo AI",
    template: "%s · KhaiBáo AI",
    description: "从单证到海关报关单，一条流程完成。",
    overview: "总览",
    dossiers: "申报档案",
    newDossier: "新建档案",
    customs: "海关申报",
    skills: "AI Skill 配置",
    settings: "账户与集成",
    declarationSample: "完整报关单样本",
    login: "登录",
    register: "注册",
    notFound: "页面未找到",
  },
};

export type AppTitleKey = Exclude<TitleKey, "brand" | "template" | "description">;

/** Tiêu đề tab theo ngôn ngữ cho trang máy chủ (metadata) – luôn bản "vi". */
export const VI_TITLES = APP_TITLES.vi;

/** Khóa tiêu đề theo đường dẫn app khách; `undefined` = trang tự đặt tiêu đề (vd chi tiết hồ sơ). */
export function titleKeyForPath(pathname: string): AppTitleKey | undefined {
  const exact: Record<string, AppTitleKey> = {
    "/": "overview",
    "/dossiers": "dossiers",
    "/dossiers/new": "newDossier",
    "/customs": "customs",
    "/skills": "skills",
    "/settings": "settings",
    "/ban-mau/to-khai": "declarationSample",
    "/login": "login",
    "/register": "register",
  };
  return exact[pathname];
}
