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

interface ConstraintViolation {
  parameterLocation: "HEADER" | "PATH" | "PAYLOAD_BODY" | "QUERY";
  location: string;
  message: string;
  path: string;
}

interface DynatraceError {
  constraintViolations: ConstraintViolation[];
  message: string;
  code: number;
}

export interface ErrorEnvelope {
  error: DynatraceError;
}

export interface DynatraceAPIErrorParams {
  code: string;
  message: string;
  data: DynatraceError | Record<string, unknown>;
}

export interface PaginatedResponse<T> {
  // eslint-disable-next-line @typescript-eslint/consistent-indexed-object-style
  [key: string]: T[];
  // @ts-expect-errors
  nextPageKey?: string;
}
