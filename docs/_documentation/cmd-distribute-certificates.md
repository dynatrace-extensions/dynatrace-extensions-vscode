---
title: 🔗 Distribute Certificate
permalink: /docs/cmd/distribute-certificate/
toc: true
---

Uploads the workspace's root (CA) certificate to the Dynatrace Credentials Vault. Optionally,
you can also upload this certificate to any locally installed OneAgents or ActiveGates (if 
detected).

## Command Pre-conditions

- A workspace (any folder) must be open in the VSCode window
- The Copilot must be connected to a Dynatrace environment
- A CA Certificate must be associated with the workspace (via `settings.json`) and the
  path must be a readable file

## Demo

![distribute_certificate]({{ site.baseurl }}/assets/gifs/distribute_certificate.gif)

## Detailed command flow

1. The Copilot checks whether a Dynatrace Credentials Vault entry ID alreayd is associated
   with this workspace and prompts whether the entry should be overwritten or not.

   If overwrite is selected, the entry is updated with the new file. Otherwise, the workflow
   continues as for a new credential.

2. You are prompted to provide a name for this credential (mandatory) as well as a description
   (optional). The file is then uploaded with these details.

3. Local OneAgent & ActiveGate paths are checked for existence and the flow prompts whether
   the certificate should also be uploaded to these locations.

   <p class="notice--warning">
     <strong>⚠️ Warning:</strong>
     <br/>
     This step requires VS Code to run with administrator level permissions
     (e.g.: for Windows, Run As Administrator).
   </p>
