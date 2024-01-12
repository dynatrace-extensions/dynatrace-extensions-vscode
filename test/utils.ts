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
