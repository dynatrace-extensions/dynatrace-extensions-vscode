/**
 * Stub for @dynatrace-sdk/user-preferences.
 *
 * This package reads user preferences from the Dynatrace app runtime context
 * (language, timezone, theme, regional format) which is not available inside a
 * VS Code webview. The stubs here return sensible browser-derived defaults so that
 * dependents like @dynatrace-sdk/units produce correctly formatted output.
 */

export const getLanguage = (): string => "en";

export const getTimezone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone;

export const getRegionalFormat = (): string => navigator?.language ?? "en-US";

export const getTheme = (): string => "light";
