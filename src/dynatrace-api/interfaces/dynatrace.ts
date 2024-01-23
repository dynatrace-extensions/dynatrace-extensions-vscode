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

import { AxiosError, AxiosResponse, ResponseType, Method } from "axios";

interface ConstraintViolation {
  parameterLocation: "HEADER" | "PATH" | "PAYLOAD_BODY" | "QUERY";
  location: string;
  message: string;
  path: string;
}

export interface DynatraceError {
  constraintViolations: ConstraintViolation[];
  message: string;
  code: number;
}

export interface ErrorEnvelope {
  error: DynatraceError;
}

export interface DynatraceAxiosError extends AxiosError<ErrorEnvelope> {
  response: AxiosResponse<ErrorEnvelope>;
}

export interface PaginatedResponse<T> {
  [key: string]: T[];
  // @ts-expect-errors
  nextPageKey?: string;
}

export interface DynatraceRequestConfig {
  /* path URL path for the web request endpoint */
  path: string;

  /* query parameters; in case of POST or PUT it becomes body of request */
  params?: Record<string, unknown>;

  /* method HTTP method to use */
  method: Method;

  /* headers additional request headers */
  headers: Record<string, string>;

  /* query parameters; to be used for POST and PUT requests */
  queryParams?: Record<string, unknown>;

  /* files to be uploaded */
  files?: { file: Buffer; name: string };

  /* expected response type */
  responseType?: ResponseType;

  /* signal to cancel the request */
  signal?: AbortSignal;
}

export interface DynatracePaginatedRequestConfig extends Partial<DynatraceRequestConfig> {
  /* the attribute in the response that holds the items */
  item: string;
}
