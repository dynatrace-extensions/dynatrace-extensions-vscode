/**
  Copyright 2022 Dynatrace LLC

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

/**
 * Triggers a command in VS Code from within the WebView panel.
 * This is done by encoding the args as query string parameters and clicking an
 * invisible link that can navigate to a command's function.
 * @param command command ID to trigger
 * @param args any args to send to the command
 */
export const triggerCommand = (command: string, ...args: unknown[]) => {
  // If the command has args, they need URL encoding
  const commandHref =
    args.length > 0
      ? `command:${command}?${encodeURIComponent(JSON.stringify(args))}`
      : `command:${command}`;

  // Create a link with the full command as href
  const commandLink = document.createElement("a");
  commandLink.href = commandHref;
  commandLink.style.display = "none";

  // Add it to DOM, click it, and remove it
  document.body.appendChild(commandLink);
  commandLink.click();
  document.body.removeChild(commandLink);
};
