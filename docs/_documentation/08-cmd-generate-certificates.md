---
title: 🔐 Generate Certificates
permalink: /docs/cmd/generate-certificates/
toc: true
---

Generates all the credentials needed for signing and validating Extensions 2.0.

## Command Pre-conditions

- A workspace (any folder) must be open in the VSCode window

## Demo

![generate_certificates]({{ site.baseurl }}/assets/gifs/generate_certificates.gif)

## Detailed command flow

1. An RSA Key Pair is generated, to be used for creating the CA Certificate.

2. The CA Certificate is generated from the RSA Key Pair

3. An RSA Key Pair is generated, to be used for creating a Developer Certificate.

4. The Developer Certificate is generated from the RSA Key Pair and the CA Certificate is
   added as the issuing authority on this credential.

   <p class="notice--info">
     <strong>📝 Note:</strong>
     <br/>
     Credential details can be customized through
     <a href="/dynatrace-extensions-copilot/docs/settings-credentials/">settings</a>
   </p>

5. All intermediary files are stored in the VSCode workspace storage and the
   [credential settings](/dynatrace-extensions-copilot/docs/settings-credentials/) for this
   workspace are updated with the paths to the generated files. This is done in the
   `./vscode/settings.json` file.

6. Upon successful completion you are prompted for uploading your credentials to Dynatrace
   and this links the workflow to the [Distribute certificate](/dynatrace-extensions-copilot/docs/cmd-distribute-certificate/) command.