import { Page } from "@dynatrace/strato-components-preview";
import React from "react";
import { MetricResultsPanel } from "./components/metricResultsPanel/metricResultsPanel";
import { MetricSeriesCollection } from "./interfaces/metricResultsPanel";
import { EmptyState } from "./components/EmptyState";
import { WebviewApi } from "./interfaces/vscode";
import { PanelData } from "./interfaces/general";

interface AppProps {
  vscode: WebviewApi<PanelData>;
  dataType: string;
  data: unknown;
}

export const App = ({ vscode, dataType, data }: AppProps) => {
  const previousState = vscode.getState();
  const panelData = previousState ? previousState.data : data;
  vscode.setState({ dataType: dataType, data: panelData });

  return (
    <Page>
      <Page.Main>
        {dataType === "EMPTY_STATE" && <EmptyState />}
        {dataType === "METRIC_RESULTS" && (
          <MetricResultsPanel data={panelData as MetricSeriesCollection[]} />
        )}
      </Page.Main>
    </Page>
  );
};

export default App;
