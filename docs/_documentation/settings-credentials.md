---
title: Credentials within the Copilot
permalink: /docs/settings/credentials/
toc: true
---

The Copilot is capable of either generating for you all the credentials required for extension
development or allowing you to bring your own credential files.

## When using your own credentials

Provide your files to the Copilot by using these settings:
- `dynatrace.developerCertkeyLocation` - this is the path to your fused developer credential file
- `dynatrace.rootOrCaCertificateLocation` - this is the path to your root (CA) certificate.

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
    If you still want to use older credentials, you must paste the contents together and
    manually create the fused file. Otherwise, just let the Copilot generate one for you.
</p>

## When generating credentials

Through the [Generate certificates](/docs/cmd/generate-certificates)
command we can generate all the files you need and automatically update your `settings.json`.

Customize the credentials metadata by using these settings:
- `dynatrace.certificateCommonName` - the common name (CN) attribute of the certificate. 
  Defaults to "Extension Developer".
- `dynatrace.certificateOrganization` - the organization (O) attribute of the certificate.
- `dynatrace.certificateOrganizationUnit` - the organization unit (OU) attribute of the 
  certificate.
- `dynatrace.certificateStateOrProvince` - the state or province (ST) attribute of the 
  certificate.
- `dynatrace.certificateCountryCode` - the country code (C) attribute of the certificate.

<p class="notice--info">
    <strong>📝 Note:</strong>
    <br/>
    Your generated credentials are stored in the workspace storage provided by Visual Studio
    Code and your <code>settings.json</code> file is automatically updated to reflect this.
</p>