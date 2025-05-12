import * as vscode from "vscode";

export const mockDtRuntime = async (): Promise<void> => {
  const appShellInfo = {
    theme: "dark",
    timezone: "Europe/London",
    origin: "",
  };
  // @ts-expect-error
  window.dtRuntime = {
    appEnvironment: {
      getAppName: () => "DQL Network Inspector",
      getEnvironmentUrl: () => appShellInfo.origin,
    },
    userPreferences: {
      getTheme: () => appShellInfo.theme,
      getTimezone: () => appShellInfo.timezone,
    },
    navigation: {
      getIntentLink: (intentPayload: object, appId: string, intentId: string) => {
        const hashPayload = `#${encodeURIComponent(JSON.stringify(intentPayload))}`;
        if (!appId || !intentId) {
          return `${appShellInfo.origin}/ui/intent/${hashPayload}`;
        }
        return `${appShellInfo.origin}/ui/intent/${appId}/${intentId}${hashPayload}`;
      },
    },
  };
};

export type WindowWithDtRuntime = Window &
  typeof globalThis & {
    dtRuntime: {
      appEnvironment: {
        getAppName: () => string;
        getEnvironmentUrl: () => string;
      };
    };
  };
