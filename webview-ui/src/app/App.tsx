import { Page } from "@dynatrace/strato-components-preview";
import React, { useEffect, useState } from "react";
import { EmptyState } from "./components/EmptyState";
import { ExtensionSimulator } from "./components/panels/ExtensionSimulator";
import { MetricResultsPanel } from "./components/panels/MetricResultsPanel";
import { WmiResultPanel } from "./components/panels/WmiResultPanel";
import { PanelData } from "./interfaces/general";
import { MetricSeriesCollection } from "./interfaces/metricResultsPanel";
import { SimulatorPanelData } from "./interfaces/simulator";
import { WebviewApi } from "./interfaces/vscode";
import { WmiQueryResult } from "./interfaces/wmiResultPanel";

interface AppProps {
  vscode: WebviewApi<PanelData>;
  dataType: string;
  data: unknown;
}

interface UpdateDataEvent {
  messageType: string;
  data: PanelData;
}

export const App = ({ vscode, dataType, data }: AppProps) => {
  const [panelData, setPanelData] = useState<PanelData>(vscode.getState() ?? { dataType, data });

  // Handles data updates coming from the extension
  const handleDataUpdate = (event: MessageEvent<UpdateDataEvent>) => {
    const { messageType, data: messageData } = event.data;
    if (messageType === "updateData") {
      setPanelData(messageData);
    }
  };

  // On any panel data changes, update vscode state
  useEffect(() => {
    vscode.setState(panelData);
  }, [panelData, vscode]);

  // At mount time, add a listener for data updates from extension
  useEffect(() => {
    window.addEventListener("message", handleDataUpdate);
    return () => {
      window.removeEventListener("message", handleDataUpdate);
    };
  }, []);

  return (
    <Page>
      <Page.Main>
        {dataType === "EMPTY_STATE" && <EmptyState />}
        {dataType === "METRIC_RESULTS" && (
          <MetricResultsPanel data={panelData.data as MetricSeriesCollection[]} />
        )}
        {dataType === "WMI_RESULT" && <WmiResultPanel data={panelData.data as WmiQueryResult} />}
        {dataType === "SIMULATOR_DATA" && (
          <ExtensionSimulator
            panelData={panelData as SimulatorPanelData}
            setPanelData={
              setPanelData as (
                newData:
                  | SimulatorPanelData
                  | ((prevValue: SimulatorPanelData) => SimulatorPanelData),
              ) => void
            }
          />
        )}
      </Page.Main>
    </Page>
  );
};

export default App;
