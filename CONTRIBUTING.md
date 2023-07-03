# Contributing to this project

This project is fully open source and community driven. There are several areas in which help is needed.
These include:

- Manually testing features/scenarios and finding bugs and edge cases
- Writing unit tests
- Fixing already found bugs
- Improvements to existing functionality
- New feature implementation

Contributing is easy:

1. [Set up your environment](#environment-setup)
2. [Understand the project structure](#understanding-project-structure)
3. [Make your first contribution](#make-your-first-contribution)

## Contributor License Agreement

Contributions to this project must be accompanied by a Contributor License
Agreement. You (or your employer) retain the copyright to your contribution;
this simply gives us permission to use and redistribute your contributions as
part of the project.

You generally only need to submit a CLA once, so if you've already submitted one
(even if it was for a different project), you probably don't need to do it
again.

## Set up your environment

### Requirements

You must have NodeJS (min. version 16) and VisualStudio Code installed on your machine. Please visit [nodejs.org](https://nodejs.org/en/) and [code.visualstudio.com](https://code.visualstudio.com/) then follow the instructions for your O/S.

To contribute, you'll have to [fork](https://github.com/dynatrace-extensions/dynatrace-extensions-vscode) and clone the repository.
Then install the dependencies:

```bash
cd dynatrace-extensions-vscode
npm install
```

### Running the Extension

The repository already comes with VS Code launch configurations attached. Once you run the `install` command, all you have to do is hit `F5`. VS Code will open a new window with the extension compiled and running inside it.

### Troubleshooting

With the extension running live, you can use `Ctrl + Shift + I` to open VSCode's developer tools (same as in a browser). All your `console.log(...)` statements appear here.

Debugging works the same as with any project. Set your breakpoints, then hit `F5` and the code will pause on them.

## Understand the project structure

This project is structured as follows:

```
<PROJECT ROOT>
	|
	|-- src/				# Main folder for source code
	|   |
	|   |-- assets/				# Static assets
	|   |    |-- fonts/			# Custom fonts (i.e. for symbols)
	|   |    |-- icons/			# Icons
	|   |    |-- logos/			# Logos (e.g. Dynatrace logo)
  |   |    |-- jsonSchemas/     # Custom JSON schemas (i.e. for monitoring configs)
  |   |    |-- mibs/            # MIB files for the local SNMP database
  |  	|
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
  |   |-- hover/      # Main folder for hover provider implementations
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

## Make your first contribution

Found something you can work on to contribute to this project? That's awesome.
Here are some basic guidelines depending on your type of work:

- **Write a unit test**
  - Create a separate branch
  - Write your test either in an existing file or a new one ending in `.test.ts`
  - Make sure your test is passing `npm test`
  - Create a pull request
- **Create an issue for a bug**
  - If you found a bug, create an issue for it
  - Describe what is the observed vs. expected behavior
  - Provide the full extension YAML that resulted in this issue
- **Fix a bug related issue**
  - Grab an already open [issue/bug](https://github.com/dynatrace-extensions/dynatrace-extensions-vscode/issues)
  - Create a separate branch linked to the issue and work on fixing it
  - Create a pull request mentioning the issue fixed
- **Improve an existing feature or implement new functionality**
  - Create an issue for the improvement or new feature and wait for approval (additional discussion may be needed in some cases)
  - Create a separate branch linked to the issue created and work on it
  - Write a test suite/case for it if you can
  - Create a pull request referencing the issue

Pull requests that are not ready for review should be marked as `draft`

---

# Thanks for contributing!
