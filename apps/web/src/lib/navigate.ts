/** Rời app sang trang ngoài (vd trang thanh toán PayOS). Tách riêng để test thay được (jsdom không cho đổi `location.assign`). */
export function openExternal(url: string): void {
  window.location.assign(url);
}
