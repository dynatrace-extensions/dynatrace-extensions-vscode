/**
 * Stub for @dynatrace-sdk/user-preferences.
 *
 * This package reads user preferences from the Dynatrace app runtime context
 * (language, timezone, theme, regional format) which is not available inside a
 * VS Code webview. The stubs here read directly from window.appShellDefaults
 * (injected by the extension panel manager before any JS executes) so that
 * strato-components internals pick up the correct VS Code theme and locale.
 */

export const getLanguage = (): string => window.appShellDefaults?.language ?? "en";

export const getTimezone = (): string =>
  window.appShellDefaults?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;

export const getRegionalFormat = (): string =>
  window.appShellDefaults?.regionalFormat ?? navigator?.language ?? "en-US";

export const getTheme = (): string => window.appShellDefaults?.theme ?? "light";
