/**
 * Stub for @dynatrace-sdk/app-environment.
 *
 * This package provides Dynatrace app runtime context (app identity, current user details)
 * that is not available or meaningful inside a VS Code webview. The stubs here satisfy
 * import resolution at bundle time without pulling in the real SDK.
 */

export const getAppId = (): string => "";
export const getAppVersion = (): string => "";
export const getAppName = (): string => "";
export const getCurrentUserDetails = (): null => null;
