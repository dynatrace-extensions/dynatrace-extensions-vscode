---
title: 💡 Code actions
permalink: /docs/dev/code-actions/
toc: true
toc_sticky: true
---

Code actions happen on key lines of your extension manifest.
Your editor will automatically show a lightbulb (💡) icon whenever actions exist relevant to the
current line of your manifest. 

Actions may include:
- Generating & inserting content into the manifest
- Fixing issues highlighted by the Copilot

## Demo

![auto_charts]({{ site.baseurl }}assets/gifs/pro_chart_building.gif)

## Currently implemented triggers

<table>
  <tr>
    <th>Action trigger</th>
    <th>Effects</th>
  </tr>
  <tr>
    <td>Inside <code>propertiesCard</code> when clicking on <code>properties</code></td>
    <td>Automatically add properties for the entity's attributes and relations</td>
  </tr>
  <tr>
    <td>Inside <code>entitiesListCards</code> when clicking on <code>columns</code></td>
    <td>Automatically add columns for the listed entity's attributes and relations</td>
  </tr>
  <tr>
    <td>
      Inside <code>chartsCards</code> and <code>entitiesListCards</code> when clicking on
      <code>charts</code> inside a card
    </td>
    <td>Automatically add charts for metrics that aren't already in the card</td>
  </tr>
  <tr>
    <td>Inside <code>graphChartConfig</code> when clicking on <code>metrics</code></td>
    <td>
      Add additional metrics to your chart, that aren't already used within the surrounding card
    </td>
  </tr>
  <tr>
    <td>Inside <code>screens</code> when clicking on <code>chartsCards</code></td>
    <td>Automatically add chart cards for entire feature sets of metrics</td>
  </tr>
  <tr>
    <td>Inside <code>screens</code> when clicking on <code>entitiesListCards</code></td>
    <td>Automatically add cards for listing this entity as well as the related ones</td>
  </tr>
  <tr>
    <td>When clicking on <code>metrics</code> within the <code>prometheus</code> data source</td>
    <td>
      Automatically add details from a 
      <a href="/dynatrace-extensions-copilot/docs/dev/code-lens/#prometheus-code-lenses">
        scraped Prometheus endpoint
      </a>
    </td>
  </tr>
  <tr>
    <td>On <code>screens</code></td>
    <td>Automatically generate entire unified analysis screens for your entities</td>
  </tr>
  <tr>
    <td>Inside <code>entitiesListCards</code> when clicking on <code>filtering</code></td>
    <td>Insert entire filtering blocks with a default filter by name</td>
  </tr>
  <tr>
    <td>Inside <code>entitiesListCards</code> and inside <code>filtering</code>, when clicking on <code>filters</code></td>
    <td>Insert individual filter for the entity's attributes</td>
  </tr>
  <tr>
    <td>Inside <code>screens</code> when clicking on <code>actions</code></td>
    <td>Insert global actions to configure the extension</td>
  </tr>
  <tr>
    <td>Inside <code>actions</code> when clicking on <code>actions</code></td>
    <td>Insert an action expression to configure the extension</td>
  </tr>
</table>
