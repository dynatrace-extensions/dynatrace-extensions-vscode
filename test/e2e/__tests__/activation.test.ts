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

import * as vscode from "vscode";
import { waitForCondition } from "../../utils";

jest.mock("../../../src/utils/logging");

describe("Extension", () => {
  let extension: vscode.Extension<unknown> | undefined;

  beforeAll(() => {
    extension = vscode.extensions.getExtension<unknown>(
      "DynatracePlatformExtensions.dynatrace-extensions",
    );
  });

  it("should be available on the system", () => {
    expect(extension).toBeDefined();
  });

  it("should activate within 1 second", async () => {
    const actualState = () => (extension ? extension.isActive : false);
    return waitForCondition(actualState, { timeout: 1000 }).then(() => {
      expect(actualState()).toBe(true);
    });
  });
});
