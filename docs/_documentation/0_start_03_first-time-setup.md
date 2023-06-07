---
title: First time setup
permalink: /docs/start/first-time-setup/
toc: true
toc_sticky: true
---

Get started with Dynatrace Extensions for the first time.

## Before you begin

Make sure you have followed the previous articles for
[pre-requisites](/docs/start/pre-requisites) and
[installation](/docs/start/installation).

## Connect to your Dynatrace Tenant

Start by opening the new Dynatrace entry from your editor's activity bar, then go to the
`ENVIRONMENTS` view and click the button to add a new Dynatrace tenant.

Enter the following details when prompted by the editor:
- The URL to the Dynatrace tenant
- An access token that can be used for API calls within that tenant
- An optional label for this environment

At the end choose to connect to the environment.

The environment is now listed in the view.

## Initialize a Workspace

On the new Dynatrace activity bar item, head over to the `EXTENSIONS 2.0 WORKSPACES` view and
click the button to either open a new folder or initialize workspace.

This will trigger the
[Initialize Workspace Command](/docs/cmd/initialize-workspace) and
guide you through all the setup required for first time use.

## Demo

![setup_demo]({{ site.baseurl }}assets/gifs/get_started.gif)
