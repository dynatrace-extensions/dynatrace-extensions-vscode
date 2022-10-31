import * as vscode from "vscode";
import { ProposedExtensionAPI } from "../interfaces/python";

export async function getPythonPath(): Promise<string> {
  let pythonPath = "python";

  const extension =
    vscode.extensions.getExtension<ProposedExtensionAPI>("ms-python.python");
  if (!extension?.isActive) {
    await extension?.activate();
  }
  const activeEnvironment =
    extension?.exports.environments.getActiveEnvironmentPath();
  pythonPath = activeEnvironment?.path || pythonPath;

  return pythonPath;
}
