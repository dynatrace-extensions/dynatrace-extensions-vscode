import { ToastContainer } from "@dynatrace/strato-components-preview";
import React from "react";
import ReactDOM from "react-dom";
import App from "./app/App";
import { AppRoot } from "./app/components/strato/AppRoot";
import { PanelData } from "./app/interfaces/general";

declare global {
  interface Window {
    panelData: PanelData;
  }
}

const vscode = window.acquireVsCodeApi<PanelData>();

ReactDOM.render(
  <React.StrictMode>
    <AppRoot>
      <App vscode={vscode} dataType={window.panelData.dataType} data={window.panelData.data} />
      <ToastContainer />
    </AppRoot>
  </React.StrictMode>,
  document.getElementById("root"),
);
