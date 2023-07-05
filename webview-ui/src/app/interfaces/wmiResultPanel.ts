export interface WmiQueryResult {
  query: string;
  responseTime: string;
  error: boolean;
  errorMessage?: string;
  results: Array<Record<string, string | number>>;
}
