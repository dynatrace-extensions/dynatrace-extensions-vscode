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

import { ConstraintViolation, DynatraceError } from "./interfaces/dynatrace";

/**
 * Custom error implementation to facilitate passing the Dynatrace error
 * envelope as a parameter.
 */
export class DynatraceAPIError extends Error {
  _errorParams: DynatraceError;

  /**
   * @param message error message
   * @param errorParams any optional parameters
   */
  constructor(message: string, errorParams: DynatraceError) {
    super(message);
    this._errorParams = errorParams;
  }

  get errorParams() {
    return this._errorParams;
  }
}

/**
 * Shape of the error envelope carried by SDK request errors (`ClientRequestError` and its
 * subclasses). Duck-typed rather than imported so that this module stays independent of any
 * individual `@dynatrace-sdk/client-*` package.
 */
interface SdkRequestError {
  message?: string;
  body?: {
    error?: {
      code?: number;
      message?: string;
      details?: { constraintViolations?: Partial<ConstraintViolation>[] };
    };
  };
  response?: { status?: number };
}

/**
 * Wraps an SDK error (or any unknown error) into a DynatraceAPIError so that
 * upstream consumers see a uniform error type.
 */
export function wrapSdkError(err: unknown): DynatraceAPIError {
  if (err instanceof DynatraceAPIError) {
    return err;
  }

  const requestError = asSdkRequestError(err);
  if (requestError) {
    const envelope = requestError.body?.error;
    const message = envelope?.message ?? requestError.message ?? "Unknown SDK error";
    return new DynatraceAPIError(message, {
      constraintViolations: normalizeConstraintViolations(envelope?.details?.constraintViolations),
      message,
      code: envelope?.code ?? requestError.response?.status ?? 0,
    });
  }

  const message =
    err instanceof Error ? err.message : typeof err === "string" ? err : "Unknown SDK error";

  return new DynatraceAPIError(message, {
    constraintViolations: [],
    message,
    code: extractStatusCode(err),
  });
}

/**
 * Narrows an unknown error to an SDK request error, which carries the API's error envelope
 * in `body` and the HTTP status in `response.status`.
 */
function asSdkRequestError(err: unknown): SdkRequestError | undefined {
  if (err == null || typeof err !== "object") {
    return undefined;
  }
  const record = err as Record<string, unknown>;
  return record.isClientRequestError === true ? record : undefined;
}

/**
 * Fills in the fields the SDK marks as optional but our DTO requires.
 */
function normalizeConstraintViolations(
  violations?: Partial<ConstraintViolation>[],
): ConstraintViolation[] {
  if (!violations) {
    return [];
  }
  return violations.map(violation => ({
    parameterLocation: violation.parameterLocation ?? "PAYLOAD_BODY",
    location: violation.location ?? "",
    message: violation.message ?? "",
    path: violation.path ?? "",
  }));
}

function extractStatusCode(err: unknown): number {
  if (err != null && typeof err === "object") {
    // SDK errors often carry a `status` or `statusCode` property
    if ("status" in err && typeof (err as Record<string, unknown>).status === "number") {
      return (err as Record<string, unknown>).status as number;
    }
    if ("statusCode" in err && typeof (err as Record<string, unknown>).statusCode === "number") {
      return (err as Record<string, unknown>).statusCode as number;
    }
  }
  return 0;
}
