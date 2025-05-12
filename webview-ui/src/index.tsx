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

import React from "react";
import ReactDOM from "react-dom/client";
import styled, { createGlobalStyle } from "styled-components";
import App from "./app/App";
import { PanelData } from "./app/interfaces/general";
import { DtRuntime, mockDtRuntime } from "./mock-dt-runtime";
import { AppRoot } from "@dynatrace/strato-components";
import { ToastContainer } from "@dynatrace/strato-components-preview";

declare global {
  interface Window extends DtRuntime {
    panelData: PanelData;
  }
}

// A map of Dynatrace theme variables to equivalent VSCode ones.
const THEME_VARIABLES: { dtVar: string; vsVar: string }[] = [
  {
    dtVar: "--dt-colors-background-base-default",
    vsVar: "--vscode-editor-background",
  },
  {
    dtVar: "--dt-colors-background-container-neutral-subdued",
    vsVar: "--vscode-editorWidget-background",
  },
];

/**
 * GlobalStyle points Dynatrace's CSS variables to VSCode ones to achieve a similar look and feel
 * to the user's VS Code theme.
 */
const GlobalStyle = createGlobalStyle(
  () => `
  :root {
    ${THEME_VARIABLES.map(({ dtVar, vsVar }) => `${dtVar}: var(${vsVar}) !important;`).join("\n")}
  }
`,
);

const vscode = window.acquireVsCodeApi<PanelData>();
mockDtRuntime().then(() => {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <>
      <GlobalStyle />
      <AppRoot>
        <App vscode={vscode} dataType={window.panelData.dataType} data={window.panelData.data} />
        <ToastContainer />
      </AppRoot>
    </>,
  );
});
