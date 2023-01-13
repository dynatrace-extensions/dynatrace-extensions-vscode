---
title: Credentials within the Copilot
permalink: /docs/settings-credentials/
toc: true
---

Settings for using your own credentials:

- `dynatrace.developerKeyLocation` - File path. Bring your own developer key instead of generating a new one.
- `dynatrace.developerCertificateLocation` - File path. Bring your own developer certificate instead of generating a new one.
- `dynatrace.rootOrCaCertificateLocation` - File path. Bring your own root (CA) certificate instead of generating a new one.

*Note:* if you generated a single "fused" certkey file via `dt-cli` and want to use it just add the path to it in both `dynatrace.developerKeyLocation` and `dynatrace.developerCertificateLocation`

Settings for generating new certificates:

- `dynatrace.certificateCommonName` - When generating new certificates, specifies the common name (CN) attribute of the certificate. Defaults to "Extension Developer".
- `dynatrace.certificateOrganization` - When generating new certificates, specifies the organization (O) attribute of the certificate.
- `dynatrace.certificateOrganizationUnit` - When generating new certificates, specifies the organization unit (OU) attribute of the certificate.
- `dynatrace.certificateStateOrProvince` - When generating new certificates, specifies the state or province (ST) attribute of the certificate.
- `dynatrace.certificateCountryCode` - When generating new certificates, specifies the country code (C) attribute of the certificate.