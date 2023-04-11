---
title: 🔃 Convert JMX Extension
permalink: /docs/cmd/convert-jmx-extension
toc: true
toc_sticky: true
---

A workflow to convert an existing JMX extension from the 1.0 framework to 2.0

## Command Pre-conditions

This command does not have any pre-conditions for running it.

## Demo

> *Coming soon*

## Detailed command flow

1. The workflow prompts on how the 1.0 extension should be loaded in:
   
   a. Local - browse your filesystem and select either a JSON or ZIP file containing the 1.0
   JMX extension.

   b. Remote - browse JMX 1.0 extensions available on your connected tenant

2. The Copilot processes the 1.0 extension JSON file and converts it (as best as possible) to
   an equivalent extension 2.0 manifest.

3. The workflow finishes with prompting for a location where the generated extension manifest
   can be saved.