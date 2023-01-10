---
title: Distribute Certificate
permalink: /docs/cmd-distribute-certificate/
toc: true
---

Uploads the workspace's root (CA) certificate to the Dynatrace Credentials Vault. The user is prompted whether to also upload
this certificate to any locally installed OneAgents or ActiveGates (if detected). Due to the default certificate locations this
follow-up requires administrator level permissions (example for Windows, Run As Administrator).