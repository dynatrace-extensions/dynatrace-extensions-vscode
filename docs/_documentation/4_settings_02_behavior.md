---
title: Behavior
permalink: /docs/settings/behavior/
toc: true
toc_sticky: true
---

As much as possible the add-on aims to allow users to customize their extension development
experience. These settings allow on-demand enabling of various features.

## Feature Usage

<table>
  <tr>
    <th>Setting</th>
    <th>Feature</th>
  </tr>
  <tr>
    <td><code>dynatrace_extensions.metricSelectorsCodeLens</code></td>
    <td><a href="/docs/dev/code-lens/#metric-selector-code-lenses">Metric selector code lens</a></td>
  </tr>
  <tr>
    <td><code>dynatrace_extensions.entitySelectorsCodeLens</code></td>
    <td><a href="/docs/dev/code-lens/#entity-selector-code-lenses">Entity selector code lens</a></td>
  </tr>
  <tr>
    <td><code>fastDevelopmentMode</code></td>
    <td><a href="/docs/dev/fast-development-mode">Fast development mode</a></td>
  </tr>
  <tr>
    <td><code>dynatrace_extensions.wmiCodeLens</code></td>
    <td><a href="/docs/dev/code-lens/#wmi-query-code-lenses">WMI code lens</a></td>
  </tr>
  <tr>
    <td><code>dynatrace_extensions.screenCodeLens</code></td>
    <td><a href="/docs/dev/code-lens/#unified-analysis-screens-code-lenses">Unified Analysis screen code lens</a></td>
  </tr>
</table>

## Diagnostics

Diagnostics specific settings have been segmented based on area of diagnosis.

<table style="margin-bottom: 40px;">
  <tr>
    <th>Setting</th>
    <th>Diagnostics area</th>
  </tr>
  <tr>
    <td><code>diagnostics.all</code></td>
    <td>All diagnostics</td>
  </tr>
  <tr>
    <td><code>diagnostics.extensionName</code></td>
    <td>The name of the extension</td>
  </tr>
  <tr>
    <td><code>diagnostics.metricKeys</code></td>
    <td>Keys used for metric definitions</td>
  </tr>
  <tr>
    <td><code>diagnostics.cardKeys</code></td>
    <td>Keys of cards referenced/defined in the screens section</td>
  </tr>
  <tr>
    <td><code>diagnostics.snmp</code></td>
    <td>SNMP data source, especially the use of OIDs</td>
  </tr>
</table>

For convenience, you can easily toggle these from the Workspaces section of the Dynatrace view.
Simply right-click on any Workspace name and all feature settings can be toggled from there:

![context_menu]({{ site.baseurl }}assets/images/workspace_context_menu.png)
