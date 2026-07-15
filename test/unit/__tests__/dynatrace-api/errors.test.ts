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

import { DynatraceAPIError, wrapSdkError } from "../../../../src/dynatrace-api/errors";

describe("wrapSdkError", () => {
  it("returns the same error if it is already a DynatraceAPIError", () => {
    const original = new DynatraceAPIError("test", {
      constraintViolations: [],
      message: "test",
      code: 400,
    });

    const wrapped = wrapSdkError(original);

    expect(wrapped).toBe(original);
  });

  it("wraps a standard Error into DynatraceAPIError", () => {
    const original = new Error("something broke");

    const wrapped = wrapSdkError(original);

    expect(wrapped).toBeInstanceOf(DynatraceAPIError);
    expect(wrapped.message).toBe("something broke");
    expect(wrapped.errorParams.code).toBe(0);
  });

  it("wraps a string error", () => {
    const wrapped = wrapSdkError("string error");

    expect(wrapped).toBeInstanceOf(DynatraceAPIError);
    expect(wrapped.message).toBe("string error");
  });

  it("wraps an unknown value with default message", () => {
    const wrapped = wrapSdkError(42);

    expect(wrapped).toBeInstanceOf(DynatraceAPIError);
    expect(wrapped.message).toBe("Unknown SDK error");
  });

  it("extracts status from SDK-like error with status property", () => {
    const sdkError = { message: "Not Found", status: 404 };

    const wrapped = wrapSdkError(sdkError);

    expect(wrapped.errorParams.code).toBe(404);
  });

  it("extracts statusCode from SDK-like error with statusCode property", () => {
    const sdkError = { message: "Forbidden", statusCode: 403 };

    const wrapped = wrapSdkError(sdkError);

    expect(wrapped.errorParams.code).toBe(403);
  });

  it("always includes empty constraintViolations array", () => {
    const wrapped = wrapSdkError(new Error("test"));

    expect(wrapped.errorParams.constraintViolations).toEqual([]);
  });
});
