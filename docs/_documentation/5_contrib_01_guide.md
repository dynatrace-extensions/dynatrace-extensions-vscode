---
title: Guide
permalink: /docs/contrib/guide/
toc: true
toc_sticky: true
---

Mandatory guide for anyone wanting to contribute to this project.

## Contributing to this project

The Copilot is still in its infancy and there are many areas where help is needed.
These include:
- Manually testing features/scenarios and finding bugs and edge cases
- Writing unit tests
- Fixing already found bugs
- Improving existing functionality
- Implementation new features

## Set up your environment

### Requirements

You must have NodeJS (min. version 16) and VisualStudio Code installed on your machine. 
Please visit [nodejs.org](https://nodejs.org/en/) and
[code.visualstudio.com](https://code.visualstudio.com/) then follow the instructions 
for your O/S.

To contribute, you'll have to
[fork](https://github.com/dynatrace-extensions/dynatrace-extensions-copilot) and then 
clone the repository.

Then install the dependencies:
```bash
cd dynatrace-extensions-copilot
npm install
```

### Running the Extension

The repository already comes with VSCode launch configurations attached. Once you ran
the `install` command, all you have to do is hit `F5`. VSCode will open a new window 
with the extension compiled and running inside it.

### Troubleshooting

With the extension running live, you can use `Ctrl + Shift + I` to open VSCode's 
eveloper tools (same as in a browser). All your `console.log(...)` statements appear here.

Debugging works the same as with any project. Set your breakpoints, then hit `F5` and 
the code will pause on them.

## Make your first contribution

Make sure to check out the 
[project structure](/docs/contrib/project-structure/) to
understand how it works and where to best enhance it.

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
  - Grab an already open 
    [issue or bug](https://github.com/dynatrace-extensions/dynatrace-extensions-copilot/issues)
  - Create a separate branch linked to the issue and work on fixing it
  - Create a pull request mentioning the issue fixed
- **Improve an existing feature or implement new functionality**
  - Create an issue for the improvement or new feature and wait for approval (additional
    discussion may be needed in some cases)
  - Create a separate branch linked to the issue created and work on it
  - Write a test case/suite for it if you can
  - Create a pull request referencing the issue

Pull requests that are not ready for review should be marked as `draft`. All existing
issues should be assigned to users while they're being worked on so that work isn't
overlapped.

Thanks for contributing!