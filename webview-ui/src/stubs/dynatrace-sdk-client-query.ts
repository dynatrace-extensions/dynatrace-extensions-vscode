/**
 * Stub for @dynatrace-sdk/client-query.
 *
 * Provides a no-op implementation of the query assistance client used by
 * @dynatrace/strato-components-preview internals (DQL editor) that is not
 * relevant in the VS Code webview context.
 */

export const queryAssistanceClient = {
  query: () => Promise.resolve({ results: [] }),
};
