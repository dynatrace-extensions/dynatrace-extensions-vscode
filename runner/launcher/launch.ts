import * as path from "path";
import { runTests } from "@vscode/test-electron";

async function main() {
  // Project root is 3 levels up from out/runner/launcher/
  const extensionDevelopmentPath = path.resolve(__dirname, "../../..");
  // Compiled harness entry point (no .js extension; Node resolves it)
  const extensionTestsPath = path.resolve(__dirname, "../harness/convertScreensHarness");
  const workspaceDir =
    process.env.HEADLESS_WORKSPACE_PATH ??
    path.resolve(__dirname, "../../../runner/docker/workspace");

  const vscodeVersion = process.env.VSCODE_VERSION;

  console.log("[Launcher] extensionDevelopmentPath:", extensionDevelopmentPath);
  console.log("[Launcher] extensionTestsPath:", extensionTestsPath);
  console.log("[Launcher] workspaceDir:", workspaceDir);
  if (process.env.VSCODE_USER_DATA_DIR) {
    console.log("[Launcher] user-data-dir:", process.env.VSCODE_USER_DATA_DIR);
  }
  if (vscodeVersion) {
    console.log("[Launcher] vscode version:", vscodeVersion);
  }

  await runTests({
    extensionDevelopmentPath,
    extensionTestsPath,
    ...(vscodeVersion ? { version: vscodeVersion } : {}),
    launchArgs: [
      workspaceDir,
      "--disable-extensions",
      "--disable-gpu",
      "--no-sandbox",
      "--disable-workspace-trust",
      ...(process.env.VSCODE_USER_DATA_DIR
        ? [`--user-data-dir=${process.env.VSCODE_USER_DATA_DIR}`]
        : []),
    ],
  });
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error("[Launcher] Failed:", err);
    process.exit(1);
  });
