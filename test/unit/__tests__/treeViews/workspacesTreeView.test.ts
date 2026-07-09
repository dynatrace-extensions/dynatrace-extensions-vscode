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

import { glob } from "glob";
import { ExtensionWorkspaceDto } from "../../../../src/interfaces/treeViews";
import { WorkspaceTreeItem } from "../../../../src/interfaces/treeViews";
import * as fileSystem from "../../../../src/utils/fileSystem";
import * as yamlParsing from "../../../../src/utils/yamlParsing";
import { getWorkspacesTreeDataProvider } from "../../../../src/treeViews/workspacesTreeView";

jest.mock("../../../../src/utils/logging");
jest.mock("../../../../src/utils/fileSystem");
jest.mock("../../../../src/utils/yamlParsing");
jest.mock("glob", () => ({ glob: { sync: jest.fn() } }));
jest.mock("fs", () => ({
  ...jest.requireActual("fs"),
  readFileSync: jest.fn().mockReturnValue(""),
}));

const mockGetAllWorkspaces = fileSystem.getAllWorkspaces as jest.MockedFunction<
  typeof fileSystem.getAllWorkspaces
>;
const mockGlobSync = glob.sync as unknown as jest.Mock;
const mockParseYAML = yamlParsing.parseYAML as unknown as jest.Mock;

const buildWorkspace = (name: string): ExtensionWorkspaceDto => ({
  name,
  id: `id-${name}`,
  folder: `/workspaces/${name}`,
});

const labelOf = (item: WorkspaceTreeItem) => String(item.label);

describe("WorkspacesTreeDataProvider.getChildren()", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("root level (workspaces)", () => {
    it("returns workspaces alphabetically sorted regardless of stored order", () => {
      mockGetAllWorkspaces.mockReturnValue([
        buildWorkspace("gamma"),
        buildWorkspace("alpha"),
        buildWorkspace("beta"),
      ]);

      const items = getWorkspacesTreeDataProvider().getChildren();

      // Labels are upper-cased for display, but ordering is by the raw name.
      expect(items.map(labelOf)).toEqual(["ALPHA", "BETA", "GAMMA"]);
    });

    it("sorts case-insensitively (mixed case)", () => {
      mockGetAllWorkspaces.mockReturnValue([
        buildWorkspace("Gamma"),
        buildWorkspace("alpha"),
        buildWorkspace("Beta"),
      ]);

      const items = getWorkspacesTreeDataProvider().getChildren();

      expect(items.map(labelOf)).toEqual(["ALPHA", "BETA", "GAMMA"]);
    });

    it("does not mutate the array returned by getAllWorkspaces", () => {
      const stored = [buildWorkspace("gamma"), buildWorkspace("alpha")];
      mockGetAllWorkspaces.mockReturnValue(stored);

      getWorkspacesTreeDataProvider().getChildren();

      expect(stored.map(w => w.name)).toEqual(["gamma", "alpha"]);
    });
  });

  describe("child level (extensions)", () => {
    it("returns extensions alphabetically sorted by name", () => {
      // First glob call (root extension), second glob call (nested extensions)
      mockGlobSync.mockReturnValueOnce([]).mockReturnValueOnce([
        "custom-a/extension/extension.yaml",
        "custom-b/extension/extension.yaml",
        "custom-c/extension/extension.yaml",
      ]);
      mockParseYAML
        .mockReturnValueOnce({ name: "zeta", version: "1.0.0" })
        .mockReturnValueOnce({ name: "alpha", version: "1.0.0" })
        .mockReturnValueOnce({ name: "mu", version: "1.0.0" });

      const element = { path: { fsPath: "/workspaces/ws" } } as unknown as WorkspaceTreeItem;
      const items = getWorkspacesTreeDataProvider().getChildren(element);

      expect(items.map(labelOf)).toEqual(["alpha", "mu", "zeta"]);
    });
  });
});
