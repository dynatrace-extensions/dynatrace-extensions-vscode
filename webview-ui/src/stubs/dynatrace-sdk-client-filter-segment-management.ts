/**
 * Stub for @dynatrace-sdk/client-filter-segment-management.
 *
 * Provides a no-op implementation of the filter segments client used by
 * @dynatrace/strato-components-preview internals (SegmentSelector) that is
 * not relevant in the VS Code webview context.
 */

export const filterSegmentsClient = {
  query: () => Promise.resolve({ segments: [] }),
  get: () => Promise.resolve(null),
};
