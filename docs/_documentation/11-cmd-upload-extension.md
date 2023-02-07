---
title: 📤 Upload Extension to Tenant
permalink: /docs/cmd/upload-extension/
toc: true
---

## Abstract

Uploads the most recent package from your workspace's `dist` folder to the currently connected
Dynatrace tenant.

## Command Pre-conditions

- A registered Copilot Workspace must be open in the VSCode window
- The Copilot must be connected to a Dynatrace environment
- A zip archive must be present in the workspace's `dist` folder

## Demo

![upload_ext_command]({{ site.baseurl }}/assets/gifs/upload_extension.gif)

## Detailed command flow

1. The connected Dynatrace environment is checked for the maximum number of versions allowed
   for an extension and if the upload is not possible you are prompted to remove the oldest
   one. Choosing not to remove it would cancel the workflow.

2. The Copilot attemtps to remove the oldest version, however, if this fails (e.g. monitoring
   configurations may be linked to it) then you are prompted to choose a different version 
   to remove.

3. Once the upload is possible, the extension is uploaded.
   
4. The workflow finishes by linking to the
   [Activate extension](/dynatrace-extensions-copilot/docs/cmd-activate-extension/) command.
