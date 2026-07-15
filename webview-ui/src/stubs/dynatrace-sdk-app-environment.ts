/**
 * Stub for @dynatrace-sdk/app-environment.
 *
 * This package provides Dynatrace app runtime context (app identity, current user details)
 * that is not available or meaningful inside a VS Code webview. The stubs here read from
 * window.appShellDefaults (injected by the extension panel manager) where possible, and
 * return safe defaults otherwise.
 */

export const getAppId = (): string => window.appShellDefaults?.appId ?? "";
export const getAppVersion = (): string => window.appShellDefaults?.appVersion ?? "";
export const getAppName = (): string => window.appShellDefaults?.appName ?? "";
export const getCurrentUserDetails = (): null => null;
export const getEnvironmentId = (): string => window.appShellDefaults?.environmentId ?? "";
export const getEnvironmentUrl = () => window.appShellDefaults?.environmentUrl ?? "";
