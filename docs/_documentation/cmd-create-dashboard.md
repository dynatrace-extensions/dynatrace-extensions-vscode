---
title: 📈 Create overview dashboard
permalink: /docs/cmd/create-dashboard/
toc: true
---

Reads through the `extension.yaml` file and creates an overview dashboard which serves as a
landing page for the extension.

## Command Pre-conditions

- A registered Copilot Workspace must be open in the VSCode window
- The extension manifest should at least contain a topology definition

## Demo

![create_dashboard]({{ site.baseurl }}/assets/gifs/create_dashboard.gif)

## Detailed command flow

1. The command parses the extension manifest and extracts the generic entity types defined
   within and any metrics associated with them. The first one or two metrics are taken for
   each entity type.

2. The command creates a dashboard from a given template, creating single value tiles for
   metrics set up to show the count of distinct monitored entities.

3. A list of markdown links is created, so that each entity has an quick entry point to
   unified analysis screens.

4. Tables of each entity type are created, alongside graph charts based on the top one or
   two metrics extracted at step one.

5. The dashboard is written to path `./extension/dashboards/overview_dashboard.json` and the
   extension manifest is edited to include the reference to this newly created dashboard.

6. The workflow finishes with the prompt to upload this dashboard to Dynatrace.
   <p class="notice--info">
     <strong>📝 Note:</strong>
     <br/>
     Your dashboard will automatically be uploaded as part of the extension deployment. 
     This final step is offered in case you want an early preview of the asset before 
     your extension deployment.
   </p>