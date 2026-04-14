import { DynatraceClient } from "../../../src/dynatrace-api/dynatrace";
import { ActiveGatesServiceInterface, CredentialVaultServiceInterface, DashboardServiceInterface, ExtensionsServiceV1Interface, ExtensionsServiceV2Interface, MetricServiceInterface, SettingsServiceInterface } from "../../../src/dynatrace-api/interfaces/services";
import { EntityServiceV2 } from "../../../src/dynatrace-api/environment_v2/monitoredEntities";
import { Entity } from "../../../src/dynatrace-api/interfaces/monitoredEntities";

export const mockEntities: Record<string, Entity[]> = {
  "type(mock1)": [
    { type: "mock1", entityId: "mock1", displayName: "mock1", firstSeenTms: 1, lastSeenTms: 2 },
  ],
  "type(mock2)": [
    { type: "mock2", entityId: "mock2", displayName: "mock2", firstSeenTms: 3, lastSeenTms: 4 },
  ],
};

export class MockDynatrace implements DynatraceClient {
  entitiesV2 = {
    list: (selector: string) => Promise.resolve(mockEntities[selector]),
    listTypes: () => Promise.resolve(["mock1", "mock2"]),
  } as unknown as EntityServiceV2;

  activeGates = jest.fn() as unknown as ActiveGatesServiceInterface;
  credentialVault = jest.fn() as unknown as CredentialVaultServiceInterface;
  dashboards = jest.fn() as unknown as DashboardServiceInterface;
  extensionsV1 = jest.fn() as unknown as ExtensionsServiceV1Interface;
  extensionsV2 = jest.fn() as unknown as ExtensionsServiceV2Interface;
  metrics = jest.fn() as unknown as MetricServiceInterface;
  settings = jest.fn() as unknown as SettingsServiceInterface;
}
