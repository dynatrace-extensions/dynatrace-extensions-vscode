---
layout: splash
permalink: /
header:
  overlay_color: "#000"
  overlay_filter: "0.5"
  overlay_image: /assets/images/copilot-banner-resize-2.png
  actions:
    - label: "<i class='fas fa-download'></i> Download now"
      url: https://github.com/dynatrace-extensions/dynatrace-extensions-vscode/releases/latest
    - label: "<i class='fas fa-cart-arrow-down'></i> Marketplace"
      url: https://marketplace.visualstudio.com/items?itemName=DynatracePlatformExtensions.dt-ext-copilot
excerpt: >
  Take Extension development to the next level.
  <br />
  <br />
  <br />
intro:
  - excerpt: >
      Welcome to the home of the <strong>Dynatrace Extensions Copilot</strong>.
      <br />
      <br />
      Get started by downloading the latest release or browsing the project documentation.
      <br />
      <br />
      Otherwise, check out the resources we put together below. These are the essential
      tools to fuel your journey with Dynatrace Extensions 2.0.
feature_row:
  - image_path: /assets/images/tutorial_icon_banner.png
    alt: first_extension
    title: Write your first extension
    excerpt: >
      New to Extensions 2.0? You can get up to speed by following our WMI Extension tutorial.
      You'll build your first extension and learn about the WMI datasource.
    btn_label: Open tutorial
    btn_class: btn--info
    url: https://www.dynatrace.com/support/help/extend-dynatrace/extensions20/data-sources/wmi-extensions/wmi-tutorial
  - image_path: /assets/images/hub_icon_banner.png
    alt: hub_extensions
    title: Browse extensions
    excerpt: >
      Need inspiration or want to see ready made solutions? Check out the vast library of
      official Dynatrace extensions from the online platform Hub.
    btn_label: Go to Hub
    btn_class: btn--info
    url: https://www.dynatrace.com/hub/?filter=all&offered=dynatrace
  - image_path: /assets/images/docs_icon_banner.png
    alt: dynatrace_docs
    title: Extensions Documentation
    excerpt: >
      Check out the online documentation for Extensions 2.0. It offers detailed information
      about the framework and the available datasources.
    btn_label: Go to docs
    btn_class: btn--info
    url: https://help.dynatrace.com
---

{% include feature_row id="intro" type="center" %}
{% include feature_row %}
