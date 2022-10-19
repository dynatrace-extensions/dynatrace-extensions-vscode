# Change Log

## Version 0.16.0 / Stage: alpha (19.10.2022)

### ✨ New in this version:
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
