---
title: 🎁 Build Extension
permalink: /docs/cmd/build-extension/
toc: true
toc_sticky: true
---

Builds your extension and its artefacts into a signed .zip archive which is placed inside the
`dist` folder of the workspace.

## Command Pre-conditions

- A registered Copilot Workspace must be open in the VSCode window
- Developer credentials must be associated with the workspace
- No error/problems must be detected with the extension manifest

## Demo

![build_command]({{ site.baseurl }}assets/gifs/cmd_build.gif)

## Detailed command flow

1. The extension version is picked up from the manifest. If the add-on is connected to a
   Dynatrace environment, the version is checked for any conflicts. If it would conflict
   with an already existing version it is automatically incremented.

2. The extension manifest and assets are packaged into a `.zip` archive which is signed
   using your developer credentials. The resulting signature along with the archive are
   added to a final `.zip` archive which is the extension package.

3. If the add-on is connected to an environment, the package is sent to Dynatrace for
   validation. Any validation errors are communicated in an Output Channel (within your)
   editor window and the workflow terminates. Valid packages are moved to the `dist`
   folder of your workspace.

4. The workflow finishes by linking to the [Upload extension](/docs/cmd/upload-extension/)
   command
