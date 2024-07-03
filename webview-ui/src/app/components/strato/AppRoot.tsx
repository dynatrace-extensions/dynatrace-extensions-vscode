/**
 * @license
 * Copyright 2023 Dynatrace LLC
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
// import { FocusProvider } from "@dynatrace/strato-components-preview";
import Colors from "@dynatrace/strato-design-tokens/colors";
import Typography from "@dynatrace/strato-design-tokens/typography";
import VariablesLight from "@dynatrace/strato-design-tokens/variables";
import VariablesDark from "@dynatrace/strato-design-tokens/variables-dark";
import { getLanguage } from "@dynatrace-sdk/user-preferences";

import React, { forwardRef, useLayoutEffect } from "react";
import { IntlProvider } from "react-intl";
import { createGlobalStyle } from "styled-components";
import "wicg-inert";
import { WithChildren } from "src/app/interfaces/general";
import { FocusProvider } from "@dynatrace/strato-components-preview";

const GlobalStyle = createGlobalStyle(() => {
  const tokens = document.body.classList.contains("vscode-light") ? VariablesLight : VariablesDark;

  const bodyStyles = window.getComputedStyle(document.body);

  return {
    ":root": {
      ...tokens,
      "--dt-colors-background-base-default": bodyStyles.getPropertyValue(
        "--vscode-editor-background",
      ),
      "--dt-colors-background-container-neutral-subdued": bodyStyles.getPropertyValue(
        "--vscode-editorWidget-background",
      ),
      "--scrollbar-track": "transparent",
      "--scrollbar-thumb": Colors.Background.Field.Neutral.Emphasized,
      "--scrollbar-thumb--hover": Colors.Background.Field.Neutral.EmphasizedHover,
      "--scrollbar-thumb--active": Colors.Background.Field.Neutral.EmphasizedActive,
    },

    "html, body": {
      margin: "0",
      WebkitFontSmoothing: "antialiased",
      MozOsxFontSmoothing: "grayscale",

      backgroundColor: Colors.Background.Base.Default,
      color: Colors.Text.Neutral.Default,
      fontFamily: Typography.Text.Base.Default.Family,
      /* Two valid colors are needed or it won't work */
      scrollbarColor: `${Colors.Border.Neutral.Default} var(--scrollbar-track, transparent)`,
    },

    /*Chrome & Safari*/
    "*::-webkit-scrollbar": {
      width: "16px",
      height: "16px",
    },

    "::-webkit-scrollbar-thumb:horizontal": {
      width: "32px",
    },

    "*::-webkit-scrollbar-corner": {
      backgroundColor: "transparent",
    },

    "*::-webkit-scrollbar-track": {
      background: "var(--scrollbar-track)",
    },

    "*::-webkit-scrollbar-thumb": {
      backgroundColor: Colors.Border.Neutral.Default,
      borderRadius: "9999px",
      backgroundClip: "content-box",
      border: "5px solid transparent",
      height: "32px",
    },

    "*::-webkit-scrollbar-thumb:hover": {
      backgroundColor: Colors.Border.Neutral.DefaultHover,
    },

    "*::-webkit-scrollbar-thumb:active": {
      backgroundColor: Colors.Border.Neutral.DefaultActive,
    },
  };
});

/**
 * In order to have all the providers in place for rendering overlays, applying
 * global styles or internationalization, you need to wrap your app in the
 * `AppRoot`. If you're using the `dt-app` to create your app, this is
 * automatically taken care of and you can start working on your app without
 * further ado.
 */
// eslint-disable-next-line react/display-name
export const AppRoot = /* @__PURE__ */ forwardRef<HTMLDivElement, WithChildren>(
  (props, forwardedRef) => {
    const { children } = props;

    const theme = document.body.classList.contains("vscode-light") ? "light" : "dark";
    const language = getLanguage();

    /** Inject the font link into the head */
    useLayoutEffect(() => {
      // As we should not use @import within the createGlobalStyles
      // https://styled-components.com/docs/faqs#note-regarding-css-import-and-createglobalstyle
      // and we need to inject the fonts at run time to decouple font usage
      // from the cli build / deployment
      // we will inject the link tag here in the root on initial load.
      const link = document.createElement("link");

      link.rel = "stylesheet";
      link.href = "https://dt-cdn.net/fonts/fonts.css";
      document.head.appendChild(link);
      return () => {
        document.head.removeChild(link);
      };
    }, []);

    return (
      <div ref={forwardedRef} data-testid='app-root' data-theme={theme}>
        <GlobalStyle />
        <IntlProvider locale={language} messages={{}} defaultLocale='en'>
          <FocusProvider>{children}</FocusProvider>
        </IntlProvider>
      </div>
    );
  },
);

(AppRoot as typeof AppRoot & { displayName: string }).displayName = "AppRoot";
