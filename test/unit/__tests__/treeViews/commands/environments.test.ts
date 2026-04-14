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

import {
  deriveDeploymentModel,
  validateEnvironmentUrl,
} from "../../../../../src/treeViews/commands/environments";

describe("validateEnvironmentUrl", () => {
  describe("valid URLs", () => {
    test.each([
      "https://abc12345.apps.dynatrace.com",
      "https://abc12345.apps.dynatrace.com/",
      "https://abc12345.sprint.apps.dynatracelabs.com",
      "https://abc12345.dev.apps.dynatracelabs.com",
      "https://host.example.com/e/abc-123",
      "https://host.example.com/e/abc-123/",
      "https://10.0.0.1/e/env-id",
      "http://localhost/e/env-id",
    ])("accepts %s", (url: string) => {
      expect(validateEnvironmentUrl(url)).toBeNull();
    });
  });

  describe("rejected legacy SaaS URLs", () => {
    test.each([
      "https://abc12345.live.dynatrace.com",
      "https://abc12345.sprint.dynatracelabs.com",
      "https://abc12345.dev.dynatracelabs.com",
    ])("rejects %s with legacy SaaS message", (url: string) => {
      const result = validateEnvironmentUrl(url);

      expect(result).not.toBeNull();
      expect(result).toContain("Legacy SaaS URLs");
      expect(result).toContain(".apps.dynatrace.com");
    });
  });

  describe("invalid URLs", () => {
    it("rejects URLs without protocol", () => {
      expect(validateEnvironmentUrl("abc12345.apps.dynatrace.com")).toContain(
        "Must start with http://",
      );
    });

    it("rejects unrecognized URL formats", () => {
      expect(validateEnvironmentUrl("https://random-host.example.com")).not.toBeNull();
    });

    it("rejects malformed .apps URLs", () => {
      expect(validateEnvironmentUrl("https://host.apps.invalid.com")).not.toBeNull();
    });
  });
});

describe("deriveDeploymentModel", () => {
  it("returns 'saas' for .apps. URLs", () => {
    expect(deriveDeploymentModel("https://abc.apps.dynatrace.com")).toBe("saas");
  });

  it("returns 'saas' for sprint .apps. URLs", () => {
    expect(deriveDeploymentModel("https://abc.sprint.apps.dynatracelabs.com")).toBe("saas");
  });

  it("returns 'managed' for /e/ URLs", () => {
    expect(deriveDeploymentModel("https://host/e/abc123")).toBe("managed");
  });

  it("returns 'managed' for any non-.apps URL", () => {
    expect(deriveDeploymentModel("https://custom-host.example.com")).toBe("managed");
  });
});
