---
title: Environments
permalink: /docs/views/environments/
toc: true
toc_sticky: true
---

Once the Copilot is installed your editor will show the Dynatrace icon in its activity bar.
Use the Environments view to register Dynatrace tenants and easily switch between them.

![workspaces]({{ site.baseurl }}assets/images/environments_view.png)

## Use cases

### Manage environment access

Register all Dynatrace environments you work with when developing extensions. Use the `+`
icon of the view header to register a new environment. The token entered will be encrypted
and associated with this environment from now on.

Use the buttons next to each environment label to either make changes or unregister any
of the known environments.

### Keep track of extension deployments

Expand each environment to reveal all extensions currently deployed on it. Each extension
contains the latest available version in brackets. 

Expand further to see all monitoring configurations of the extension - the configured
version is displayed in brackets while a colored circle displays its last known status.

### Target your operations

Your currently connected environment is the target for all API based operations the Copilot
executes. Quickly change between environments by clicking the status bar entry (usually on
the bottom of the window).