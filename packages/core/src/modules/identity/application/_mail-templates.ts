type Mail = { subject: string; text: string };

export const verifyEmailMail = (appUrl: string, token: string): Mail => ({
  subject: "Xác thực email KhaiBáo AI",
  text: `Chào bạn,\n\nBấm liên kết sau để xác thực email (hiệu lực 3 ngày):\n${appUrl}/verify-email?token=${token}\n\nNếu bạn không đăng ký KhaiBáo AI, bỏ qua email này.`,
});

export const resetPasswordMail = (appUrl: string, token: string): Mail => ({
  subject: "Đặt lại mật khẩu KhaiBáo AI",
  text: `Chào bạn,\n\nBấm liên kết sau để đặt lại mật khẩu (hiệu lực 1 giờ):\n${appUrl}/reset-password?token=${token}\n\nNếu bạn không yêu cầu, bỏ qua email này.`,
});

export const inviteMail = (appUrl: string, token: string, orgName: string, inviterName: string): Mail => ({
  subject: `${inviterName} mời bạn vào ${orgName} trên KhaiBáo AI`,
  text: `Chào bạn,\n\n${inviterName} mời bạn tham gia doanh nghiệp ${orgName} trên KhaiBáo AI. Bấm liên kết để đặt mật khẩu và bắt đầu (hiệu lực 7 ngày):\n${appUrl}/accept-invite?token=${token}`,
});

export const joinRequestMail = (appUrl: string, orgName: string, requesterName: string, requesterEmail: string): Mail => ({
  subject: `${requesterName} xin tham gia ${orgName}`,
  text: `${requesterName} (${requesterEmail}) đã đăng ký với MST của ${orgName} và xin tham gia. Vào ${appUrl}/settings?tab=members để duyệt.`,
});

export const joinApprovedMail = (appUrl: string, orgName: string): Mail => ({
  subject: `Bạn đã được duyệt vào ${orgName}`,
  text: `Yêu cầu tham gia ${orgName} của bạn đã được duyệt. Đăng nhập tại ${appUrl}/login.`,
});
