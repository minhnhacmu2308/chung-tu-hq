export const PASSWORD_MIN = 8;
export const isPasswordAcceptable = (p: string) => p.length >= PASSWORD_MIN && p.length <= 128;
