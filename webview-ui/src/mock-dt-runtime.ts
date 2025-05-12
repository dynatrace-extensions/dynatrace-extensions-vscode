export type DtRuntime = {
  appShellDefaults: {
    appId: string;
    appName: string;
    appVersion: string;
    environmentId: string;
    environmentUrl: string;
    regionalFormat: string;
    language: string;
    timezone: string;
    theme: string;
  };
  dtRuntime: {
    appEnvironment: {
      getAppId: () => string;
      getAppName: () => string;
      getAppVersion: () => string;
      getEnvironmentId: () => string;
      getEnvironmentUrl: () => string;
    };
    userPreferences: {
      getTheme: () => string;
      getTimezone: () => string;
      getLanguage: () => string;
      getRegionalFormat: () => string;
    };
    navigation: {
      getIntentLink: (intentPayload: object, appId: string, intentId: string) => string;
    };
  };
};

/**
 * Mock the dtRuntime object which AppRoot will expect to be present.
 */
export const mockDtRuntime = async (): Promise<void> => {
  // Defaults already prepared by the extension panel manager.
  const {
    appId,
    appName,
    appVersion,
    environmentId,
    environmentUrl,
    theme,
    language,
    regionalFormat,
    timezone,
  } = window.appShellDefaults;

  window.dtRuntime = {
    appEnvironment: {
      getAppId: () => appId,
      getAppName: () => appName,
      getAppVersion: () => appVersion,
      getEnvironmentId: () => environmentId,
      getEnvironmentUrl: () => environmentUrl,
    },
    userPreferences: {
      getTheme: () => theme,
      getTimezone: () => timezone,
      getLanguage: () => language,
      getRegionalFormat: () => regionalFormat,
    },
    navigation: {
      getIntentLink: (intentPayload: object, appId: string, intentId: string) => {
        const hashPayload = `#${encodeURIComponent(JSON.stringify(intentPayload))}`;
        if (!appId || !intentId) {
          return `${environmentUrl}/ui/intent/${hashPayload}`;
        }
        return `${environmentUrl}/ui/intent/${appId}/${intentId}${hashPayload}`;
      },
    },
  };
};
