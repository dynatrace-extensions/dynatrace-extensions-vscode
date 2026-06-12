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

import { EnvironmentCommand } from "@common";
import vscode from "vscode";
import { DynatraceTenantDto } from "../../../../src/interfaces/treeViews";
import * as cryptography from "../../../../src/utils/cryptography";
import * as fileSystem from "../../../../src/utils/fileSystem";
import logger from "../../../../src/utils/logging";
import {
  checkTenantSetup,
  getTenantById,
  getTenantsTreeDataProvider,
} from "../../../../src/treeViews/tenantsTreeView";

jest.mock("../../../../src/utils/logging");
jest.mock("../../../../src/utils/cryptography");
jest.mock("../../../../src/utils/fileSystem");
jest.mock("../../../../src/statusBar/connection", () => ({
  showConnectedStatusBar: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../../../../src/dynatrace-api/dynatrace", () => ({
  createDynatraceClient: jest.fn().mockReturnValue({}),
}));
jest.mock("../../../../src/extension", () => ({
  getActivationContext: jest.fn().mockReturnValue({
    logUri: { fsPath: "/mock/logs" },
  }),
}));

const mockDecryptToken = cryptography.decryptToken as jest.MockedFunction<
  typeof cryptography.decryptToken
>;
const mockGetAllTenants = fileSystem.getAllTenants as jest.MockedFunction<
  typeof fileSystem.getAllTenants
>;
const mockNotify = logger.notify as jest.Mock;

const buildTenant = (overrides: Partial<DynatraceTenantDto> = {}): DynatraceTenantDto => ({
  id: "abc12345",
  url: "https://abc12345.apps.dynatrace.com",
  token: "encrypted-token",
  current: false,
  label: "My Tenant",
  deploymentModel: "saas",
  ...overrides,
});

describe("checkTenantSetup()", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDecryptToken.mockReturnValue("dt0s20.someplatformtoken");
  });

  describe("issue detection", () => {
    it("returns null for a compliant saas tenant", () => {
      const tenant = buildTenant({ url: "https://abc12345.apps.dynatrace.com" });
      expect(checkTenantSetup(tenant)).toBeNull();
    });

    it("detects legacy live.dynatrace.com URL", () => {
      const tenant = buildTenant({ url: "https://abc12345.live.dynatrace.com" });
      expect(checkTenantSetup(tenant)).not.toBeNull();
    });

    it("detects legacy sprint.dynatracelabs.com URL", () => {
      const tenant = buildTenant({ url: "https://abc12345.sprint.dynatracelabs.com" });
      expect(checkTenantSetup(tenant)).not.toBeNull();
    });

    it("detects legacy dt0c01 token for saas tenant", () => {
      mockDecryptToken.mockReturnValue("dt0c01.legacytoken");
      const tenant = buildTenant({ url: "https://abc12345.apps.dynatrace.com" });
      expect(checkTenantSetup(tenant)).not.toBeNull();
    });

    it("detects legacy dt0s01 token for saas tenant", () => {
      mockDecryptToken.mockReturnValue("dt0s01.legacytoken");
      const tenant = buildTenant({ url: "https://abc12345.apps.dynatrace.com" });
      expect(checkTenantSetup(tenant)).not.toBeNull();
    });

    it("does not check token for managed tenants", () => {
      mockDecryptToken.mockReturnValue("dt0c01.legacytoken");
      const tenant = buildTenant({
        url: "https://host.example.com/e/env-id",
        deploymentModel: "managed",
      });
      expect(checkTenantSetup(tenant)).toBeNull();
    });
  });

  describe("notify=true with non-compliant tenant", () => {
    it("calls logger.notify with Edit and Migration guide actions", () => {
      const tenant = buildTenant({ url: "https://abc12345.live.dynatrace.com" });

      checkTenantSetup(tenant, true);

      expect(mockNotify).toHaveBeenCalledWith(
        "WARN",
        expect.stringContaining("My Tenant"),
        expect.objectContaining({
          actions: expect.arrayContaining([
            expect.objectContaining({ title: "Edit" }),
            expect.objectContaining({ title: "Migration guide" }),
          ]),
        }),
      );
    });

    it("Edit action dispatches EnvironmentCommand.Edit with resolved tree item", async () => {
      const tenant = buildTenant({ url: "https://abc12345.live.dynatrace.com" });

      // Set up tenant in tree so getTenantById can find it
      mockGetAllTenants.mockReturnValue([tenant]);
      mockDecryptToken.mockReturnValue("dt0c01.legacy");
      (vscode.commands.executeCommand as jest.Mock).mockResolvedValue(undefined);

      checkTenantSetup(tenant, true);

      // Extract the Edit action from the notify call
      const notifyOptions = mockNotify.mock.calls[0][2] as {
        actions: { title: string; run: () => Promise<void> }[];
      };
      const editAction = notifyOptions.actions.find(a => a.title === "Edit");
      expect(editAction).toBeDefined();

      await editAction!.run();

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        EnvironmentCommand.Edit,
        expect.anything(),
      );
    });

    it("Edit action logs warn when tenant cannot be resolved", async () => {
      const tenant = buildTenant({
        id: "missing-id",
        url: "https://abc12345.live.dynatrace.com",
      });
      mockGetAllTenants.mockReturnValue([]); // no tenants

      checkTenantSetup(tenant, true);

      const notifyOptions = mockNotify.mock.calls[0][2] as {
        actions: { title: string; run: () => Promise<void> }[];
      };
      const editAction = notifyOptions.actions.find(a => a.title === "Edit");

      await editAction!.run();

      expect(logger.warn).toHaveBeenCalled();
      expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith(
        EnvironmentCommand.Edit,
        expect.anything(),
      );
    });

    it("Migration guide action dispatches EnvironmentCommand.OpenMigrationGuide", async () => {
      const tenant = buildTenant({ url: "https://abc12345.live.dynatrace.com" });
      (vscode.commands.executeCommand as jest.Mock).mockResolvedValue(undefined);

      checkTenantSetup(tenant, true);

      const notifyOptions = mockNotify.mock.calls[0][2] as {
        actions: { title: string; run: () => Promise<void> }[];
      };
      const guideAction = notifyOptions.actions.find(a => a.title === "Migration guide");

      await guideAction!.run();

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        EnvironmentCommand.OpenMigrationGuide,
      );
    });

    it("does not call logger.notify for compliant tenants", () => {
      const tenant = buildTenant({ url: "https://abc12345.apps.dynatrace.com" });

      checkTenantSetup(tenant, true);

      expect(mockNotify).not.toHaveBeenCalled();
    });
  });
});

