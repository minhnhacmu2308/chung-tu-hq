import { defineMessages } from "@kb/ui";

export const INTEGRATIONS_TAB_MESSAGES = defineMessages({
  vi: {
    keysTitle: "Thông tin đăng nhập được giữ ở máy chủ",
    keysBody: "Quyền đọc hộp thư và mật khẩu VNACCS lưu mã hóa phía máy chủ, không bao giờ gửi xuống trình duyệt hay hiện trên màn hình này.",
    vnaccsTitle: "Khai báo Hải quan (VNACCS)",
    vnaccsDesc: "Tài khoản VNACCS của doanh nghiệp, dùng để truyền tờ khai tới Hải quan.",
    testOk: "Đăng nhập VNACCS thành công",
    testFail: "Không đăng nhập được VNACCS",
    checked: "Kiểm tra {when}",
    notChecked: "Chưa kiểm tra",
    test: "Kiểm tra kết nối",
  },
  en: {
    keysTitle: "Sign-in details are kept on the server",
    keysBody: "Mailbox access and the VNACCS password are stored encrypted on the server and are never sent to the browser or shown on this screen.",
    vnaccsTitle: "Customs declaration (VNACCS)",
    vnaccsDesc: "Your organization's VNACCS account, used to send declarations to Customs.",
    testOk: "Signed in to VNACCS successfully",
    testFail: "Couldn't sign in to VNACCS",
    checked: "Checked {when}",
    notChecked: "Not checked yet",
    test: "Test connection",
  },
  zh: {
    keysTitle: "登录信息保存在服务器",
    keysBody: "邮箱访问权限和 VNACCS 密码均加密保存在服务器端，绝不会发送到浏览器或显示在此页面。",
    vnaccsTitle: "海关申报（VNACCS）",
    vnaccsDesc: "企业的 VNACCS 账户，用于向海关传送报关单。",
    testOk: "VNACCS 登录成功",
    testFail: "无法登录 VNACCS",
    checked: "检查于 {when}",
    notChecked: "尚未检查",
    test: "测试连接",
  },
});
