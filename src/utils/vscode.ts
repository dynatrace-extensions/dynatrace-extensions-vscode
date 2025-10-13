import { utilTypes } from "@common";
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

export const ConfirmOption = {
  Yes: "Yes",
  No: "No",
} as const;
// eslint-disable-next-line @typescript-eslint/no-redeclare
type ConfirmOption = utilTypes.ObjectValues<typeof ConfirmOption>;
const ConfirmOptions = Object.values(ConfirmOption);

export function showQuickPickConfirm(
  options: Omit<vscode.QuickPickOptions, "canPickMany">,
  token?: vscode.CancellationToken,
): Thenable<ConfirmOption | undefined> {
  return showQuickPick(ConfirmOptions, options, token);
}
