# Contributing to this project

This project is fully open source and community driven. There are several ways in which you can contribute.
These include:

- Manually testing features/scenarios and reporting bugs and edge cases
- Writing tests
- Fixing bugs
- Improvements to existing functionality
- New feature implementation

Follow this guide to find out how to make a good contribution:

1. [Contributor license agreement](#contributor-license-agreement)
2. [Set up your environment](#environment-setup)
3. [Familiarize yourself with the project](#familiarize-yourself-with-the-project)
4. [Make your first contribution](#make-your-first-contribution)

## Contributor License Agreement

Contributions to this project must be accompanied by a Contributor License
Agreement. You (or your employer) retain the copyright to your contribution;
this simply gives us permission to use and redistribute your contributions as
part of the project.

You generally only need to submit a CLA once, so if you've already submitted one
(even if it was for a different project), you probably don't need to do it
again.

## Set up your environment

### Installation

Requirements:

- NodeJS min. version 20 (see [nodejs.org](https://nodejs.org/en/))
- Visual Studio Code (see [code.visualstudio.com](https://code.visualstudio.com/)) along with:
  - ESLint ([see on marketplace](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint))
  - Prettier ([see on marketplace](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode))
  - ESBuild problem matchers ([see on marketplace](https://marketplace.visualstudio.com/items?itemName=connor4312.esbuild-problem-matchers))

Once you cloned or forked the repository...

Install the project

```bash
npm run install:all
```

Build the project

```bash
npm run build:all
```

### Running

The repository already comes with VS Code launch configurations attached. After running the commands above, all you have to do is hit `F5`. VS Code will open a new window with the extension compiled and running inside it.

This does not install the extension if you don't have it. Think of it as a live copy. It also doesn't conflict with a previous installation of the extension, but will work with the same shared settings and filesystem.

### Testing

Run the unit test suite

```bash
npm run test:unit
```

Run the e2e test suite

```bash
npm run test:e2e
```

Or, combined, run all tests:

```bash
npm run test
```

### Troubleshooting and debugging

With the extension running live, you can use `Ctrl + Shift + I` to open VS Code's developer tools (same as in a browser). All your log statements appear here.

Same as with any project, you can set breakpoints, then hit `F5` and the code will pause on them.

There are two run configurations available: `Run extension` and `Jest current file`. The latter will run the currently open test file and allow you to debug it using breakpoints.

## Familiarize yourself with the project

### Project structure

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
	|   |    |-- jsonSchemas/		# Custom JSON schemas (i.e. for monitoring configs)
	|   |    |-- mibs/			# MIB files for the local SNMP database
	|   |
	|   |-- codeActions/			# Main folder for Code Action providers
	|   |    |-- utils/			# Utility functions for code action providers
	|   |    |-- <file>.ts 			# Implementation of a code action provider
	|   |
	|   |-- codeCompletions/		# Main folder for Completion providers (see above for structure)
	|   |-- codeLens/			# Main folder for Code Lens providers (see above for structure)
	|   |-- commandPalette/			# Main folder for commands available in the Command Palette
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
	|   |-- treeViews/			# Main folder for Tree View Item providers
	|   |	  |-- commands/			# Commands related to tree views
	|   |
	|   |-- utils/				# Utility functions shared throughout the project
	|   |-- webviews/			# Webview panel manager implementation
	|   |-- extension.ts 			# Main file that VSCode runs. Everything is referenced here
	|
	|-- test/
	|   |
	|   |-- e2e/				# E2E test suite
	|   |-- shared/				# Shared test utils
	|   |-- unit/				# Unit test suite
	|
	|-- webview-ui/     # Separate project for the custom webview UI (React app)
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

These are the commands the user can directly invoke with `F1` and represent Dynatrace extension development workflows; they are implemented each in their own file inside `/src/commandPalette`. They are all registered within the `/src/extension.ts` file. Functions for checking various conditions are implemented in `/src/utils/conditionCheckers.ts`, and these conditions should be checked in the command's file, not during registration in `extension.ts`.

**Dynatrace API Client**

The project packages a very simplistic and rudimentary implementation of an HTTP Client wrapped around the Dynatrace API which is found in `/src/dynatrace-api`. This is to support API functions but does not aim to be a complete/standalone client (nor should it have to).
Extending the client is done only if other features/functionality need to use operations that are not implemented. Each folder represents an API (e.g. configuration, environment) and each file within represents an API endpoint (e.g. monitored entities). Interfaces are shared and kept in the `/src/dynatrace-api/interfaces` folder and do not necessarily need to be 100% complete.

**Extension Manifest**

The `/package.json` is called the Extension Manifest, which is the standard NodeJS configuration file but also includes VS Code "contribution points". These represent "extras" (mostly to the VSCode interface) that this Extensions brings (e.g. commands for the palette, fonts, views, etc.).
All contribution points are documented [online](https://code.visualstudio.com/api/references/contribution-points).

**Tests**

Two Jest projects are setup for testing, `unit` and `e2e`. These run automatically with every opened Pull Request, and must pass for your contribution to be merged. You can run them locally separately using `npm run test test:<project>` or together using `npm run test`.

Code coverage is only enabled file by file as most of the code base is still un-tested.

### Branches and releases

Releases to VS Code marketplace are triggered on-demand using the [Marketplace release](https://github.com/dynatrace-extensions/dynatrace-extensions-vscode/actions/workflows/build_and_publish.yml) workflow. Releases on GitHub are done manually after a marketplace release. The cadence is irregular, but normal features tend to get implemented in a release-worthy amount roughly monthly.

Releases are done from the `main` branch.

There are two other branches kept in sync with `main`:

- `release/current`
  - Future facing work that is meant for the next release.
  - All development work should be done here
- `release/hotfix`
  - Bug fixes only.
  - This allows for quick changes to `main` for fixing bugs while leaving `release/current` intact for lengthier work items

## Make your first contribution

A few rules for effective contributions:

- Always create an issue before working on new Improvements, Features, or Bugs
- Never work against `main` branch
- Assign issues to yourself to "reserve" or mark them as "in progress"
- If a Pull Request is not ready for review, keep it in "draft" state
- Make sure all tests are passing before opening the PR or requesting a review

---

# Thanks for contributing!
