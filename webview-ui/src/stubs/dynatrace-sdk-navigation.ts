/**
 * Stub for @dynatrace-sdk/navigation.
 *
 * This package provides Dynatrace app navigation APIs (intent-based routing, app links)
 * that have no meaning inside a VS Code webview. The stubs here provide a best-effort
 * intent link builder using window.appShellDefaults.environmentUrl, and no-op the rest.
 */

export const sendIntent = (): Promise<void> => Promise.resolve();
export const sendIntentWithResponse = (): Promise<undefined> => Promise.resolve(undefined);

export const getIntentLink = (intentPayload: object, appId?: string, intentId?: string): string => {
  const environmentUrl = window.appShellDefaults?.environmentUrl ?? "";
  const hashPayload = `#${encodeURIComponent(JSON.stringify(intentPayload))}`;
  if (!appId || !intentId) {
    return `${environmentUrl}/ui/intent/${hashPayload}`;
  }
  return `${environmentUrl}/ui/intent/${appId}/${intentId}${hashPayload}`;
};

export const getAppLink = (): string => "";
export const openApp = (): Promise<void> => Promise.resolve();