describe("getTenantById()", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns the matching DynatraceTenant by id", async () => {
    const tenant = buildTenant({ id: "target-id", current: false });
    mockDecryptToken.mockReturnValue("dt0s20.platformtoken");
    mockGetAllTenants.mockReturnValue([tenant]);

    const result = await getTenantById("target-id");

    expect(result).toBeDefined();
    expect(result?.id).toBe("target-id");
  });

  it("returns undefined when no tenant matches the id", async () => {
    mockGetAllTenants.mockReturnValue([]);

    const result = await getTenantById("nonexistent-id");

    expect(result).toBeUndefined();
  });
});

describe("contextValue factory", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("assigns base contextValue for compliant non-current tenant", async () => {
    const tenant = buildTenant({ current: false, url: "https://abc12345.apps.dynatrace.com" });
    mockDecryptToken.mockReturnValue("dt0s20.platform");
    mockGetAllTenants.mockReturnValue([tenant]);

    const children = await getTenantsTreeDataProvider().getChildren();
    const item = children.find(c => c.id === tenant.id);

    expect(item?.contextValue).toBe("dynatraceEnvironment");
  });

  it("assigns NonCompliant suffix for non-compliant non-current tenant", async () => {
    const tenant = buildTenant({ current: false, url: "https://abc12345.live.dynatrace.com" });
    mockDecryptToken.mockReturnValue("dt0s20.platform");
    mockGetAllTenants.mockReturnValue([tenant]);

    const children = await getTenantsTreeDataProvider().getChildren();
    const item = children.find(c => c.id === tenant.id);

    expect(item?.contextValue).toBe("dynatraceEnvironmentNonCompliant");
  });

  it("assigns currentDynatraceEnvironmentNonCompliant for non-compliant current tenant", async () => {
    const tenant = buildTenant({ current: true, url: "https://abc12345.live.dynatrace.com" });
    mockDecryptToken.mockReturnValue("dt0s20.platform");
    mockGetAllTenants.mockReturnValue([tenant]);

    const children = await getTenantsTreeDataProvider().getChildren();
    const item = children.find(c => c.id === tenant.id);

    expect(item?.contextValue).toBe("currentDynatraceEnvironmentNonCompliant");
  });

  it("assigns currentDynatraceEnvironment for compliant current tenant", async () => {
    const tenant = buildTenant({ current: true, url: "https://abc12345.apps.dynatrace.com" });
    mockDecryptToken.mockReturnValue("dt0s20.platform");
    mockGetAllTenants.mockReturnValue([tenant]);

    const children = await getTenantsTreeDataProvider().getChildren();
    const item = children.find(c => c.id === tenant.id);

    expect(item?.contextValue).toBe("currentDynatraceEnvironment");
  });
});
