---
title: 🔔 Create alert
permalink: /docs/cmd/create-alert/
toc: true
toc_sticky: true
---

A workflow to help you create alerts based on your extension's metrics

## Command Pre-conditions

- A registered Copilot Workspace must be open in the VSCode window
- The extension manifest should contain metrics metadata

## Demo

![create_alert]({{ site.baseurl }}/dynatrace-extensions-copilot/assets/gifs/create_alert_cmd.gif)

## Detailed command flow

1. The command parses the extension manifest and presents a selection box with all metrics
   read from the metadata section of the manifest. Select one to continue.
2. The workflow then prompts for a title/name for this alert
3. You must then choose whether your threshold breach happens when the metric goes ABOVE or
   BELOW a given level.
4. Finally, provide the actual value that the threshold relates to
5. The command completes with writing your alert JSON file in the `alerts` folder (placed
   inside the `extension` folder if it doesn't exist) and updating your YAML to include the
   newly generated alert.
