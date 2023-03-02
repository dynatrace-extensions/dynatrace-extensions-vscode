---
title: 🔎 Code lens
permalink: /docs/dev/code-lens/
toc: true
toc_sticky: true
---

Code lens are actionable, contextual information, interspersed with your code.
For Dynatrace Extensions, these can help trigger code-related actions to your connected
tenant or other external endpoints.

## Metric Selector Code Lenses

- See the last validation status of any metric selector
- Validate any metric selector against a connected Dynatrace tenant
- Run any metric selector and visualize the query results in a separate editor panel

![metric_codelens]({{ site.baseurl }}/dynatrace-extensions-copilot/assets/gifs/metric_code_lens.gif)

## Entity Selector Code Lenses

- See the last validation status of any entity selector
- Validate any entity selector against a connected Dynatrace tenant
- Run any entity selector and visualize the query results in the Dynatrace output panel

![entity_selector_lens]({{ site.baseurl }}/dynatrace-extensions-copilot/assets/gifs/entity_selector_lens.gif)

## Prometheus Code Lenses

- Connect to a Prometheus endpoint and scrape metrics data. Scraped details can then be used:
  - To automatically insert metric definitions in the `prometheus` section of the YAML
  - To automatically insert dimensions in the `prometheus` section of the YAML
  - To automatically insert metric metadata in the `metrics` section of the YAML
- Get a timestamp of when details were last scraped.

![prometheus_codelens]({{ site.baseurl }}/dynatrace-extensions-copilot/assets/gifs/prometheus_scraper.gif)

## WMI Query Code Lenses

- Run WMI queries against the local Windows machine where a WMI extension is being developed
  - To validate that the WMI query is valid
  - To browse the results of the query and check the column values
  - To get the number of unique dimensions that a query would create for this machine

![wmi_codelens]({{ site.baseurl }}/dynatrace-extensions-copilot/assets/gifs/wmi_codelens.gif)

## Unified Analysis Screens Code Lenses

- Open the List or Details Unified Analysis screen for any entity type

![screen_code_lens]({{ site.baseurl }}/dynatrace-extensions-copilot/assets/gifs/screen_code_lens.gif)

<p class="notice--warning">
  <strong>⚠️ Warning:</strong>
  <br/>
  You will probably hit a <code>404 Not Found</code> if you did not yet deploy your extension
  as the entity definitions would not exist in your environment.
</p>