/** Token inject OutboxWorkerConfig. Test thay bằng overrideProvider(...).useValue(...). */
export const OUTBOX_WORKER_CONFIG = 'OUTBOX_WORKER_CONFIG';

/** Cấu hình worker xử lý outbox (F5). Đọc từ biến môi trường, xem .env.example. */
export interface OutboxWorkerConfig {
  /** Thời gian nghỉ giữa hai lần poll khi không còn sự kiện đến hạn */
  pollIntervalMs: number;
  /** Số sự kiện tối đa xử lý trong một lần poll */
  batchSize: number;
  /** Lỗi đến lần thứ này thì đánh dấu failed, không thử lại nữa */
  maxAttempts: number;
  /** Thời gian chờ trước lần thử lại đầu tiên, các lần sau gấp đôi */
  backoffBaseMs: number;
  /** Thời gian chờ tối đa giữa hai lần thử lại */
  backoffMaxMs: number;
}

const DEFAULTS: OutboxWorkerConfig = {
  pollIntervalMs: 2000,
  batchSize: 20,
  maxAttempts: 5,
  backoffBaseMs: 5000,
  backoffMaxMs: 10 * 60 * 1000,
};

/**
 * Đọc cấu hình, thiếu biến nào thì dùng mặc định.
 * Giá trị sai (không phải số nguyên dương) thì ném lỗi ngay khi khởi động,
 * không lặng lẽ dùng mặc định, để cấu hình sai trên server bị phát hiện sớm.
 */
export function loadOutboxWorkerConfig(
  env: NodeJS.ProcessEnv = process.env,
): OutboxWorkerConfig {
  const config: OutboxWorkerConfig = {
    pollIntervalMs: readPositiveInt(
      env,
      'OUTBOX_POLL_INTERVAL_MS',
      DEFAULTS.pollIntervalMs,
    ),
    batchSize: readPositiveInt(env, 'OUTBOX_BATCH_SIZE', DEFAULTS.batchSize),
    maxAttempts: readPositiveInt(
      env,
      'OUTBOX_MAX_ATTEMPTS',
      DEFAULTS.maxAttempts,
    ),
    backoffBaseMs: readPositiveInt(
      env,
      'OUTBOX_BACKOFF_BASE_MS',
      DEFAULTS.backoffBaseMs,
    ),
    backoffMaxMs: readPositiveInt(
      env,
      'OUTBOX_BACKOFF_MAX_MS',
      DEFAULTS.backoffMaxMs,
    ),
  };
  if (config.backoffMaxMs < config.backoffBaseMs) {
    throw new Error(
      `OUTBOX_BACKOFF_MAX_MS (${config.backoffMaxMs}) phải >= OUTBOX_BACKOFF_BASE_MS (${config.backoffBaseMs})`,
    );
  }
  return config;
}

function readPositiveInt(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
): number {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  if (!/^[1-9]\d*$/.test(raw)) {
    throw new Error(`${name} phải là số nguyên dương, nhận "${raw}"`);
  }
  return Number(raw);
}
