---
title: 🎹 Code completions
permalink: /docs/dev/code-completions/
toc: true
---

The extension will trigger suggestions for code completion where possible. If the trigger 
doesn't happen automatically, use Ctrl + Space to trigger it manually.

> **Note:** Suggestions from other extensions (such as YAML Schema) may take precedence
>  over the Copilot.

Currently implemented completions trigger:

- on fromType: and toType: attributes of any topology.relationships item
- on sourceAttribute: and destinationAttribute: attributes of any relationship based on
  entity mapping rules (provided you have already filled in fromType and toType respectively)
- on entityType: and entityTypes: anywhere in the yaml, relevant entity types are suggested
- on lists of attribute-type properties, on key: the keys of relevant entity attributes are
  suggested
- on entitySelectorTemplate: you can make use of Ctrl + Space to trigger completions as the 
  selector is being built
- on entitySelectorTemplate: you can auto-complete selectors for relationships that are seen
  in the YAML
- on iconPattern: (within topology.rules) or icon: (within staticContent.header) - you can 
  browse available Barista Icon codes
- on key: for card keys either inside layout.cards or individual card type lists - card keys
  that have not been used yet are suggested
- on value: for metrics and dimensions of a prometheus extension if data has been scraped
  already
- on description: in metrics section for those metrics that have been scraped from a 
  Prometheus endpoint

  ![code completions]({{ site.baseurl }}/assets/gifs/code_completions.gif)