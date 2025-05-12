type DtWindow = Window &
  typeof globalThis & {
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
  };

export const mockDtRuntime = async (): Promise<void> => {
  const { appShellDefaults } = window as DtWindow;

  // @ts-expect-error
  window.dtRuntime = {
    appEnvironment: {
      getAppId: () => appShellDefaults.appId,
      getAppName: () => appShellDefaults.appName,
      getAppVersion: () => appShellDefaults.appVersion,
      getEnvironmentId: () => appShellDefaults.environmentId,
      getEnvironmentUrl: () => appShellDefaults.environmentUrl,
    },
    userPreferences: {
      getTheme: () => appShellDefaults.theme,
      getTimezone: () => appShellDefaults.timezone,
      getLanguage: () => appShellDefaults.language,
      getRegionalFormat: () => appShellDefaults.regionalFormat,
    },
    navigation: {
      getIntentLink: (intentPayload: object, appId: string, intentId: string) => {
        const hashPayload = `#${encodeURIComponent(JSON.stringify(intentPayload))}`;
        if (!appId || !intentId) {
          return `${appShellDefaults.environmentUrl}/ui/intent/${hashPayload}`;
        }
        return `${appShellDefaults.environmentUrl}/ui/intent/${appId}/${intentId}${hashPayload}`;
      },
    },
  };
};
