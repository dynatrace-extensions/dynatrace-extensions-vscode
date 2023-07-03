import React from "react";
import ReactDOM from "react-dom";
import App from "./App";
import { AppRoot } from "@dynatrace/strato-components-preview";

ReactDOM.render(
  <React.StrictMode>
    <AppRoot>
      <App />
    </AppRoot>
  </React.StrictMode>,
  document.getElementById("root") as HTMLElement,
);
