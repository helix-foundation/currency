# Contributing to the Eco Currency

## Table of Contents
 - [Security](#security)
 - [Pull Request Review](#pull-requests)
 - [Tooling](#tooling)
 - [Packaging and Releasing](#packaging-and-releasing)

## Security
### Reporting Vulnerabilities
If you believe you've identified a security vulnerability in Eco's contracts or other software please submit to the Immunefi bounty (https://immunefi.com/bounty/eco/) or join the Eco Association Discord (https://discord.eco.org) and tag or message an Eco Association team member. This will help ensure your issue gets attention promptly while also providing the Eco community an opportunity to fix any problem before it's publicized. The community will make sure to publicly disclose the vulnerability and credit you for finding it.

## Pull Request Review
Contributing non-security related changes to the code base can be done via creating a pull request to this repository. Contributions to deployed solidity code should always include a proposal that implements the change. Contributions without proposals should include a discussion of how the change might be implemented and should be opened as draft pull requests.

Contributions should come with corresponding tests, either in the corresponding test file for the changed contract, or in a new test file for new contracts. The added tests should provide 100% branch coverage of the contract, including failed reverts. There should also be a test that runs through the proposal voting process of the aforementioned proposal and checks to see if the change can be made successfully. Additionally, there should be no lint or formatting issues (detailed below).

Once your pull request is submitted, a repository admin will review it to make sure all required pieces are present, and then trigger github to run the test suite. Your pull will be reviewed only if the test suite passes. Multiple failures might result in your pull request being converted to a draft, or being closed altogether. If the tests do pass, they will be reviewed. Comments from the review must be addressed. If a contribution passes review, it will be approved. However, understand that pull requests that have passed every other step are only merged if the proposal code is implemented.

## Tooling
### The Test Suite
There are 3 key processes run by Eco's CI tooling:
 - The lint/style rules
 - The main test suite
 - A full test of contract deployment

#### The Linter
`solhint` and `eslint` are used to check for common errors and ensure consistent styling. You can run the full suite of lint rules (both linters) with `npm run lint` from the project root. Passing of the prettier and linter is a requirement in the final stages before a change can be merged.

##### Auto-formatting
`prettier` is used to automatically format the code. You can run the autoformatter across the project by running `npm run format` from the project root.

##### Disabling Linter Rules
When a linter rule needs to be disabled it should be disabled for the smallest region of code possible. Prefer single-line exceptions (`solhint-disable-next-line`) for specific rules (eg `security/no-inline-assembly`) than block disables for specific rules. Do not disable rules for entire files, or disable all rules for regions or files, unless absolutely necessary.

#### The main test suite
You can run the main test suite with `npm test`. This should run the tests and print a summary of results with details of any failures. All tests will be run.

Any new tests should be added in the `test/` directory following the existing directory structure as best as possible.

#### Contract deployment tests
The deployment file `tools/eco.js` can be run with the flag `ganache: true` to test deployment on a local ganache chain.

#### Coverage reporting
Eco's coverage reporting toolchain works by inserting events into the solidity code, and not all functionality is supported. To make this possible the `run-cover.sh` script is used to run the coverage tools in an isolated environment and apply some code changes to account for deficiencies.

You can run the coverage suite with `npm run coverage`. It produces two coverage reports, one for Solidity and one for JavaScript.

## Packaging and Releasing
Before releasing:
 - Verify that you have all the latest dependencies: `npm ci`
 - Verify that the linter runs cleanly: `npm run lint`
 - Verify that the tests pass: `npm test`

To release:
 - Bump the version using `npm version`. Make major releases when the ABI has
   changed.
 - Run `npm publish` or `npm publishTest`, depending on which contracts have changed
 - Tag with the version number and push the git tags to GitHub to mark the release: `git push --tags`
