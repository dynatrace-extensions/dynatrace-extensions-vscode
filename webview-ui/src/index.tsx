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

import { ToastContainer } from "@dynatrace/strato-components-preview";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./app/App";
import { AppRoot } from "./app/components/strato/AppRoot";
import { PanelData } from "./app/interfaces/general";

declare global {
  interface Window {
    panelData: PanelData;
  }
}

const vscode = window.acquireVsCodeApi<PanelData>();
const root = ReactDOM.createRoot(document.getElementById("root")!);
root.render(
  <AppRoot>
    <App vscode={vscode} dataType={window.panelData.dataType} data={window.panelData.data} />
    <ToastContainer />
  </AppRoot>
);
