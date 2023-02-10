---
title: Credentials within the Copilot
permalink: /docs/settings/credentials/
toc: true
---

The Copilot is capable of either generating for you all the credentials required for extension
development or allowing you to bring your own credential files.

## When using your own credentials

Provide your files the the Copilot by using these settings:
- `dynatrace.developerKeyLocation` - this is a path to your developer private key file.
- `dynatrace.developerCertificateLocation` - this is a path to your developer certificate file.
- `dynatrace.rootOrCaCertificateLocation` - this is a path to your root (CA) certificate.

Example usage (in `./vscode/settings.json`):

```json
{
    "dynatrace.developerKeyLocation": "C:\\Temp\\certificates\\dev.key",
    "dynatrace.developerCertificateLocation": "C:\\Temp\\certificates\\dev.pem",
    "dynatrace.rootOrCaCertificateLocation": "C:\\Temp\\certificates\\ca.pem"
}
```

<p class="notice--info">
    <strong>📝 Note:</strong>
    <br/>
    If you generated a single "fused" certkey file via <code>dt-cli</code> and want to use it
    just add the path to it in both <code>dynatrace.developerKeyLocation</code> and
    <code>dynatrace.developerCertificateLocation</code>
</p>

<p class="notice--warning">
    <strong>⚠️ Warning:</strong>
    <br/>
    We will soon deprecate the split-credential file format and move towards supporting only
    a fused credential file. You can keep track of this task via
    <a href="https://github.com/dynatrace-extensions/dynatrace-extensions-copilot/issues/52">
        issue #52
    </a>
</p>

## When generating credentials

Through the [Generate certificates](/dynatrace-extensions-copilot/docs/cmd/generate-certificates)
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