---
title: 📦 Initialize Workspace
permalink: /docs/cmd/initialize-workspace/
toc: true
---

Initializes a new workspace for Dynatrace Extension 2.0 development. This includes loading up 
schemas, creating an extension folder and stub, and creating an empty dist folder. This will 
also configure the Support for YAML extension to validate the extension manifest with your
chosen schema version.

Once finished, the workspace appears in the new Dynatrace view.

## Command Pre-conditions

- A workspace (any folder) must be open in the VSCode window
- The Copilot must be connected to a Dynatrace environment

## Demo

![initialize]({{ site.baseurl }}/assets/gifs/cmd_init.gif)

## Detailed command flow

1. Internal local storage is provisioned for this workspace.

2. The [Load schemas](/docs/cmd/load-schemas/) command is invoked an
   the flow awaits its successful completion before continuing. The Support for YAML extension
   is configured to validate the `extension.yaml` file with the chosen schema version.
   
   <p class="notice--info">
     <strong>📝 Note:</strong>
     <br/>
     If this workspace was previously associated with the Copilot this step will be
     skipped and the last known schema version will be automatically selected.
   </p>

3. New folders and files are created (if needed):
   - `./extension` - this is where the extension manifest along with its assets will be placed
   - `./extension/extension.yaml` - this is the extension manifest. If none exists, a starter 
     template will be generated with the mandatory minimal information.
   - `./dist` - this is where any built extension packages are placed

4. Certificates required for extension development are being associated with the workspace. 
   
   The workflow takes two paths:

   a. Use your own certificates
      - [Settings](/docs/settings/credentials/) are checked to
        ensure paths have been provided for Developer Certificate and Key.
  
   b. Generate new ones
      - This triggers the
        [Generate certificates](/docs/cmd/generate-certificates/)
        command and awaits its successful completion before continuing.

5. The workflow finalizes with saving the workspace metadata in the global VSCode storage and 
   this registers the workspace. 
   
   From now on, you'll be able to quickly access it from the dedicated Dynatrace view.
