/**
 * Stub for @dynatrace-sdk/client-state.
 *
 * This package provides app state persistence APIs (per-user app state stored in
 * Dynatrace backend) that have no meaning inside a VS Code webview. The stubs here
 * satisfy import resolution at bundle time without pulling in the real SDK.
 */

export const stateClient = {
  getUserAppState: () => Promise.resolve(null),
  setUserAppState: () => Promise.resolve(),
  deleteUserAppState: () => Promise.resolve(),
};

export const isForbidden = (): boolean => false;
export const isNotFound = (): boolean => false;
export const isUnauthorized = (): boolean => false;
