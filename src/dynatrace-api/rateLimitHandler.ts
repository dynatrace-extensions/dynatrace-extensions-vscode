/**
  Copyright 2022 Dynatrace LLC

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      https://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
 */

import logger from "../utils/logging";
import { DynatraceAPIError } from "./errors";

export interface RateLimitConfig {
  /** Delay in milliseconds before the first retry. Default: 1000 */
  initialDelayMs: number;
  /** Factor by which the delay increases after each retry. Default: 2 */
  backoffMultiplier: number;
  /** Maximum number of retry attempts. Default: 3 */
  maxRetries: number;
}

const DEFAULT_CONFIG: RateLimitConfig = {
  initialDelayMs: 1000,
  backoffMultiplier: 2,
  maxRetries: 3,
};

/**
 * Retries async operations that fail with HTTP 429 (Too Many Requests),
 * using exponential backoff. Designed for use with Dynatrace SDK clients.
 */
export class RateLimitRetryHandler {
  private static readonly logTrace = ["dynatrace-api", "rateLimitHandler", "RateLimitRetryHandler"];
  private readonly config: RateLimitConfig;

  constructor(config?: Partial<RateLimitConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Executes `fn`, retrying with exponential backoff if it throws a 429 error.
   * Non-429 errors are re-thrown immediately. Respects AbortSignal cancellation.
   */
  async execute<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err;

        if (!isRateLimitError(err) || attempt === this.config.maxRetries) {
          throw err;
        }

        if (signal?.aborted) {
          throw err;
        }

        const delay = this.config.initialDelayMs * Math.pow(this.config.backoffMultiplier, attempt);
        logger.warn(
          `Rate limited (429). Retry ${attempt + 1}/${this.config.maxRetries} in ${delay}ms.`,
          ...RateLimitRetryHandler.logTrace,
        );

        await abortableSleep(delay, signal);

        if (signal?.aborted) {
          throw lastError;
        }
      }
    }

    // Unreachable — the loop always throws or returns — but satisfies the compiler.
    throw lastError;
  }
}

/**
 * Checks whether an error represents an HTTP 429 rate limit response,
 * handling both DynatraceAPIError and raw SDK error shapes.
 */
function isRateLimitError(err: unknown): boolean {
  if (err instanceof DynatraceAPIError) {
    return err.errorParams.code === 429;
  }
  if (err != null && typeof err === "object") {
    const record = err as Record<string, unknown>;
    if ("status" in record && record.status === 429) {
      return true;
    }
    if ("statusCode" in record && record.statusCode === 429) {
      return true;
    }
  }
  return false;
}

/**
 * Returns a promise that resolves after `ms` milliseconds, or rejects early
 * if the given AbortSignal fires.
 */
function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }

    const timer = setTimeout(resolve, ms);

    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}
