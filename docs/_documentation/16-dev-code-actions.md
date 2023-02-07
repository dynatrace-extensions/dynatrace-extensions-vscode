---
title: 💡 Code actions
permalink: /docs/dev/code-actions/
toc: true
---

The extension will highlight actions to add snippets of code where possible.
On lines with specific keywords, the lightbulb (💡) icon will show up to list things that can be
automatically added to the code.

Currently implemented action triggers:

- inside `propertiesCard` when clicking on `properties` - you can automatically add properties
  for the entity's attributes and relations
- inside `entitiesListCards` when clicking on `columns` - you can automatically add columns for
  the listed entity's attributes and relations
- inside `chartsCards` and `entitiesListCards` when clicking on `charts` inside a card - you can
  automatically add charts for metrics that aren't already in the card
- inside `graphChartConfig` when clicking on `metrics` - you can add additional metrics to your 
  chart, that aren't already used within the surrounding card
- inside `screens` when clicking on `chartsCards` - you can automatically add chart cards for 
  entire feature sets of metrics
- inside `screens` when clicking on `entitiesListCards` - you can automatically add cards for 
  listing this entity as well as the related ones
- when clicking on `metrics` or `dimensons` within the `prometheus` data source - automatically
  add details from scraped Prometheus data
- on `screens` - you can automatically generate entire screens for your entities
- inside `entitiesListCards` when clicking on `filtering` - insert entire filtering blocks with a
  default filter by name
- inside `entitiesListCards` and inside `filtering`, when clicking on `filters` - insert individual
  filter for the entity's attributes
- inside `screens` when clicking on `actions` - insert global actions to configure the extension
- inside `actions` when clicking on `actions` - insert an action expression to configure the extension

![auto_charts]({{ site.baseurl }}/assets/gifs/pro_chart_building.gif)