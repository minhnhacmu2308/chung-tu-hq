export const SESSION_COOKIE = "kb_session";
const THIRTY_DAYS = 30 * 86_400;

export const sessionCookieOptions = (secure: boolean) => ({ httpOnly: true, sameSite: "lax" as const, secure, path: "/", maxAge: THIRTY_DAYS });
export const clearedCookieOptions = (secure: boolean) => ({ ...sessionCookieOptions(secure), maxAge: 0 });
