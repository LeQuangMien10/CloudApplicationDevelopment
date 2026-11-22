/**
 * F9: ngưỡng rate limit rất cao cho e2e nói chung — nhiều spec đăng nhập/chuyển
 * khoản liên tục từ cùng IP. Riêng các spec của F9 (login-ip-rate-limit,
 * transfer-rate-limit) tự đặt ngưỡng thấp trong beforeAll của chúng.
 * Biến được guard đọc tại thời điểm request (hàm Resolvable), đặt trước khi
 * tạo app là đủ.
 */
process.env.RATE_LIMIT_LOGIN_PER_MIN = '1000';
process.env.RATE_LIMIT_TRANSFER_PER_MIN = '1000';
