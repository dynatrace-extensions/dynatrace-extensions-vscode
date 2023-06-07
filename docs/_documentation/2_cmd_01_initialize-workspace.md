---
title: 📦 Initialize Workspace
permalink: /docs/cmd/initialize-workspace/
toc: true
toc_sticky: true
---

Initializes a new workspace for Dynatrace Extension 2.0 development. This includes loading up
schemas, creating extension artefacts, and other useful directories for your project. This will
also configure the Support for YAML extension to validate the extension manifest with your
chosen schema version.

Once finished, the workspace appears in the new Dynatrace view.

## Command Pre-conditions

- A workspace (any folder) must be open in the VSCode window
- A Dynatrace environment must be connected

## Demo

Note: The demo shows the "Extension 2.0" project type setup.

![initialize]({{ site.baseurl }}assets/gifs/cmd_init.gif)

## Detailed command flow

1. Internal local storage is provisioned for this workspace.

2. The [Load schemas](/docs/cmd/load-schemas/) command is invoked an
   the flow awaits its successful completion before continuing. The Support for YAML extension
   is configured to validate the `extension.yaml` file with the chosen schema version.

   <p class="notice--info">
     <strong>📝 Note:</strong>
     <br/>
     If this workspace was previously associated with the add-on this step will be
     skipped and the last known schema version will be automatically selected.
   </p>

3. Certificates required for extension development are being associated with the workspace.

   The workflow takes two paths:

   a. Use your own certificates
      - [Settings](/docs/settings/credentials/) are checked to
        ensure paths have been provided for Developer Certificate and Key.

   b. Generate new ones
      - This triggers the
        [Generate certificates](/docs/cmd/generate-certificates/)
        command and awaits its successful completion before continuing.

4. The workspace is now registered with the add-on.

5. The final step creates relevant files for you to start your project the right way.
   So that we generate relevant files, the workflow splits into:

   ![workspace_choices]({{ site.baseurl }}assets/images/init_workspace_choices.png)

From now on, you'll be able to quickly access your workspace from the dedicated
Dynatrace view.

## Extension project types and their artefacts

The Copilot is suited to start you off with some base folders and files based on
the types of projects we commonly see extension developers deal with. These are:

**Extension 2.0**

   This is the default choice. Whether you already have all the contents, and simply
   want to register the workspace with the add-on, or maybe you're starting a new
   extension from scratch. This will generate the extension folder and a manifest
   with the minimum mandatory details required for any extension.

**Python Extension 2.0**

   This option creates a new extension that uses the Python datasource. The `dt-sdk`
   module must be available on your machine or connectivity to the Dynatrace VPN to
   acquire it.

**JMX 1.0 Conversion**

   As the JMX datasource is now available with Extensions 2.0, it's time to convert
   your JMX extensions from the 1.0 framework. This type of project will guide you
   to provide a 1.0 JMX Extension (either from local file or your tenant) and it will
   convert it to the new framework and create your manifest.

**Existing 2.0 Extension**

   Need an edit to an already deployed extension? Are you curious what the content of
   a built-in extension looks like? This option downloads an extension 2.0 package
   from your tenant, and unpacks it into your workspace.
