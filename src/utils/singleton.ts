/**
 * Get a function that provides a singleton for the given class `cls`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createSingletonProvider<U, Args extends any[] = []>(
  cls: new (...args: Args) => U,
): (...args: Args) => U {
  let instance: U;

  return (...args) => {
    instance = instance ?? new cls(...args);

    return instance;
  };
}
