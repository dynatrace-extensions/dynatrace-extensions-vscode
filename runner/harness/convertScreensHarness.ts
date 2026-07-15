import * as fs from "fs";
import * as vscode from "vscode";
import * as yaml from "yaml";

const EXTENSION_ID = "DynatracePlatformExtensions.dynatrace-extensions";
const COMMAND_ID = "dynatrace-extensions.convertScreens";
// Allow RxJS BehaviorSubject caches (parsedExtension, pipelineFiles) to settle
// after activation before the command reads them.
const CACHE_SETTLE_MS = 2000;

export async function run(): Promise<void> {
  console.log("[Harness] Waiting for extension to activate...");
  const ext = vscode.extensions.getExtension(EXTENSION_ID);
  if (!ext) {
    throw new Error(`[Harness] Extension not found: ${EXTENSION_ID}`);
  }
  console.log(`[Harness] ext.isActive before activate: ${ext.isActive}`);
  const activatePromise = ext.activate();
  const activateRace = await Promise.race([
    activatePromise.then(() => "resolved" as const),
    new Promise<"timeout">(r => setTimeout(() => r("timeout"), 30_000)),
  ]);
  console.log(`[Harness] activate result: ${activateRace}, isActive=${ext.isActive}`);
  if (activateRace === "timeout") {
    console.log("[Harness] activate hung past 30s — VSCode likely returned a stale isActive=true.");
  }

  // Diagnostic: workspace state at activation time
  const folders = vscode.workspace.workspaceFolders;
  console.log(
    "[Harness] workspaceFolders:",
    folders ? folders.map(f => f.uri.fsPath) : "undefined",
  );
  console.log("[Harness] workspace name:", vscode.workspace.name ?? "(none)");
  if (folders && folders.length > 0) {
    const root = folders[0].uri.fsPath;
    const candidates = [`${root}/extension/extension.yaml`, `${root}/src/extension/extension.yaml`];
    for (const c of candidates) {
      try {
        const stat = await vscode.workspace.fs.stat(vscode.Uri.file(c));
        console.log(`[Harness] found ${c} size=${stat.size}`);
        // Direct YAML parse sanity check (same lib the extension uses)
        const content = fs.readFileSync(c, "utf8");
        try {
          const parsed = yaml.parse(content);
          console.log(
            `[Harness] yaml.parse OK — type=${typeof parsed} ` +
              `topKeys=${parsed ? Object.keys(parsed).slice(0, 5).join(",") : "null"}`,
          );
        } catch (e) {
          console.log(`[Harness] yaml.parse THREW: ${(e as Error).message}`);
        }
      } catch {
        console.log(`[Harness] missing ${c}`);
      }
    }
  }

  await new Promise(resolve => setTimeout(resolve, CACHE_SETTLE_MS));

  // Poll for command registration. Activation hangs silently if the workspace
  // is not a valid extension project (no extension/extension.yaml).
  const deadline = Date.now() + 15_000;
  let registered = false;
  while (Date.now() < deadline) {
    const cmds = await vscode.commands.getCommands(true);
    if (cmds.includes(COMMAND_ID)) {
      registered = true;
      break;
    }
    await new Promise(r => setTimeout(r, 500));
  }
  if (!registered) {
    throw new Error(
      `[Harness] Command ${COMMAND_ID} did not register within timeout. ` +
        `Check that <workspace>/extension/extension.yaml exists and is valid.`,
    );
  }

  const skipInteractive = process.env.SKIP_INTERACTIVE !== "false";
  console.log(`[Harness] Executing ${COMMAND_ID} (skipInteractive=${skipInteractive})...`);

  await vscode.commands.executeCommand(COMMAND_ID, { skipInteractive });
  console.log("[Harness] Command completed.");
}
