---
title: 🔂 Activate Extension on Tenant
permalink: /docs/cmd-activate-extension/
toc: true
---

## Abstract

Activates a version of your workspace's extension on the currently connected Dynatrace
environment.

## Command Pre-conditions

- A registered Copilot Workspace must be open in the VSCode window
- The Copilot must be connected to a Dynatrace environment

## Demo

![activate_ext_command]({{ site.baseurl }}/assets/gifs/activate_extension.gif)

## Detailed command flow

1. The extension name is read from the manifest present in your workspace.

2. The Dynatrace environment is queried for the available versions of the extension
   and you are prompted to choose which one to activate.

3. The chosen version is activated on the Dynatrace environment.
