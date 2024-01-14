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

type WaitOptions = {
  interval: number;
  timeout: number;
  waitFirst: boolean;
};

const defaultWaitOptions: WaitOptions = {
  interval: 100,
  timeout: Number.POSITIVE_INFINITY,
  waitFirst: true,
};

export function waitForCondition(
  condition: () => boolean | PromiseLike<boolean> | Thenable<boolean>,
  options?: Partial<WaitOptions>,
) {
  const { interval, timeout, waitFirst } = {
    ...defaultWaitOptions,
    ...options,
  };

  return new Promise<void>((resolve, reject) => {
    const startTime = Date.now();

    const checkCondition = () => {
      const result = condition();

      if (typeof result === "object" && "then" in result) {
        (result as PromiseLike<boolean>).then(
          conditionResult => {
            if (conditionResult) {
              resolve();
            } else if (Date.now() - startTime >= timeout) {
              reject(new Error(`Timeout after ${timeout} ms`));
            } else {
              setTimeout(checkCondition, interval);
            }
          },
          err => {
            reject(err);
          },
        );
      } else if (result) {
        resolve();
      } else if (Date.now() - startTime >= timeout) {
        reject(new Error(`Timeout after ${timeout} ms`));
      } else {
        setTimeout(checkCondition, interval);
      }
    };

    if (waitFirst) {
      setTimeout(checkCondition, interval);
    } else {
      checkCondition();
    }
  });
}
