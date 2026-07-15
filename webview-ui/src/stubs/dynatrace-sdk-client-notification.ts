/**
 * Stub for @dynatrace-sdk/client-notification.
 *
 * Provides no-op implementations of the notification client APIs used by
 * @dynatrace/strato-components-preview internals (NotifyButton) that are not
 * relevant in the VS Code webview context.
 */

export const selfNotificationsClient = {
  send: () => Promise.resolve(),
  subscribe: () => () => undefined,
};

export const isErrorEnvelopeError = (): boolean => false;
