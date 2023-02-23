---
title: Behavior
permalink: /docs/settings/features/
toc: true
---

As much as possible the Copilot aims to allow users to customize their extension development
experience. These settings allow on-demand enabling of various features.

## Feature Usage

- `dynatrace.metricSelectorsCodeLens` - 
  [Metric selector code lens](/docs/dev/code-lens/#metric-selector-code-lenses)
- `dynatrace.entitySelectorsCodeLens` - 
  [Entity selector code lens](/docs/dev/code-lens/#entity-selector-code-lenses)
- `dynatrace.fastDevelopmentMode` - [Fast development mode](/docs/dev/fast-development-mode)
- `dynatrace.wmiCodeLens` - [WMI code lens](/docs/dev/code-lens/#wmi-query-code-lenses)
- `dynatrace.screenCodeLens` - [Unified Analysis screen code lens](/docs/dev/code-lens/#unified-analysis-screens-code-lenses)

## Diagnostics

Diagnostics specific settings have been segmented based on area of diagnosis:
- `dynatrace.diagnostics.all` - all diagnostics
- `dynatrace.diagnostics.extensionName` - diagnostics related to the extension name
- `dynatrace.diagnostics.metricKeys` - diagnostics related to metric keys
- `dynatrace.diagnostics.cardKeys` - diagnostics related to card keys
- `dynatrace.diagnostics.snmp` - diagnostics related to SNMP data source (especially OIDs)

For convenience, you can easily toggle these from the Workspaces section of the Dynatrace view.
Simply right-click on any Workspace name and all feature settings can be toggled from there:

![context_menu]({{ site.baseurl }}/assets/images/workspace_context_menu.png)