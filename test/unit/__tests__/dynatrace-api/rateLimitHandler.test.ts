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

import { DynatraceAPIError } from "../../../../src/dynatrace-api/errors";
import { RateLimitRetryHandler } from "../../../../src/dynatrace-api/rateLimitHandler";

jest.mock("../../../../src/utils/logging");

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

/**
 * Helper: advances fake timers while a promise is pending.
 * Returns the resolved value once the promise settles.
 */
async function runWithTimers<T>(promise: Promise<T>): Promise<T> {
  let result: T | undefined;
  let error: unknown;
  let settled = false;

  promise
    .then(val => {
      result = val;
      settled = true;
    })
    .catch(err => {
      error = err;
      settled = true;
    });

  // Flush all pending timers until the promise settles
  while (!settled) {
    await jest.advanceTimersByTimeAsync(10_000);
  }

  if (error) {
    throw error as Error;
  }
  return result as T;
}

describe("RateLimitRetryHandler", () => {
  it("returns result on first attempt when no error occurs", async () => {
    const handler = new RateLimitRetryHandler();
    const fn = jest.fn().mockResolvedValue("ok");

    const result = await handler.execute(fn);

    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on 429 DynatraceAPIError and succeeds", async () => {
    const handler = new RateLimitRetryHandler({ initialDelayMs: 100, maxRetries: 3 });
    const error429 = new DynatraceAPIError("rate limited", {
      constraintViolations: [],
      message: "rate limited",
      code: 429,
    });
    const fn = jest.fn().mockRejectedValueOnce(error429).mockResolvedValue("success");

    const result = await runWithTimers(handler.execute(fn));

    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("retries on raw SDK error with status: 429", async () => {
    const handler = new RateLimitRetryHandler({ initialDelayMs: 100, maxRetries: 2 });
    const sdkError = { message: "Too Many Requests", status: 429 };
    const fn = jest.fn().mockRejectedValueOnce(sdkError).mockResolvedValue("ok");

    const result = await runWithTimers(handler.execute(fn));

    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("retries on raw SDK error with statusCode: 429", async () => {
    const handler = new RateLimitRetryHandler({ initialDelayMs: 100, maxRetries: 2 });
    const sdkError = { message: "Too Many Requests", statusCode: 429 };
    const fn = jest.fn().mockRejectedValueOnce(sdkError).mockResolvedValue("ok");

    const result = await runWithTimers(handler.execute(fn));

    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("throws immediately on non-429 errors", async () => {
    const handler = new RateLimitRetryHandler({ initialDelayMs: 100 });
    const error400 = new DynatraceAPIError("bad request", {
      constraintViolations: [],
      message: "bad request",
      code: 400,
    });
    const fn = jest.fn().mockRejectedValue(error400);

    await expect(handler.execute(fn)).rejects.toBe(error400);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("throws immediately on 500 errors without retrying", async () => {
    const handler = new RateLimitRetryHandler({ initialDelayMs: 100 });
    const error500 = { message: "Internal Server Error", status: 500 };
    const fn = jest.fn().mockRejectedValue(error500);

    await expect(handler.execute(fn)).rejects.toBe(error500);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("exhausts retries and re-throws the last 429 error", async () => {
    const handler = new RateLimitRetryHandler({
      initialDelayMs: 100,
      maxRetries: 2,
    });
    const error429 = new DynatraceAPIError("rate limited", {
      constraintViolations: [],
      message: "rate limited",
      code: 429,
    });
    const fn = jest.fn().mockRejectedValue(error429);

    await expect(runWithTimers(handler.execute(fn))).rejects.toBe(error429);
    // 1 initial attempt + 2 retries = 3 total calls
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("uses exponential backoff delays", async () => {
    const handler = new RateLimitRetryHandler({
      initialDelayMs: 1000,
      backoffMultiplier: 2,
      maxRetries: 3,
    });
    const error429 = new DynatraceAPIError("rate limited", {
      constraintViolations: [],
      message: "rate limited",
      code: 429,
    });
    // Fail 3 times then succeed on 4th
    const fn = jest
      .fn()
      .mockRejectedValueOnce(error429)
      .mockRejectedValueOnce(error429)
      .mockRejectedValueOnce(error429)
      .mockResolvedValue("done");

    const promise = handler.execute(fn);
    expect(fn).toHaveBeenCalledTimes(1);

    // First retry after 1000ms (1000 * 2^0)
    await jest.advanceTimersByTimeAsync(1000);
    expect(fn).toHaveBeenCalledTimes(2);

    // Second retry after 2000ms (1000 * 2^1)
    await jest.advanceTimersByTimeAsync(2000);
    expect(fn).toHaveBeenCalledTimes(3);

    // Third retry after 4000ms (1000 * 2^2)
    await jest.advanceTimersByTimeAsync(4000);
    expect(fn).toHaveBeenCalledTimes(4);

    const result = await promise;
    expect(result).toBe("done");
  });

  it("respects AbortSignal — does not retry after abort", async () => {
    const handler = new RateLimitRetryHandler({ initialDelayMs: 100, maxRetries: 3 });
    const controller = new AbortController();
    const error429 = new DynatraceAPIError("rate limited", {
      constraintViolations: [],
      message: "rate limited",
      code: 429,
    });
    const fn = jest.fn().mockRejectedValue(error429);

    // Abort immediately after first failure
    fn.mockImplementation(() => {
      controller.abort();
      return Promise.reject(error429);
    });

    await expect(handler.execute(fn, controller.signal)).rejects.toBe(error429);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("uses custom config values", async () => {
    const handler = new RateLimitRetryHandler({
      initialDelayMs: 500,
      backoffMultiplier: 3,
      maxRetries: 1,
    });
    const error429 = new DynatraceAPIError("rate limited", {
      constraintViolations: [],
      message: "rate limited",
      code: 429,
    });
    const fn = jest.fn().mockRejectedValue(error429);

    // maxRetries=1: 1 initial attempt + 1 retry = 2 total calls
    await expect(runWithTimers(handler.execute(fn))).rejects.toBe(error429);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("uses defaults when no config is provided", () => {
    // Verify the handler can be created without config (no-throw)
    const handler = new RateLimitRetryHandler();
    expect(handler).toBeDefined();
  });
});
