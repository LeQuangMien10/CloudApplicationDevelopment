/** Env rỗng hoặc không phải số dương thì dùng mặc định. Dùng cho ngưỡng rate limit (F9). */
export function parsePositiveInt(raw: string | undefined, fallback: number) {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * Số lớp proxy đứng trước backend, dùng cho `trust proxy` của Express.
 *
 * Deploy theo ADR 006, request đi qua 2 lớp: Caddy (đặt X-Forwarded-For bằng IP client)
 * rồi nginx của frontend (nối thêm IP của Caddy). Tin đúng 2 lớp thì `req.ip` là IP client.
 * Tin 1 lớp thì `req.ip` là IP của Caddy, mọi người dùng bị tính chung một IP.
 *
 * Chạy backend trực tiếp, không qua proxy, thì đặt TRUST_PROXY_HOPS=0.
 * Env rỗng hoặc sai thì dùng 2.
 */
export function parseTrustProxyHops(raw: string | undefined): number {
  const n = Number(raw);
  return raw !== undefined && raw !== '' && Number.isInteger(n) && n >= 0 ? n : 2;
}
