import { Page } from "@dynatrace/strato-components-preview";
import React from "react";
import { MetricResultsPanel } from "./components/metricResultsPanel/metricResultsPanel";
import { MetricSeriesCollection } from "./interfaces/metricResultsPanel";
import { EmptyState } from "./components/EmptyState";

interface AppProps {
  vscode: unknown;
  dataType: string;
  data: unknown;
}

export const App = ({ dataType, data }: AppProps) => {
  return (
    <Page>
      <Page.Main>
        {dataType === "EMPTY_STATE" && <EmptyState />}
        {dataType === "METRIC_RESULTS" && (
          <MetricResultsPanel data={data as MetricSeriesCollection[]} />
        )}
      </Page.Main>
    </Page>
  );
};

export default App;
