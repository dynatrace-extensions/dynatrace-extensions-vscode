---
title: 🎹 Code completions
permalink: /docs/dev/code-completions/
toc: true
toc_sticky: true
---

Code completions or suggestions happen at key points within the extension manifest. 
Either automatically or on-demand (using `Ctrl + Space`) these offer known values that
can be inserted at the location of your cursor.

<p class="notice--info">
    <strong>📝 Note:</strong>
    <br/>
    Suggestions from other extensions (such as YAML Schema) may take precedence
    over the Copilot's.
</p>

## Demo

![code completions]({{ site.baseurl }}/assets/gifs/code_completions.gif)

## Currently implemented triggers

<table style="margin-top: 20px">
  <tr>
    <th>Keyword trigger</th>
    <th>Effects</th>
  </tr>
  <tr>
    <td>
      On <code>fromType:</code> or <code>toType:</code> inside 
      <code>topology.relationships</code> list items
    </td>
    <td>Browse built-in and custom entity types</td>
  </tr>
  <tr>
    <td>
      On <code>sourceAttribute:</code> inside <code>mappingRules</code> list items of 
      topology relationships
    </td>
    <td>
      Browse entity attributes (entity must be present in the <code>fromType</code> attribute)
    </td>
  </tr>
  <tr>
    <td>
      On <code>destinationAttribute:</code> inside <code>mappingRules</code> list items of 
      topology relationships
    </td>
    <td>
      Browse entity attributes (entity must be present in <code>toType</code> attribute)
    </td>
  </tr>
  <tr>
    <td>On <code>entityType:</code> and <code>entityTypes:</code></td>
    <td>Browse relevant entity types</td>
  </tr>
  <tr>
    <td>On <code>key:</code> (of attributes inside screen properties)</td>
    <td>Attributes are suggested from topology and built-in values</td>
  </tr>
  <tr>
    <td>On <code>entitySelectorTemplate:</code></td>
    <td>
      Use of <code>Ctrl + Space</code> to trigger completions as you build your selector or
      choose one of the pre-built selectors (from relationships seen in your YAML)
    </td>
  </tr>
  <tr>
    <td>
      On <code>iconPattern:</code> (within <code>topology.rules</code>) or 
      <code>icon:</code> (within <code>staticContent.header</code>)
    </td>
    <td>
      Browse available <a href="https://barista.dynatrace.com/resources/icons">Barista</a>
      icon codes
    </td>
  </tr>
  <tr>
    <td>
      On <code>key:</code> (of cards in screens, either in <code>layout</code> or individual lists)</td>
    <td>Browse keys of cards defined, but not yet utilised</td>
  </tr>
  <tr>
    <td>On <code>value:</code>, for metrics and dimensions of a Prometheus extension</td>
    <td>
      Browse metrics & dimensions scraped using the
      <a href="/docs/dev/code-lens/#prometheus-code-lenses">Prometheus code lens</a>
    </td>
  </tr>
  <tr>
    <td>On <code>description:</code> (in the <code>metrics:</code> section of the manifest)</td>
    <td>
      For those metrics that have been scraped using the
      <a href="/docs/dev/code-lens/#prometheus-code-lenses">Prometheus code lens</a>, add the description
      from the scraped data
    </td>
  </tr>
</table>
