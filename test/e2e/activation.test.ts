import * as vscode from "vscode";
import { waitForCondition } from "../utils";

jest.mock("../../src/utils/logging");

describe("Extension", () => {
  let extension: vscode.Extension<unknown> | undefined;

  beforeAll(async () => {
    extension = vscode.extensions.getExtension<unknown>(
      "DynatracePlatformExtensions.dynatrace-extensions",
    );
  });

  it("should be available on the system", () => {
    expect(extension).toBeDefined();
  });

  it("should activate within 2 seconds", () => {
    const actualState = () => (extension ? extension.isActive : false);
    return waitForCondition(actualState, { timeout: 2000 }).then(() => {
      expect(actualState()).toBe(true);
    });
  });
});
