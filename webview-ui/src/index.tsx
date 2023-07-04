import React from "react";
import ReactDOM from "react-dom";
import App from "./app/App";
import { AppRoot } from "./app/components/core/AppRoot";

declare global {
  interface Window {
    acquireVsCodeApi(): unknown;
    colorTheme: "dark" | "light";
    panelData: {
      dataType: string;
      data: unknown;
    };
  }
}

const vscode = window.acquireVsCodeApi();

ReactDOM.render(
  <React.StrictMode>
    <AppRoot>
      <App vscode={vscode} dataType={window.panelData.dataType} data={window.panelData.data} />
    </AppRoot>
  </React.StrictMode>,
  document.getElementById("root") as HTMLElement,
);
