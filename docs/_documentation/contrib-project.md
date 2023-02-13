---
title: Project structure
permalink: /docs/contrib/project-structure/
toc: true
---

Mandatory reading for anyone wanting to contribute to this project.

## Understand the project structure

This project is structured as follows:

```
<PROJECT ROOT>
	|
	|-- previews/				# Gifs & previews for GitHub
	|-- src/				# Main folder for source code
	|   |
	|   |-- assets/				# Static assets
	|   |    |-- fonts/			# Custom fonts (i.e. for symbols)
	|   |    |-- icons/			# Icons
	|   |    |-- logos/			# Logos (e.g. Dynatrace logo)
    	|   |
	|   |-- codeActions/			# Main folder for Code Action providers
	|   |    |-- utils/			# Utility functions for code action providers
	|   |    |-- <file>.ts 			# Implementation of a code action provider
	|   |
	|   |-- codeCompletions/		# Main folder for Completion providers (see above for structure)
	|   |-- codeLens/			# Main folder for Code Lens providers (see above for structure)
	|   |-- commandPalette/			# Main folder for commands available in the Command Palette
	|   |-- diagnostics/			# Main folder for diagnostics provider
	|   |    |-- diagnosticData.ts		# Collection of known diagnostics data
	|   |    |-- diagnostics.ts		# Implementation of diagnostics provider
	|   |    |-- diagnosticFixProvider.ts	# Implementation of diagnostic fix actions provider
	|   |
	|   |-- dynatrace-api/			# Client for Dynatrace API operations
	|   |    |-- configuration_v1/		# All operations of Config v1 endpoint
	|   |    |-- environment_v2/		# All operations of Environment v2 endpoint
	|   |    |-- interfaces/		# All interfaces related to API
	|   |    |-- dynatrace.ts 		# Main implementation
	|   |    |-- errors.ts          	# Custom errors
	|   |    |-- http_client.ts 		# HTTP Client implementation
	|   |
	|   |-- interfaces/			# Generic/shared interfaces throughout the project
	|   |-- statusBar/			# Status Bar implementations
	|   |-- test/				# Test suite (desperately needs contribution)
	|   |-- treeViews/			# Main folder for Tree View Item providers
	|   |	  |-- commands/			# Commands related to tree views
	|   |
	|   |-- utils/				# Utility functions shared throughout the project
	|   |-- webviews/			# Implementations of custom web views
	|   |-- extension.ts 			# Main file that VSCode runs. Everything is referenced here
	|
	|-- package.json			# Node JS configuration, but also contributions to the VSCode UI
	|
	|-- ******************************************************************************************************
```

**VSCode API Features**

Each distinct feature is placed within its own folder. The files in the main folder contain direct implementations of that feature. Within this folder, utility functions are placed in the `utils` folder.
For example, files inside `/src/codeLens` contain direct implementations of VSCode Code Lens Providers and utility functions that are useful to these providers are in the `/src/codeLens/utils` folder.
You can look up any class and function of a feature [online](https://code.visualstudio.com/api/references/vscode-api).

**Utilities**

Functionality that is generic enough to be used pretty much anywhere within the project should be part of the main `/src/utils` folder. Each file here is used for labelling more than anything - it's a category of utilities.

**Command Palette Commands**

These are the commands the user can directly invoke with `Ctrl + Shift + P` and represent Extensions Development workflows; they are implemented each in their own file inside `/src/commandPalette`. They are all registered within the `/src/extension.ts` file and it is within this file that checks should be implemented to decide whether the command should actually execute or not. Functions for checking various conditions are implemented un `/src/utils/conditionCheckers.ts`.

**Dynatrace API Client**

The project packages a very simplistic and rudimentary implementation of an HTTP Client wrapped around the Dynatrace API which is found in `/src/dynatrace-api`. This is to support API functions but does not aim to be a complete/standalone client (nor should it have to).
Extending the client is done only if other features/functionality needs to use operations that are not implemented. Each folder represents an API (e.g. configuration, environment) and each file within represents an API endpoint (e.g. monitored entities). Interfaces are shared and kept in the `/src/dynatrace-api/interfaces` folder and do not necessarily need to be 100% complete.

**Extension Manifest**

The `/package.json` is called the Extension Manifest, which is the standard NodeJS configuration but also includes VS Code "contribution points". These represent "extras" (mostly to the VSCode interface) that this Extensions brings (e.g. commands for the palette, fonts, views, etc.).
All contribution points are documented [online](https://code.visualstudio.com/api/references/contribution-points).

**Tests**

The setup for tests is found in `/src/test` and follows VSCode's default setup for Extension tests using Mocha as the framework. All implemented tests are inside `/src/test/suite` and you can run them at any time with:
```
npm test
```
This project is lacking proper unit tests so this is probably where one of the most valuable contributions that can be made if you have the knowhow.