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

import path from "path";
import vscode from "vscode";
import * as cachingUtils from "../../../../src/utils/caching";
import { updateDiagnosticsCollection, getDiagnostics } from "../../../../src/utils/diagnostics";
import { parseYAML } from "../../../../src/utils/yamlParsing";
import { readTestDataFile } from "../../../shared/utils";
import { MockDiagnosticCollection } from "../../mocks/vscode";

jest.mock("../../../../src/utils/logging");

describe("Extension YAML Diagnostics", () => {
  beforeAll(() => {
    // Swap vscode DiagnosticCollection with our mock
    jest
      .spyOn(vscode.languages, "createDiagnosticCollection")
      .mockImplementation((name?: string) => new MockDiagnosticCollection(name ?? "Mock"));

    // Swap actual extension settings, with our mock that enables all diagnostics
    jest.spyOn(vscode.workspace, "getConfiguration").mockImplementation(() => {
      const settings: Record<string, unknown> = {
        "diagnostics": true,
        "diagnostics.extensionName": false,
        "diagnostics.metricKeys": true,
        "diagnostics.cardKeys": true,
        "diagnostics.variables": true,
        "diagnostics.snmp": true,
      };
      return {
        get: <T>(config: string) => settings[config] as T,
        has: jest.fn(),
        inspect: jest.fn(),
        update: jest.fn(),
      };
    });
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  describe("updateDiagnosticsCollection", () => {
    let getCachedParsedExtensionSpy: jest.SpyInstance;

    beforeEach(() => {
      getCachedParsedExtensionSpy = jest.spyOn(cachingUtils, "getCachedParsedExtension");
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it("should run against sample extension", async () => {
      // Diagnostics uses parsed extension from cache, so we must mock the cache
      getCachedParsedExtensionSpy.mockReturnValue(
        parseYAML(readTestDataFile(path.join("manifests", "diagnostics-extension.yaml"))),
      );

      const textDocument = await vscode.workspace.openTextDocument(
        vscode.Uri.file(
          path.resolve(
            __dirname,
            "..",
            "..",
            "test_data",
            "manifests",
            "diagnostics-extension.yaml",
          ),
        ),
      );

      await updateDiagnosticsCollection(textDocument);

      const diagnostics = getDiagnostics(textDocument.uri);

      expect(diagnostics.length).toBe(4);
    }, 30_000);
  });

  describe("diagnoseCardKeys", () => {
    const manifestPath = path.resolve(
      __dirname,
      "..",
      "..",
      "test_data",
      "manifests",
      "screen-cards-extension.yaml",
    );

    let content: string;
    let textDocument: vscode.TextDocument;
    let diagnostics: vscode.Diagnostic[];

    beforeAll(async () => {
      content = readTestDataFile(path.join("manifests", "screen-cards-extension.yaml"));
      jest
        .spyOn(cachingUtils, "getCachedParsedExtension")
        .mockReturnValue(
          parseYAML(content) as ReturnType<typeof cachingUtils.getCachedParsedExtension>,
        );

      textDocument = await vscode.workspace.openTextDocument(vscode.Uri.file(manifestPath));
      await updateDiagnosticsCollection(textDocument);
      diagnostics = getDiagnostics(textDocument.uri).filter(
        d => d.code === "DED008" || d.code === "DED009",
      );
    });

    afterAll(() => {
      jest.restoreAllMocks();
    });

    /** The 0-based line the given text is on, for readable expectations. */
    const lineOf = (text: string) =>
      content.substring(0, content.indexOf(text)).split("\n").length - 1;

    it("should only flag the genuine mismatches", () => {
      expect(diagnostics.map(d => d.code).sort()).toEqual(["DED008", "DED009"]);
    });

    it("should flag a reference with no definition, at the reference", () => {
      const referenceNotDefined = diagnostics.filter(d => d.code === "DED008");

      expect(referenceNotDefined).toHaveLength(1);
      expect(referenceNotDefined[0].range.start.line).toBe(lineOf("key: vpn_missing_dql"));
    });

    it("should flag a definition with no reference, at the definition", () => {
      const definedNotReferenced = diagnostics.filter(d => d.code === "DED009");

      // The screen also has a properties attribute called "vpn_unused" - the decoy must not
      // capture the diagnostic away from the card definition.
      expect(definedNotReferenced).toHaveLength(1);
      expect(definedNotReferenced[0].range.start.line).toBe(
        lineOf("key: vpn_unused\n        displayName: Unused"),
      );
      expect(textDocument.getText(definedNotReferenced[0].range)).toBe("vpn_unused");
    });

    it.each([
      ["dqlTableCards (issue #326)", "queue_list_vpn_dql"],
      ["cards nested in a CARD_GROUP", "queue_message"],
      ["cards nested in a nested CARD_GROUP", "queue_logs"],
      ["cards referenced from a list of detailsSettings", "queue_events"],
      ["INJECTIONS placeholders", "queue_injection_point"],
      ["card types not known to this extension", "queue_future"],
      ["injections resolved against another screen", "vpn_injected_elsewhere"],
    ])("should not flag %s", (_, cardKey) => {
      const flagged = diagnostics.filter(d => textDocument.getText(d.range).includes(cardKey));

      expect(flagged).toEqual([]);
    });
  });
});
