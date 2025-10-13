import vscode from "vscode";

/** Wraps vscode `showQuickPick` with string literal support. */
export function showQuickPick<
  T extends string | vscode.QuickPickItem,
  U extends vscode.QuickPickOptions,
>(
  items: readonly T[] | Thenable<readonly T[]>,
  options?: U,
  token?: vscode.CancellationToken,
): Thenable<(U["canPickMany"] extends true ? T[] : T) | undefined> {
  return vscode.window.showQuickPick(items as never, options, token) as never;
}
