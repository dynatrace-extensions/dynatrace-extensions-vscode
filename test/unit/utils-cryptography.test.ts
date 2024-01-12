import { readFileSync } from "fs";
import * as path from "path";
import mock = require("mock-fs");
import { sign } from "../../src/utils/cryptography";

jest.mock("../../src/utils/logging");

describe("Cryptography Utils - Sign", () => {
  let expectedCms: string;
  let developerCertKey: string;

  beforeAll(() => {
    developerCertKey = readFileSync(
      path.resolve(__dirname, "test_data", "cryptography", "test_developer.pem"),
    ).toString();

    expectedCms = readFileSync(
      path.resolve(__dirname, "test_data", "cryptography", "expected_cms.pem"),
    ).toString();

    mock({
      mock: {
        "extension.zip": "AAA",
        "developer.pem": developerCertKey,
      },
    });
  });

  it("should create expected signature", () => {
    // Sign and normalize line endings
    const cms = sign("mock/extension.zip", "mock/developer.pem").replace(/\r?\n|\r/g, "\n");
    expect(cms).toEqual(expectedCms);
  });

  afterAll(() => {
    mock.restore();
  });
});
