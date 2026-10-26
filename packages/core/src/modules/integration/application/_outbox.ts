/** Quá số lần thử (= attempts của BullMQ) → outbox FAILED, người dùng "Gửi lại". Dùng chung worker tờ khai (process-outbox) và HYS (process-hys). */
export const MAX_ATTEMPTS = 5;
