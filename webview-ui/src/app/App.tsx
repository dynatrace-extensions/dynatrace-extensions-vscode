import { Page } from "@dynatrace/strato-components-preview";
import React from "react";
import { MetricResultsPanel } from "./components/metricResultsPanel/metricResultsPanel";
import { MetricSeriesCollection } from "./interfaces/metricResultsPanel";

interface AppProps {
  vscode: unknown;
  dataType: string;
  data: unknown;
}

export const App = ({ dataType, data }: AppProps) => {
  return (
    <Page>
      <Page.Main>
        {dataType === "METRIC_RESULTS" && (
          <MetricResultsPanel data={data as MetricSeriesCollection[]} />
        )}
      </Page.Main>
    </Page>
  );
};

export default App;
