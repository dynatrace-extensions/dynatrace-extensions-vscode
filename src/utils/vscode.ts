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

const ConfirmOption = ["Yes", "No"] as const;
// eslint-disable-next-line @typescript-eslint/no-redeclare
type ConfirmOption = (typeof ConfirmOption)[number];

export function showQuickPickConfirm(
  options: Omit<vscode.QuickPickOptions, "canPickMany">,
  token?: vscode.CancellationToken,
): Thenable<ConfirmOption | undefined> {
  return showQuickPick(ConfirmOption, options, token);
}
