# Change Log

## Version 2.2.1 (unreleased)

### 🪲 Fixed in this version:
- [#136 - Charts cards should specify mode](https://github.com/dynatrace-extensions/dynatrace-extensions-vscode/issues/136)
- [#132 - Error "cannot read name" when activating new extension](https://github.com/dynatrace-extensions/dynatrace-extensions-vscode/issues/132)
- [#135 - Screens rejected on subsequent uploads](https://github.com/dynatrace-extensions/dynatrace-extensions-vscode/issues/135)

## Version 2.2.0 (27.07.2023)

### ✨ New in this version:
- [#125 - Standardize WebView Panels](https://github.com/dynatrace-extensions/dynatrace-extensions-vscode/issues/125)

### 🪲 Fixed in this version:
- Prometheus scraping from file not working
- Code Actions from Prometheus scraped metrics not being suggested

---

## Version 2.0.1 (03.07.2023)

### ✨ New in this version:
- Project rebranding to "Dynatrace Extensions", along with new icons
- Documentation moved to Dynatrace [Developer Portal](https://developer.dynatrace.com)
- Migration utility from previous versions of this project
- Hover information for SNMP object IDs and names

### 🚀 Improved in this version:
- [#118 - Support for Platform URLs](https://github.com/dynatrace-extensions/dynatrace-extensions-vscode/issues/118)
- [#109 - Prometheus scraping from file](https://github.com/dynatrace-extensions/dynatrace-extensions-vscode/issues/109)
- [#117 - Connection checks for Dynatrace environments](https://github.com/dynatrace-extensions/dynatrace-extensions-vscode/issues/117)
- [#78 - Attach generated alerts to entities](https://github.com/dynatrace-extensions/dynatrace-extensions-vscode/issues/78)
- [#98 - Support for local MIB files in snmp extensions](https://github.com/dynatrace-extensions/dynatrace-extensions-vscode/issues/98)
- [#122 - Tighten regexes for tenants and improve no data messaging](https://github.com/dynatrace-extensions/dynatrace-extensions-vscode/issues/122)

### 🪲 Fixed in this version:
- [#113 - Temporary file interface closes too early](https://github.com/dynatrace-extensions/dynatrace-extensions-vscode/issues/113)
- [#121 - INJECTIONS card gets error diagnostic over extension's name](https://github.com/dynatrace-extensions/dynatrace-extensions-vscode/issues/121)

---

## Version 1.2.4 (13.06.2023)

### ✨ New in this version:
- [#91 - Python datasource - support for UA screens & charts](https://github.com/dynatrace-extensions/dynatrace-extensions-vscode/issues/91)

### 🪲 Fixed in this version:
- [#115 - Uninstall/Disable of Copilot disables/uninstalls YAML extension](https://github.com/dynatrace-extensions/dynatrace-extensions-vscode/issues/115)
  - Disabling Copilot still requires disabling all other extensions that depend on YAML (issue of VSCode marketplace)
  - Uninstalling will only uninstall the Copilot alone

### 🚀 Improved in this version:
- Guards put in place for parallel running with the newer version of this project (unreleased currently)

---

## Version 1.2.3 (09.05.2023)

### ✨ New in this version:
- [#81 - Monitoring Configurations part 2](https://github.com/dynatrace-extensions/dynatrace-extensions-copilot/issues/81)
  - Copilot can now generate configuration files for Extensions that are not deployed yet
  - When configuring deployed extensions, can select from files in the `config` folder
  - Any configuration from the tenant can be saved to the `config` folder of the current workspace
  - The "scope" of a monitoring configuration offers suggestions from tenant
- [#89 - .gitignore as part of workspace initialization](https://github.com/dynatrace-extensions/dynatrace-extensions-copilot/issues/89)

### 🪲 Fixed in this version:
- The WMI Code Lens would not be able to interpret single item responses
- Workspaces initialized since version 1.2.1 may be unaccessible afterwards
  - For any such workspace, re-initialize it once the add-on was updated to version 1.2.3

### 🚀 Improved in this version:
- [#108 - Prompt user for dashboard name when generating](https://github.com/dynatrace-extensions/dynatrace-extensions-copilot/issues/108)

### 🧹 Housekeeping:
- [#102 - Standardize linting setup](https://github.com/dynatrace-extensions/dynatrace-extensions-copilot/issues/102)
- [#101 - Standardize code styling/formatting](https://github.com/dynatrace-extensions/dynatrace-extensions-copilot/issues/102)

---

## Version 1.2.2 (17.04.2023)

### 🪲 Fixed in this version:
- Overview dashboard not added correctly to yaml

---

## Version 1.2.1 (13.04.2023)

### 🚀 Improved in this version:
- [#97 - Support for WSL2 and dev containers](https://github.com/dynatrace-extensions/dynatrace-extensions-copilot/issues/97)

---

## Version 1.2.0 (11.04.2023)

### ✨ New in this version:
- [#99 - Specialized project initialization](https://github.com/dynatrace-extensions/dynatrace-extensions-copilot/issues/99)
- [#71 - JMX v1 to v2 converter](https://github.com/dynatrace-extensions/dynatrace-extensions-copilot/issues/71)

### 🪲 Fixed in this version:
- [#103 - SNMP diagnostics highlight all OIDs as unknown](https://github.com/dynatrace-extensions/dynatrace-extensions-copilot/issues/103)
- [#94 - When building python extensions, only one extra platform is supported](https://github.com/dynatrace-extensions/dynatrace-extensions-copilot/issues/94)

### 🚀 Improved in this version:
- [#100 - Comments and indentation are removed when generating an overview dashboard](https://github.com/dynatrace-extensions/dynatrace-extensions-copilot/issues/100)

---

## Version 1.1.0 (10.03.2023)

### ✨ New in this version:
- [#66 - Code actions for SNMP metric metadata](https://github.com/dynatrace-extensions/dynatrace-extensions-copilot/issues/66)
- [#80 - Initial support for monitoring configurations](https://github.com/dynatrace-extensions/dynatrace-extensions-copilot/issues/80)

### 🪲 Fixed in this version:
- [#82 - Error message shown when opening VSCode outside of a workspace](https://github.com/dynatrace-extensions/dynatrace-extensions-copilot/issues/82)
- [#83 - Prometheus code lens appears too often](https://github.com/dynatrace-extensions/dynatrace-extensions-copilot/issues/83)
- [#86 - Extension not bundled correctly](https://github.com/dynatrace-extensions/dynatrace-extensions-copilot/issues/86)
- [#87 - Metric table cards not diagnosed correctly](https://github.com/dynatrace-extensions/dynatrace-extensions-copilot/issues/87)

### 🚀 Improved in this version:
- [#85 - Git-based functionality removed](https://github.com/dynatrace-extensions/dynatrace-extensions-copilot/issues/85)
- [#64 - Reduce the amount of yaml parsing invocations](https://github.com/dynatrace-extensions/dynatrace-extensions-copilot/issues/64)
- Installation package reduced to ~420KB
- Extension startup times consistent at 100-250 ms

---

## Version 1.0.3 (03.03.2023)

### 🪲 Fixed in this version:
- [#75 - Link to configure extension not working on dashboard](https://github.com/dynatrace-extensions/dynatrace-extensions-copilot/issues/75)
- [#74 - Create documentation command fails at alert processing](https://github.com/dynatrace-extensions/dynatrace-extensions-copilot/issues/74)
- [#72 - Create alert can generate invalid file name](https://github.com/dynatrace-extensions/dynatrace-extensions-copilot/issues/72)

### 🚀 Improved in this version:
- [#76 - Generated dashboard title to include extension name](https://github.com/dynatrace-extensions/dynatrace-extensions-copilot/issues/76)
- [#62 - Long running commands can be cancelled](https://github.com/dynatrace-extensions/dynatrace-extensions-copilot/issues/62)

---

## Version 1.0.2 (27.02.2023)

### 🪲 Fixed in this version:
- [#65 - WMI Code Lens does not clear correctly](https://github.com/dynatrace-extensions/dynatrace-extensions-copilot/issues/65)
- Feature settings toggle not working for WMI & Screen Code Lens

### 🚀 Improved in this version:
- [#63 - Prometheus cached results clear when switching endpoints](https://github.com/dynatrace-extensions/dynatrace-extensions-copilot/issues/63)
- [#67 - Create Alert command prefers metrics from datasource](https://github.com/dynatrace-extensions/dynatrace-extensions-copilot/issues/67)

---

## Version 1.0.1 (23.02.2023)

### 🪲 Fixed in this version:
- [#61 - Copilot is not activated unless a folder is open](https://github.com/dynatrace-extensions/dynatrace-extensions-copilot/issues/61)

---

## Version 1.0.0 (22.02.2023)

### ✨ New in this version:
- [#59 - Credentials can now be stored in global settings](https://github.com/dynatrace-extensions/dynatrace-extensions-copilot/issues/59)
- [#56 - Build command saves changes to extension manifest before running](https://github.com/dynatrace-extensions/dynatrace-extensions-copilot/issues/56)
- [#45 - Diagnostics collection offers insights into SNMP](https://github.com/dynatrace-extensions/dynatrace-extensions-copilot/issues/45)
- [#52 - Copilot uses fused credential files](https://github.com/dynatrace-extensions/dynatrace-extensions-copilot/issues/52)
- [#29 - Context menus in the Workspaces view allow switching features on/off](https://github.com/dynatrace-extensions/dynatrace-extensions-copilot/issues/29)

### 🚀 Improved in this version:
- [#58 - URLs for environments are now validated more accurately](https://github.com/dynatrace-extensions/dynatrace-extensions-copilot/issues/58)
- [#55 - Code lens for Prometheus allow changing endpoint details](https://github.com/dynatrace-extensions/dynatrace-extensions-copilot/issues/55)
- [#54 - Code lens for Prometheus displays how many metrics we scraped](https://github.com/dynatrace-extensions/dynatrace-extensions-copilot/issues/54)

### 🪲 Fixed in this version:
- [#57 - Tokens displayed in clear text when editing environments](https://github.com/dynatrace-extensions/dynatrace-extensions-copilot/issues/57)

### ⚠️ Special notes:
- Since this is a live version available on Marketplace it will appear as a new extension.
  This means any previous version should be removed and any workspaces will have to be initialized again.
- Starting with this version, the add-on only supports fused credential files.
  If you want to use an older format (key & certificate as separate files) you must paste the contents manually and create a fused file.

---

## Version 0.24.4 / Stage: beta (07.02.2023)

### 🚀 Improved in this version:
- [#50 - Generated screens should have injections enabled by default](https://github.com/dynatrace-extensions/dynatrace-extensions-copilot/issues/50)

### 🪲 Fixed in this version:
- [#53 - Change in dt-sdk breaks Build command for Python](https://github.com/dynatrace-extensions/dynatrace-extensions-copilot/issues/53)

---

## Version 0.24.3 / Stage: beta (25.01.2023)

### 🚀 Improved in this version:
- [#44 - Credential files should support relative paths](https://github.com/dynatrace-extensions/dynatrace-extensions-copilot/issues/44)
- [#23 - Checks and warnings regarding YAML Schema extension](https://github.com/dynatrace-extensions/dynatrace-extensions-copilot/issues/23)

### 🪲 Fixed in this version:
- [#49 - Internal repo checks don't cover Python repos](https://github.com/dynatrace-extensions/dynatrace-extensions-copilot/issues/49)
- [#48 - Build command breaks if name or version is surrounded by quotes](https://github.com/dynatrace-extensions/dynatrace-extensions-copilot/issues/48)

---

## Version 0.24.1 / Stage: beta (24.01.2023)

### ✨ New in this version:
- [#43 - Code action idea - generate alerts JSON](https://github.com/dynatrace-extensions/dynatrace-extensions-copilot/issues/43)

### 🚀 Improved in this version:
- Extension automatically installs the required YAML by RedHat extension too
- Extension activates as soon as vscode starts up
- Python building includes both linux & windows modules

### 🪲 Fixed in this version:
- Errors on non-existent commands when extension not in a valid workspace
- [#41 - Overview dashboard not adding metrics for sql datasource](https://github.com/dynatrace-extensions/dynatrace-extensions-copilot/issues/41)

---

## Version 0.22.3 / Stage: beta (06.01.2023)

### 🪲 Fixed in this version:
- Certificates are not being uploaded to local installations correctly

---

## Version 0.22.2 / Stage: beta (06.01.2023)

### 🚀 Improved in this version:
- Increased logging in DevTools to aid troubleshooting
- Card key diagnostics more accurate
- Workspace structure allows `extension/extension.yaml` one level deep as well as in root of the workspace

---

## Version 0.22.1 / Stage: beta (23.12.2022)

### 🚀 Improved in this version:
- [#34 - Limit YAML re-formatting for small changes](https://github.com/dynatrace-extensions/dynatrace-extensions-copilot/issues/34)
- [#36 - Automatically place certificates in the OA+AG directories](https://github.com/dynatrace-extensions/dynatrace-extensions-copilot/issues/36)
  - Command "Upload certificate" has also been renamed to "Distribute certificate" to better indicate this

### 🪲 Fixed in this version:
- [#37 - Prometheus Scraper keeps "counter" metric type](https://github.com/dynatrace-extensions/dynatrace-extensions-copilot/issues/37)
- [#35 - Credentials generated by the copilot fail validation on component side](https://github.com/dynatrace-extensions/dynatrace-extensions-copilot/issues/35)
- [#33 - BYO Certs don't work with the latest dt-cli format bug](https://github.com/dynatrace-extensions/dynatrace-extensions-copilot/issues/33)
- [#31 - Building Python extension does not link to upload command](https://github.com/dynatrace-extensions/dynatrace-extensions-copilot/issues/31)

---

## Version 0.21.0 / Stage: beta (09.12.2022)

### ✨ New in this version:
- [#26 - WMI Queries utility for the WMI datasource (code lens)](https://github.com/dynatrace-extensions/dynatrace-extensions-copilot/issues/26)
- [#28 - WMI Code Actions for auto-completion](https://github.com/dynatrace-extensions/dynatrace-extensions-copilot/issues/28)

### 🚀 Improved in this version:
- [#30 - Prometheus scraper handles missing dimensions](https://github.com/dynatrace-extensions/dynatrace-extensions-copilot/issues/30)

### 🪲 Fixed in this version:
- [#24 - Python extension upload would fail](https://github.com/dynatrace-extensions/dynatrace-extensions-copilot/issues/18)

---

## Version 0.20.1 / Stage: beta (11.11.2022)

### ✨ New in this version:
- First diagnostics fix actions. Fix one or all your metric key issues.

### 🚀 Improved in this version:
- Diagnostics for metric keys are more accurately highlighted

### 🪲 Fixed in this version:
- [#22 - Wait needed after Deleting Oldest Extension Version](https://github.com/dynatrace-extensions/dynatrace-extensions-copilot/issues/22)
  - Fixed for all: Regular Build/Upload + FastMode Build

---

## Version 0.19.0 / Stage: beta (02.11.2022)

### 🚀 Improved in this version:
- Building python extensions uses virtual environment if one is detected (depends on VSCode Python extension)

### 🪲 Fixed in this version:
- [#21 - Fast development mode build issues](https://github.com/dynatrace-extensions/dynatrace-extensions-copilot/issues/21)
- [#20 - Create documentation is not invoked properly](https://github.com/dynatrace-extensions/dynatrace-extensions-copilot/issues/20)
- Diagnostics for metric keys are more accurate now
- Metrics by featureset are now collected more accurately

---

## Version 0.18.0 / Stage: beta (28.10.2022)

### ✨ New in this version:
- Diagnostics for metric keys

### 🪲 Fixed in this version:
- Screen creation not adding \n after last screen
- Screen generation not building action snippet correctly
- Entity filters snippet not correctly indented when being generated

---

## Version 0.17.1 / Stage: beta (25.10.2022)

### ✨ New in this version
- Status bar can create Pull Requests for Dynatrace official repositories
- Code Lens for opening the unified analysis screens

### 🚀 Improved in this version:
- Environment token is obfuscated during setup
- Diagnostic collection is aware of Dynatrace official repositories

### 🪲 Fixed in this version:
- Build workflow would not link to upload & activate commands

---

## Version 0.16.0 / Stage: alpha (19.10.2022)

### ✨ New in this version:
- Workflow for creating an extension overview dashboard (landing page)
- Build workflow can now build Python extension too (needs `dt-sdk` available globally)
- Code Actions for inserting filtering blocks and filters within entity lists
- Code Actions for inserting actions within screens

### 🚀 Improved in this version:
- Selector code lenses are much faster
- Suggestions related to entity attributes are correctly de-duplicated

### 🪲 Fixed in this version:
- Selector code lenses would sometimes make the extension unresponsive

---

## Version 0.15.0 / Stage: alpha (13.10.2022)

### ✨ New in this version:
- Fast Development Mode availabe (read the docs what it is and how to enable)
- Code Lenses for Prometheus extensions allowing to scrape and endpoint
- Auto-completaions for metric and dimension values from prometheus scraped data as well as descriptions (in metadata)
- Code Actions for inserting metric, dimension, and metadata definitions from prometheus scraped data
- Code Actions for inserting entire entity screens
- First diagnostic items raised around extension name

### 🚀 Improved in this version:
- Build process uses diagnostics collection to decide if extension is ready to build
- Extension version is auto-incremented if version already exists in tenant
- Generated entity lists include a filter by entity name

### 🪲 Fixed in this version:
- Actions and completions should trigger more often as extension parsing can handle incomplete/incorrect data better

---

## Version 0.14.7 / Stage: alpha (06.10.2022)

### 🚀 Improved in this version:
- Selector statuses are now cached. They will only reset when they change. Known statuses won't require re-validation.
- Build & validation issues are communicated more clearly via JSON output

### 🐛 Fixed in this version:
- Adding a new workspace would not trigger initialization correctly

---

## Version 0.14.6 / Stage: alpha (03.10.2022)

### 🚀 Improved in this version:
- YAML re-writing does not fold lines

### 🐛 Fixed in this version:
- Build process following the refactoring

---

## Version 0.14.3 / Stage: alpha (03.10.2022)

### ✨ New in this version:
- Code Lens for entity selectors similar to metric ones
- Settings to enable/disable code lenses for both metric and entity selectors
- Auto-completions for card keys in screen layouts and card lists

### 🚀 Improved in this version:
- Build command includes extension schema validation
- Errors from validating extension are shown in JSON in output panel
- Auto-completion suggestions are more readable
- Improved error communication to user via output panel
- Better status messging (loading indicators) in longer running commands
- Extension .zip archive is no longer produced for invalid extensions

### ⚠️Breaking changes:
- Settings have been refactored. See README.md to get new values.
