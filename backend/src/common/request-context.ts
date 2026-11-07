import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContext {
  requestId: string;
  ip?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

/** Dùng bởi RequestIdMiddleware để mọi code trong 1 request đọc được requestId/ip. */
export function runWithRequestContext<T>(ctx: RequestContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

/** undefined khi chạy ngoài HTTP request (worker, migration, seed). */
export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}
