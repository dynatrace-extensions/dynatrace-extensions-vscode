---
title: Credentials within the Copilot
permalink: /docs/settings/credentials/
toc: true
toc_sticky: true
---

The Copilot is capable of either generating for you all the credentials required for extension
development or allowing you to bring your own credential files.

## When using your own credentials

Provide your files to the Copilot by using these settings:

<table style="margin-bottom: 40px;">
  <tr>
    <th>Setting</th>
    <th>Description</th>
  </tr>
  <tr>
    <td><code>dynatrace.developerCertkeyLocation</code></td>
    <td>This is the path to your fused developer credential file.</td>
  </tr>
  <tr>
    <td><code>dynatrace.rootOrCaCertificateLocation</code></td>
    <td>This is the path to your root (CA) certificate.</td>
  </tr>
</table>

Example usage (in `./vscode/settings.json`):

```json
{
    "dynatrace.developerCertkeyLocation": "C:\\Temp\\certificates\\dev.pem",
    "dynatrace.rootOrCaCertificateLocation": "C:\\Temp\\certificates\\ca.pem"
}
```

<p class="notice--warning">
    <strong>⚠️ Deprecation warning:</strong>
    <br/>
    Since version <code>1.0.0</code> of the Copilot, split credential files are no longer
    supported and the following settings have been deprecated:
    <br/>
    <code>dynatrace.developerKeyLocation</code>
    <br/>
    <code>dynatrace.developerCertificateLocation</code>
    <br/>
    <br/>
    If you still want to use older credentials, you must paste the contents together and
    manually create the fused file. Otherwise, just let the Copilot generate one for you.
</p>

## When generating credentials

Through the [Generate certificates](/docs/cmd/generate-certificates)
command we can generate all the files you need and automatically update your `settings.json`.

Customize the credentials metadata by using these settings:
<table>
  <tr>
    <th>Setting</th>
    <th>Description</th>
  </tr>
  <tr>
    <td><code>dynatrace.certificateCommonName</code></td>
    <td>The common name (CN) attribute of the certificate. Defaults to "Extension Developer".</td>
  </tr>
  <tr>
    <td><code>dynatrace.certificateOrganization</code></td>
    <td>The organization (O) attribute of the certificate.</td>
  </tr>
  <tr>
    <td><code>dynatrace.certificateOrganizationUnit</code></td>
    <td>The organization unit (OU) attribute of the certificate.</td>
  </tr>
  <tr>
    <td><code>dynatrace.certificateStateOrProvince</code></td>
    <td>The state or province (ST) attribute of the certificate.</td>
  </tr>
  <tr>
    <td><code>dynatrace.certificateCountryCode</code></td>
    <td>The country code (C) attribute of the certificate.</td>
  </tr>
</table>

<p class="notice--info">
    <strong>📝 Note:</strong>
    <br/>
    Your generated credentials are stored in the workspace storage provided by Visual Studio
    Code and your <code>settings.json</code> file is automatically updated to reflect this.
</p>