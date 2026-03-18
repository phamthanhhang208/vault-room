import { logger } from './logger.js';

export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: { maxAttempts?: number; baseDelayMs?: number; label?: string },
): Promise<T> {
  const maxAttempts = options?.maxAttempts ?? 3;
  const baseDelayMs = options?.baseDelayMs ?? 1000;
  const label = options?.label ?? 'operation';

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        logger.warn(`${label} failed (attempt ${attempt}/${maxAttempts}), retrying in ${delay}ms...`);
        await new Promise((res) => setTimeout(res, delay));
      }
    }
  }

  throw lastError;
}
