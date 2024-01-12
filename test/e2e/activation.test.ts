import * as vscode from "vscode";
import { waitForCondition } from "../utils";

jest.mock("../../src/utils/logging");

describe("Extension", () => {
  let extension: vscode.Extension<unknown> | undefined;

  beforeAll(() => {
    extension = vscode.extensions.getExtension<unknown>(
      "DynatracePlatformExtensions.dynatrace-extensions",
    );
  });

  it("should be available on the system", () => {
    expect(extension).toBeDefined();
  });

  it("should activate within 1 second", () => {
    const actualState = () => (extension ? extension.isActive : false);
    return waitForCondition(actualState, { timeout: 1000 }).then(() => {
      expect(actualState()).toBe(true);
    });
  });

  afterAll(done => {
    done();
  })
});
