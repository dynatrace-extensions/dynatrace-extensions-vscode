---
title: 🔥 Fast development mode
permalink: /docs/dev/fast-development-mode
toc: true
toc_sticky: true
---

Fast development mode is a workflow designed to allow advanced developers to gain immediate 
feedback on the current state of their extension and minimze the steps and time it takes to
see updates in their connected Dynatrace environment.

## Demo

![fast_dev_mode]({{ site.baseurl }}assets/gifs/fast_dev_mode.gif)

## How does it work?

When enabled, every time changes to the extension manifest are saved, the extension version
is automatically incremented and the extension is packaged, signed, and uploaded to the 
connected environment. The workflow is "hands-free" so if the maximum number of extension
versions has been reached, one will be removed automatically so the upload can succeed.

Pre-upload validation is skipped in favor of speed and any issues are communicated 
immediately via an output channel. An accompanying status bar confirms the mode is active
and displays the status of the last attempted build.

When developing your static assets, such as the Unified Analysis screen, this mode is the
quickest way to cycle through a variety of changes before the final format.
