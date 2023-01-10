---
title: Pre-requisites
permalink: /docs/pre-requisites/
toc: true
---

## Visual Studio Code

This is pretty obvious, the Extensions Copilot exists as an Extension for Visual Studio Code. If you haven't already, go ahead and install it from https://code.visualstudio.com/

## Dynatrace

Make sure you have access to a Dynatrace environment (tenant). The Copilot works with either SaaS or Managed. Note down the following details:
- The full URL to your Dynatrace environment
- The ID of the environment

You'll need these for the first time setup.

## Dynatrace API Token

The Copilot automates a lot of the operations around Extensions development by using the Dynatrace API. To get the most out of it, create an API Access Token with the following scopes:
- `WriteConfig`
- `ReadConfig`
- `credentialVault.read`
- `credentialVault.write`
- `extensions.read`
- `extensions.write`
- `extensionEnvironment.write`
- `extensionEnvironment.read`
- `extensionConfigurations.read`
- `extensionConfigurations.write`
- `metrics.read`
- `entities.read`
- `settings.read`
- `settings.write`

If you already have an Access Token with the `apiTokens.write` scope, you can generate the above-described token with the following command, once you replace the <TENANT-ID> and Api-Token value with your own:

```sh
curl -X POST "https://<TENANT-ID>.live.dynatrace.com/api/v2/apiTokens" -H "accept: application/json; charset=utf-8" -H "Content-Type: application/json; charset=utf-8" -d "{\"name\":\"Dynatrace Extensions Copilot\",\"scopes\":[\"entities.read\",\"extensionConfigurations.read\",\"extensionConfigurations.write\",\"extensionEnvironment.read\",\"extensionEnvironment.write\",\"extensions.read\",\"extensions.write\",\"metrics.read\",\"settings.read\",\"settings.write\",\"credentialVault.read\",\"credentialVault.write\",\"ReadConfig\",\"WriteConfig\"]}" -H "Authorization: Api-Token <CHANGE-ME>"
```