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

const MIGRATION_GUIDE_MD = `
# SaaS Tenant Migration Guide

This guide covers how to update a registered tenant connection from the Dynatrace Classic SaaS
format to the latest Dynatrace platform model.

An online version of this guide is available [here](https://docs.dynatrace.com/docs/shortlink/vscode-tenant-config-update).

## Why migrate?

Classic SaaS URL domains (e.g. \`abc12345.live.dynatrace.com\`) and API Access Tokens (\`dt0c01.*\`, \`dt0s01.*\`)
are no longer supported for the new platform capabilities. Migrating enables full access to Dynatrace Platform
features so you can make the most of this VSCode extension.

## Step 1 — Create a Platform Token

1. Follow the [official documentation](https://docs.dynatrace.com/docs/shortlink/platform-tokens) to create a
Platform Token and ensure it has the following scopes:
    - \`extensions:definitions:read\`
    - \`extensions:definitions:write\`
    - \`extensions:configurations:read\`
    - \`extensions:configurations:write\`
    - \`extensions:discovery.jmx:read\`
    - \`extensions:discovery.pmi:read\`
    - \`storage:buckets:read\`
    - \`storage:metrics:read\`
    - \`storage:entities:read\`
    - \`storage:smartscape:read\`
    - \`settings:objects:read\`
    - \`credential-vault:entries:read\`
    - \`credential-vault:entries:write\`
    - \`credential-vault:entries:admin\`
2. Copy the token — it will start with \`dt0s16\`

## Step 2 — Update the tenant details in the extension

Open the environment settings (click **Edit** on the tenant in the Environments tree view) and replace the
non-compliant details.

1. If your current URL uses the legacy domain, you must update it to the Platform domain, for example:
    - Old: \`https://abc12345.live.dynatrace.com\`
    - New: \`https://abc12345.apps.dynatrace.com\`
2. Replace the old token with the new Platform Token created in Step 1
3. Continue through the remaining steps to save the updated details

## Verification

After saving, the icon of this environment should no longer be red.

You can now also expand the node to view a list of extensions available in the environment.
`.trim();

export const openMigrationGuidePanel = () => {
  renderPanel(ViewType.MigrationGuide, "SaaS Migration Guide", {
    dataType: PanelDataType.MigrationGuide,
    data: { markdown: MIGRATION_GUIDE_MD },
  });
};
