---
title: Create Overview Dashboard
permalink: /docs/cmd-create-dashboard/
toc: true
---

Reads through the `extension.yaml` file and creates an overview (landing page) dashboard. This is placed in a folder called
`dashboards` inside the `extension` folder as `overview_dashboard.json`; the YAML is also modified to include this asset.
After generating it, you're prompted if you want to also upload it to your connected tenant. The dashboard contains links
to extension configuration as well as every entity defined within the YAML, as well as single value tiles displaying the 
count of each entity type, tables listing each entity and up to two graph charts for each entity type.