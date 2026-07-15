/**
 * Stub for @dynatrace-sdk/react-hooks.
 *
 * Provides a no-op implementation of the React hooks from the Dynatrace SDK
 * used by @dynatrace/strato-components-preview internals (DQL editor) that
 * are not relevant in the VS Code webview context.
 */

export const useDql = (): { data: undefined; isLoading: boolean; error: undefined } => ({
  data: undefined,
  isLoading: false,
  error: undefined,
});
