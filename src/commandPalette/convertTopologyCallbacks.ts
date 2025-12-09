/**
  Copyright 2025 Dynatrace LLC

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

import * as vscode from "vscode";
import { InputCallback } from "./convertTopology";

/**
 * VSCode-specific implementation of InputCallback that shows an input box to the user
 */
export const vscodeInputCallback: InputCallback = async (
  prompt: string,
  suggestedValue: string,
): Promise<string | null> => {
  const result = await vscode.window.showInputBox({
    prompt,
    placeHolder: suggestedValue,
    value: suggestedValue,
    validateInput: value => {
      if (!value || value.trim() === "") {
        return "Value cannot be empty";
      }
      return null;
    },
  });

  return result ?? null;
};

/**
 * Non-interactive implementation of InputCallback that just returns the suggested value
 * Useful for automated/non-interactive scenarios
 */
export const autoInputCallback: InputCallback = async (
  _prompt: string,
  suggestedValue: string,
): Promise<string | null> => {
  return suggestedValue;
};
