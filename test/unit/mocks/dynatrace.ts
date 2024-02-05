import { CredentialVaultService } from "../../../src/dynatrace-api/configuration_v1/credentialVault";
import { DashboardService } from "../../../src/dynatrace-api/configuration_v1/dashboards";
import { ExtensionsServiceV1 } from "../../../src/dynatrace-api/configuration_v1/extensions";
import { Dynatrace } from "../../../src/dynatrace-api/dynatrace";
import { ActiveGatesService } from "../../../src/dynatrace-api/environment_v2/activegates";
import { ExtensionsServiceV2 } from "../../../src/dynatrace-api/environment_v2/extensions";
import { MetricService } from "../../../src/dynatrace-api/environment_v2/metrics";
import { EntityServiceV2 } from "../../../src/dynatrace-api/environment_v2/monitoredEntities";
import { SettingsService } from "../../../src/dynatrace-api/environment_v2/settings";
import { Entity } from "../../../src/dynatrace-api/interfaces/monitoredEntities";

export const mockEntities: Record<string, Entity[]> = {
  "type(mock1)": [
    { type: "mock1", entityId: "mock1", displayName: "mock1", firstSeenTms: 1, lastSeenTms: 2 },
  ],
  "type(mock2)": [
    { type: "mock2", entityId: "mock2", displayName: "mock2", firstSeenTms: 3, lastSeenTms: 4 },
  ],
};

export class MockDynatrace extends Dynatrace {
  entitiesV2 = {
    list: (selector: string) => Promise.resolve(mockEntities[selector]),
    listTypes: () => Promise.resolve(["mock1", "mock2"]),
  } as unknown as EntityServiceV2;

  activeGates = jest.fn() as unknown as ActiveGatesService;
  credentialVault = jest.fn() as unknown as CredentialVaultService;
  dashboards = jest.fn() as unknown as DashboardService;
  extensionsV1 = jest.fn() as unknown as ExtensionsServiceV1;
  extensionsV2 = jest.fn() as unknown as ExtensionsServiceV2;
  metrics = jest.fn() as unknown as MetricService;
  settings = jest.fn() as unknown as SettingsService;

  constructor() {
    super("", "");
  }
}
