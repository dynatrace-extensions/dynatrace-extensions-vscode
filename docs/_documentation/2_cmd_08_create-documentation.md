---
title: 📑 Create documentation
permalink: /docs/cmd/create-documentation/
toc: true
toc_sticky: true
---

Reads through the `extension.yaml` file and creates a `README.md` file in the workspace root
folder, documenting (as best as possible) the extension package and its contents.

## Command Pre-conditions

- A registered Copilot Workspace must be open in the VSCode window

## Demo

![create_documentation]({{ site.baseurl }}/assets/gifs/create_documentation.gif)

## Detailed command flow

1. The command reads through the extension manifest, extracting all generic topology entities

2. Next, metrics are extracted from the manifest

3. Next, dashboards are extracted from the manifest
   
4. After that, alerts are processed into human-readable summaries

5. Metrics are mapped to feature sets and linked to the defined entities

6. The readme file is created, with missing information skipped as needed.