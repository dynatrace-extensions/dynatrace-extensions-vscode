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

import { PanelData } from "@common";
import { AppRoot } from "@dynatrace/strato-components";
import { ToastContainer } from "@dynatrace/strato-components-preview";
import React from "react";
import ReactDOM from "react-dom/client";
import { createGlobalStyle } from "styled-components";
import App from "./app/App";
import {
  getAppId,
  getAppName,
  getAppVersion,
  getEnvironmentId,
  getEnvironmentUrl,
} from "./stubs/dynatrace-sdk-app-environment";
import { getIntentLink } from "./stubs/dynatrace-sdk-navigation";
import {
  getLanguage,
  getRegionalFormat,
  getTheme,
  getTimezone,
} from "./stubs/dynatrace-sdk-user-preferences";

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

// Populate window.dtRuntime for strato-components internals that access it directly.
// The stubs for @dynatrace-sdk/* packages read from window.appShellDefaults, which
// is populated by the Webview Panel Manager so this object delegates back to them.
window.dtRuntime = {
  appEnvironment: {
    getAppId,
    getAppName,
    getAppVersion,
    getEnvironmentId,
    getEnvironmentUrl,
  },
  userPreferences: { getTheme, getTimezone, getLanguage, getRegionalFormat },
  navigation: { getIntentLink },
};

const rootElement = document.getElementById("root");
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <>
      <GlobalStyle />
      <AppRoot>
        <App vscode={vscode} dataType={window.panelData.dataType} data={window.panelData.data} />
        <ToastContainer />
      </AppRoot>
    </>,
  );
}
