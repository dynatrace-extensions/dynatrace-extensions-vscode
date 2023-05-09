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

import { DynatraceError } from "./interfaces/dynatrace";

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
