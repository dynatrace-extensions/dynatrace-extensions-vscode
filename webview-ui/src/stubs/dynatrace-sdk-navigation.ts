/**
 * Stub for @dynatrace-sdk/navigation.
 *
 * This package provides Dynatrace app navigation APIs (intent-based routing, app links)
 * that have no meaning inside a VS Code webview. The stubs here satisfy import resolution
 * at bundle time without pulling in the real SDK.
 */

export const sendIntent = (): Promise<void> => Promise.resolve();
export const sendIntentWithResponse = (): Promise<undefined> => Promise.resolve(undefined);
export const getIntentLink = (): string => "";
export const getAppLink = (): string => "";
export const openApp = (): Promise<void> => Promise.resolve();
