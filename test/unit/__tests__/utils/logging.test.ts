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

import fs from "fs";
import vscode from "vscode";
import * as extension from "../../../../src/extension";
import { notify } from "../../../../src/utils/logging";

jest.mock("fs");
jest.mock("../../../../src/extension");

const mockFs = fs as jest.Mocked<typeof fs>;
const mockExtension = extension as jest.Mocked<typeof extension>;

const setupMocks = () => {
  mockExtension.getActivationContext.mockReturnValue({
    logUri: { fsPath: "/mock/logs" },
  } as unknown as vscode.ExtensionContext);
  mockFs.statSync.mockReturnValue({ size: 0 } as fs.Stats);
  mockFs.writeFileSync.mockImplementation(() => undefined);
  mockFs.readdirSync.mockReturnValue([]);
  (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
    get: jest.fn().mockReturnValue("INFO"),
  });
  (vscode.window.createOutputChannel as jest.Mock).mockReturnValue({
    appendLine: jest.fn(),
    dispose: jest.fn(),
  });
};

describe("notify()", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupMocks();
  });

  describe("no-actions path (backward compat)", () => {
    it("calls showWarningMessage with only the message when no actions passed", () => {
      const mockShow = vscode.window.showWarningMessage as jest.Mock;
      mockShow.mockResolvedValue(undefined);

      notify("WARN", "test message");

      expect(mockShow).toHaveBeenCalledWith("test message");
    });

    it("legacy spread-trace form passes no action titles", () => {
      const mockShow = vscode.window.showWarningMessage as jest.Mock;
      mockShow.mockResolvedValue(undefined);

      notify("WARN", "test message", "trace1", "trace2");

      expect(mockShow).toHaveBeenCalledWith("test message");
    });

    it("INFO level calls showInformationMessage", () => {
      const mockShow = vscode.window.showInformationMessage as jest.Mock;
      mockShow.mockResolvedValue(undefined);

      notify("INFO", "info message");

      expect(mockShow).toHaveBeenCalledWith("info message");
    });

    it("ERROR level calls showErrorMessage", () => {
      const mockShow = vscode.window.showErrorMessage as jest.Mock;
      mockShow.mockResolvedValue(undefined);

      notify("ERROR", "error message");

      expect(mockShow).toHaveBeenCalledWith("error message");
    });
  });

  describe("actions path", () => {
    it("forwards action titles to showWarningMessage", () => {
      const mockShow = vscode.window.showWarningMessage as jest.Mock;
      mockShow.mockResolvedValue(undefined);

      notify("WARN", "test message", {
        actions: [
          { title: "Edit", run: jest.fn() },
          { title: "Migration guide", run: jest.fn() },
        ],
      });

      expect(mockShow).toHaveBeenCalledWith("test message", "Edit", "Migration guide");
    });

    it("invokes the matching action handler when a title is selected", async () => {
      const mockRun = jest.fn().mockResolvedValue(undefined);
      const mockShow = vscode.window.showWarningMessage as jest.Mock;
      mockShow.mockResolvedValue("Edit");

      notify("WARN", "test message", {
        actions: [
          { title: "Edit", run: mockRun },
          { title: "Migration guide", run: jest.fn() },
        ],
      });

      await Promise.resolve(); // flush the then() callback

      expect(mockRun).toHaveBeenCalled();
    });

    it("does not invoke any handler when notification is dismissed", async () => {
      const mockRun1 = jest.fn();
      const mockRun2 = jest.fn();
      const mockShow = vscode.window.showWarningMessage as jest.Mock;
      mockShow.mockResolvedValue(undefined);

      notify("WARN", "test message", {
        actions: [
          { title: "Edit", run: mockRun1 },
          { title: "Migration guide", run: mockRun2 },
        ],
      });

      await Promise.resolve();

      expect(mockRun1).not.toHaveBeenCalled();
      expect(mockRun2).not.toHaveBeenCalled();
    });

    it("accepts trace alongside actions", () => {
      const mockShow = vscode.window.showWarningMessage as jest.Mock;
      mockShow.mockResolvedValue(undefined);

      notify("WARN", "test message", {
        trace: ["traceA", "traceB"],
        actions: [{ title: "Edit", run: jest.fn() }],
      });

      expect(mockShow).toHaveBeenCalledWith("test message", "Edit");
    });
  });
});
