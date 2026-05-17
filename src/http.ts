import { throttle } from "./throttle.js";

class HttpError extends Error {
  constructor(public status: number, public statusText: string, public headers: Headers) {
    super(`HTTP ${status} ${statusText}`);
    this.name = "HttpError";
  }
}

/** Maximum individual backoff delay (ms) to avoid runaway waits on long Retry-After headers. */
const MAX_BACKOFF_MS = 60_000;

export async function fetchJsonWithRetry(
  url: string,
  init: RequestInit = {},
  attempts = 7,
  timeoutMs = 10_000,
): Promise<unknown> {
  const host = new URL(url).hostname;
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    // Respect per-host rate limit before every attempt (including retries)
    await throttle(host);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new HttpError(response.status, response.statusText, response.headers);
      }

      return await response.json();
    } catch (error) {
      lastError = error;

      let isRetryable = true;
      // Base exponential backoff: 1s, 2s, 4s, 8s, 16s, 32s, 60s (capped)
      let waitMs = Math.min(1000 * 2 ** (attempt - 1), MAX_BACKOFF_MS);

      if (error instanceof HttpError) {
        // Do not retry 4xx client errors except 429 Too Many Requests
        if (error.status >= 400 && error.status < 500 && error.status !== 429) {
          isRetryable = false;
        } else if (error.status === 429) {
          const retryAfter = error.headers.get("retry-after");
          if (retryAfter) {
            const seconds = parseInt(retryAfter, 10);
            if (!Number.isNaN(seconds)) {
              // Honour the server's hint but cap at MAX_BACKOFF_MS
              waitMs = Math.min(Math.max(waitMs, seconds * 1000), MAX_BACKOFF_MS);
            }
          }
        }
      }

      if (!isRetryable) {
        throw error;
      }

      if (attempt < attempts) {
        // Add ±20% jitter to avoid Thundering Herd when many workers hit 429 simultaneously
        const jitter = waitMs * (0.8 + Math.random() * 0.4);
        await delay(jitter);
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
