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

import {
  createDynatraceClient,
  ManagedDynatraceClient,
} from "../../../../src/dynatrace-api/dynatrace";
import { SaaSDynatraceClient } from "../../../../src/dynatrace-api/dynatrace";

jest.mock("../../../../src/dynatrace-api/http_client");
jest.mock("../../../../src/dynatrace-api/sdk/sdkClientFactory", () => ({
  createSdkClients: () => ({
    definitions: {},
    configurations: {},
    schema: {},
    environment: {},
    discovery: {},
    settingsObjects: {},
    settingsSchemas: {},
  }),
}));
jest.mock("../../../../src/utils/logging");

describe("createDynatraceClient", () => {
  it("returns a ManagedDynatraceClient for managed deployment model", () => {
    const client = createDynatraceClient("https://host/e/abc123", "dt0c01.token", "managed");

    expect(client).toBeInstanceOf(ManagedDynatraceClient);
  });

  it("returns a SaaSDynatraceClient for saas deployment model", () => {
    const client = createDynatraceClient("https://abc.apps.dynatrace.com", "dt0s16.token", "saas");

    expect(client).toBeInstanceOf(SaaSDynatraceClient);
  });
});

describe("ManagedDynatraceClient", () => {
  it("exposes all expected service properties", () => {
    const client = new ManagedDynatraceClient("https://host/e/abc123", "dt0c01.token");

    expect(client.extensionsV2).toBeDefined();
    expect(client.extensionsV1).toBeDefined();
    expect(client.credentialVault).toBeDefined();
    expect(client.entitiesV2).toBeDefined();
    expect(client.metrics).toBeDefined();
    expect(client.settings).toBeDefined();
    expect(client.dashboards).toBeDefined();
    expect(client.activeGates).toBeDefined();
  });
});

describe("SaaSDynatraceClient", () => {
  it("exposes all expected service properties", () => {
    const client = new SaaSDynatraceClient("https://abc.apps.dynatrace.com", "dt0s16.token");

    expect(client.extensionsV2).toBeDefined();
    expect(client.extensionsV1).toBeDefined();
    expect(client.credentialVault).toBeDefined();
    expect(client.entitiesV2).toBeDefined();
    expect(client.metrics).toBeDefined();
    expect(client.settings).toBeDefined();
    expect(client.dashboards).toBeDefined();
    expect(client.activeGates).toBeDefined();
  });
});
