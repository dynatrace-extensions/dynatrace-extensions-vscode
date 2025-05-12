/**
  Copyright 2022 Dynatrace LLC

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      https://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
 */

import React, { useEffect, useState } from "react";
import { CodeSnippet } from "@dynatrace/strato-components-preview/content";
import { ToastOptions, showToast } from "@dynatrace/strato-components-preview/notifications";
import { Modal } from "@dynatrace/strato-components-preview/overlays";
import { Page } from "@dynatrace/strato-components-preview/layouts";
import { ExtensionSimulator } from "./components/panels/ExtensionSimulator";
import { MetricResultsPanel } from "./components/panels/MetricResultsPanel";
import { WmiResultPanel } from "./components/panels/WmiResultPanel";
import {
  EMPTY_STATE_DATA_TYPE,
  METRIC_RESULTS_DATA_TYPE,
  SIMULATOR_DATA_TYPE,
  WMI_RESULT_DATA_TYPE,
} from "./constants/constants";
import { LogData, PanelData } from "./interfaces/general";
import { MetricSeriesCollection } from "./interfaces/metricResultsPanel";
import { SimulatorData } from "./interfaces/simulator";
import { WebviewApi } from "./interfaces/vscode";
import { WmiQueryResult } from "./interfaces/wmiResultPanel";
import { NotFound } from "./components/NotFound";

interface AppProps {
  vscode: WebviewApi<PanelData>;
  dataType: string;
  data: unknown;
}

interface WebviewEvent {
  messageType: string;
  data: PanelData | ToastOptions | LogData;
}

/**
 * The actual component getting displayed based on the data type
 */
const WebviewPanel = ({ panelData }: { panelData: PanelData }) => {
  const { dataType, data } = panelData;

  switch (dataType) {
    case EMPTY_STATE_DATA_TYPE:
      return <NotFound />;
    case METRIC_RESULTS_DATA_TYPE:
      return <MetricResultsPanel data={data as MetricSeriesCollection[]} />;
    case WMI_RESULT_DATA_TYPE:
      return <WmiResultPanel data={data as WmiQueryResult} />;
    case SIMULATOR_DATA_TYPE:
      return <ExtensionSimulator data={data as SimulatorData} />;
    default:
      return <NotFound />;
  }
};

/**
 * A scaffold to load the Page layout and setup any event handlers & listeners
 */
export const App = ({ vscode, dataType, data }: AppProps) => {
  const [panelData, setPanelData] = useState<PanelData>(vscode.getState() ?? { dataType, data });
  const [modalOpen, setModalOpen] = useState(false);
  const [modalContent, setModalContent] = useState("");

  // Handles messages coming from the extension
  const handleMessage = (event: MessageEvent<WebviewEvent>) => {
    const { messageType, data: messageData } = event.data;

    switch (messageType) {
      case "updateData":
        setPanelData(messageData as PanelData);
        break;
      case "showToast":
        showToast(messageData as ToastOptions);
        break;
      case "openLog":
        setModalContent((messageData as LogData).logContent);
        setModalOpen(true);
        break;
    }
  };

  // On any panel data changes, update vscode state
  useEffect(() => {
    vscode.setState(panelData);
  }, [panelData, vscode]);

  // At mount time, add a listener for messages from the extension
  useEffect(() => {
    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, []);

  return (
    <Page>
      <Page.Main>
        <WebviewPanel panelData={panelData} />
      </Page.Main>
      <Modal
        title='Simulation log'
        size='large'
        show={modalOpen}
        onDismiss={() => setModalOpen(false)}
      >
        <CodeSnippet language='bash' showLineNumbers={false}>
          {modalContent}
        </CodeSnippet>
      </Modal>
    </Page>
  );
};

export default App;
