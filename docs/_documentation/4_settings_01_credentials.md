---
title: Credentials within the add-on
permalink: /docs/settings/credentials/
toc: true
toc_sticky: true
---

The Copilot is capable of either generating for you all the credentials required for extension
development or allowing you to bring your own credential files.

## When using your own credentials

Provide your files to the add-on by using these settings:

<table style="margin-bottom: 40px;">
  <tr>
    <th>Setting</th>
    <th>Description</th>
  </tr>
  <tr>
    <td><code>developerCertkeyLocation</code></td>
    <td>This is the path to your fused developer credential file.</td>
  </tr>
  <tr>
    <td><code>rootOrCaCertificateLocation</code></td>
    <td>This is the path to your root (CA) certificate.</td>
  </tr>
</table>

Example usage (in `./vscode/settings.json`):

```json
{
    "developerCertkeyLocation": "C:\\Temp\\certificates\\dev.pem",
    "rootOrCaCertificateLocation": "C:\\Temp\\certificates\\ca.pem"
}
```

<p class="notice--warning">
    <strong>⚠️ Deprecation warning:</strong>
    <br/>
    Since version <code>1.0.0</code> of the add-on, split credential files are no longer
    supported and the following settings have been deprecated:
    <br/>
    <code>dynatrace.developerKeyLocation</code>
    <br/>
    <code>dynatrace.developerCertificateLocation</code>
    <br/>
    <br/>
    If you still want to use older credentials, you must paste the contents together and
    manually create the fused file. Otherwise, just let the add-on generate one for you.
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
    <td><code>certificateCommonName</code></td>
    <td>The common name (CN) attribute of the certificate. Defaults to "Extension Developer".</td>
  </tr>
  <tr>
    <td><code>certificateOrganization</code></td>
    <td>The organization (O) attribute of the certificate.</td>
  </tr>
  <tr>
    <td><code>certificateOrganizationUnit</code></td>
    <td>The organization unit (OU) attribute of the certificate.</td>
  </tr>
  <tr>
    <td><code>certificateStateOrProvince</code></td>
    <td>The state or province (ST) attribute of the certificate.</td>
  </tr>
  <tr>
    <td><code>certificateCountryCode</code></td>
    <td>The country code (C) attribute of the certificate.</td>
  </tr>
</table>

<p class="notice--info">
    <strong>📝 Note:</strong>
    <br/>
    Your generated credentials are stored in the workspace storage provided by Visual Studio
    Code and your <code>settings.json</code> file is automatically updated to reflect this.
</p>
