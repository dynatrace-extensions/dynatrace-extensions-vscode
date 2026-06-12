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

import { PanelDataType, ViewType } from "@common";
import { renderPanel } from "./webview-utils";

// Placeholder markdown — final copy to be delivered separately.
const MIGRATION_GUIDE_MD = `
# SaaS Migration Guide

This guide covers migrating from a legacy Dynatrace SaaS setup to the current
Platform Token authentication model.

## Why migrate?

Legacy SaaS URLs (e.g. \`abc12345.live.dynatrace.com\`) and legacy API tokens
(\`dt0c01\`, \`dt0s01\`) are no longer supported for new Platform capabilities.
Migrating enables full access to Dynatrace Platform features.

## Step 1 — Update your tenant URL

Your current URL uses the legacy domain. Update it to the Apps domain:

- Old: \`https://abc12345.live.dynatrace.com\`
- New: \`https://abc12345.apps.dynatrace.com\`

Open the environment settings (click **Edit** on the tenant in the Environments
tree view) and replace the URL.

## Step 2 — Create a Platform Token

1. In your Dynatrace environment, go to **Settings → Access tokens**.
2. Create a new token with the required scopes for the Extensions workflow.
3. Copy the token — it starts with \`dt0s20\`.

## Step 3 — Update the token in the extension

Open the environment settings (click **Edit**), replace the old token with the
new Platform Token, and save.

## Verification

After saving, the warning icon on your tenant should disappear and the tenant
should be accessible for all extension operations.
`.trim();

export const openMigrationGuidePanel = () => {
  renderPanel(ViewType.MigrationGuide, "SaaS Migration Guide", {
    dataType: PanelDataType.MigrationGuide,
    data: { markdown: MIGRATION_GUIDE_MD },
  });
};
