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
  buildIntentUrl,
  classifyUaScreenFile,
  extractNodeType,
} from "../../../../src/codeLens/platformUaLens";

jest.mock("../../../../src/utils/logging");
jest.mock("../../../../src/treeViews/tenantsTreeView");

describe("classifyUaScreenFile()", () => {
  it.each([
    "custom.tech-entitydetails.screen.json",
    "/abs/path/extension/screens/foo-entitydetails.screen.json",
    "foo-detailsinjection.screen.json",
  ])("classifies %s as details", fileName => {
    expect(classifyUaScreenFile(fileName)).toBe("details");
  });

  it.each([
    "custom.tech-inventory.screen.json",
    "/abs/path/extension/screens/foo-inventory.screen.json",
    "foo-inventoryinjection.screen.json",
  ])("classifies %s as inventory", fileName => {
    expect(classifyUaScreenFile(fileName)).toBe("inventory");
  });

  it.each([
    "foo.screen.json",
    "foo-list.screen.json",
    "extension.yaml",
    "foo-inventory.json",
  ])("returns null for unrelated file %s", fileName => {
    expect(classifyUaScreenFile(fileName)).toBeNull();
  });

  it("handles windows-style separators", () => {
    expect(classifyUaScreenFile("C:\\ws\\extension\\screens\\a-inventory.screen.json")).toBe(
      "inventory",
    );
  });
});

describe("extractNodeType()", () => {
  it("reads target.nodeType for details screens", () => {
    const content = JSON.stringify({ target: { nodeType: "MY_NODE" } });
    expect(extractNodeType("details", content)).toBe("MY_NODE");
  });

  it("reads metadata.nodeType for inventory screens", () => {
    const content = JSON.stringify({ metadata: { nodeType: "MY_NODE" } });
    expect(extractNodeType("inventory", content)).toBe("MY_NODE");
  });

  it("returns null when the node type is missing", () => {
    expect(extractNodeType("details", JSON.stringify({ target: {} }))).toBeNull();
    expect(extractNodeType("inventory", JSON.stringify({ metadata: {} }))).toBeNull();
  });

  it("returns null for the wrong field (details reads target, not metadata)", () => {
    const content = JSON.stringify({ metadata: { nodeType: "MY_NODE" } });
    expect(extractNodeType("details", content)).toBeNull();
  });

  it("returns null for malformed JSON", () => {
    expect(extractNodeType("details", "{ not valid json")).toBeNull();
  });
});

describe("buildIntentUrl()", () => {
  it("builds a details intent URL with URL-encoded payload", () => {
    const url = buildIntentUrl(
      "https://abc.apps.dynatrace.com",
      "view_smartscape_technology_details",
      { extensionNodeId: "node-123" },
    );
    expect(url).toBe(
      "https://abc.apps.dynatrace.com/ui/intent/dynatrace.infraops/view_smartscape_technology_details#" +
        encodeURIComponent(JSON.stringify({ extensionNodeId: "node-123" })),
    );
  });

  it("builds an inventory intent URL with URL-encoded payload", () => {
    const url = buildIntentUrl(
      "https://abc.apps.dynatrace.com",
      "view_smartscape_technology_inventory",
      { extensionNodeType: "MY_NODE" },
    );
    expect(url).toBe(
      "https://abc.apps.dynatrace.com/ui/intent/dynatrace.infraops/view_smartscape_technology_inventory#" +
        encodeURIComponent(JSON.stringify({ extensionNodeType: "MY_NODE" })),
    );
  });

  it("trims a trailing slash from the base tenant URL", () => {
    const url = buildIntentUrl("https://abc.apps.dynatrace.com/", "view_x", { a: "b" });
    expect(url).toContain("https://abc.apps.dynatrace.com/ui/intent/dynatrace.infraops/view_x#");
    expect(url).not.toContain(".com//ui");
  });
});
