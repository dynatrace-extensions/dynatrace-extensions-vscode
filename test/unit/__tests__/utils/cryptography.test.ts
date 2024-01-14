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

import { readFileSync } from "fs";
import * as path from "path";
import mock = require("mock-fs");
import { sign } from "../../../../src/utils/cryptography";

jest.mock("../../../../src/utils/logging");

describe("Cryptography Utils", () => {
  describe("sign", () => {
    let expectedCms: string;
    let developerCertKey: string;

    beforeAll(() => {
      developerCertKey = readFileSync(
        path.resolve(__dirname, "..", "..", "test_data", "cryptography", "test_developer.pem"),
      ).toString();

      expectedCms = readFileSync(
        path.resolve(__dirname, "..", "..", "test_data", "cryptography", "expected_cms.pem"),
      ).toString();

      mock({
        mock: {
          "extension.zip": "AAA",
          "developer.pem": developerCertKey,
        },
      });
    });

    it("should create expected signature", () => {
      // Sign and normalize line endings
      const cms = sign("mock/extension.zip", "mock/developer.pem").replace(/\r?\n|\r/g, "\n");
      expect(cms).toEqual(expectedCms);
    });

    afterAll(() => {
      mock.restore();
    });
  });
});
