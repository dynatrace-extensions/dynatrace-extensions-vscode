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

import { loopSafeWait, waitForCondition } from "../../../../src/utils/code";

describe("Code Utils", () => {
  describe("loopSafeWait", () => {
    test.each([5, 10, 20])("resolves after %i ms", async (duration: number) => {
      await expect(loopSafeWait(duration)).resolves.not.toThrow();
    });
  });

  describe("waitForCondition", () => {
    test.each([5, 10, 20])("resolves after %i ms if condition true", async (duration: number) => {
      let condition = false;
      setTimeout(() => {
        condition = true;
      }, duration);

      await expect(waitForCondition(() => condition, { interval: 1 })).resolves.not.toThrow();
    });

    it("checks immediately if needed", async () => {
      const startTime = Date.now();

      await expect(
        waitForCondition(() => true, { interval: 5, waitFirst: false }),
      ).resolves.not.toThrow();

      const endTime = Date.now();
      expect(endTime - startTime).toBeLessThan(5);
    });

    it("waits for promises to resolve", async () => {
      const condition = new Promise<boolean>(resolve => setTimeout(() => resolve(true), 10));

      await expect(waitForCondition(() => condition, { interval: 1 })).resolves.not.toThrow();
    });

    it("rejects promises if timeout reached", async () => {
      const condition = new Promise<boolean>(resolve => setTimeout(() => resolve(false), 2));

      await expect(waitForCondition(() => condition, { interval: 1, timeout: 10 })).rejects.toThrow(
        "Timeout after 10 ms",
      );
    });

    it("rejects with same error if promise rejected", async () => {
      const condition = new Promise<boolean>((_, reject) => {
        setTimeout(() => reject("MOCK"), 10);
      });

      await expect(waitForCondition(() => condition, { interval: 1 })).rejects.toBe("MOCK");
    });

    it("rejects if timeout exceeded", async () => {
      let condition = false;
      setTimeout(() => {
        condition = true;
      }, 20);

      await expect(waitForCondition(() => condition, { interval: 1, timeout: 10 })).rejects.toThrow(
        "Timeout after 10 ms",
      );
    });
  });
});
