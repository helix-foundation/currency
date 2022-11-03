# Contributing to the Eco Currency

## Table of Contents
 - [Security](#security)
 - [Tooling](#tooling)

## Security
### Reporting Vulnerabilities
If you believe you've identified a security vulnerability in Eco's contracts or
other software please submit to the Immunefi bounty (link coming soon) or join the Eco Association Discord (https://discord.eco.org) and tag or message an Eco Association team member. This will help ensure your issue
gets attention promptly while also providing the Eco community an opportunity to fix any
problem before it's publicized. The community will make sure to publicly disclose the
vulnerability and credit you for finding it.

## Tooling
### The Test Suites
There are 4 key processes run by Eco's CI tooling:
 - The lint/style rules
 - The main test suite
 - A full run of contract deployment onto ganache
 - An extra run of the test suite with coverage annotations

#### The Linter
`solhint` and `eslint` are used to check for common errors and ensure
consistent styling. You can run the full suite of lint rules (both linters)
with `npm run lint` from the project root.

##### Auto-formatting
`prettier` is used to automatically format the code. You can run the
autoformatter across the project by running `npm run format` from the project
root.

##### Disabling Linter Rules
When a linter rule needs to be disabled it should be disabled for the smallest
region of code possible. Prefer single-line exceptions
(`solhint-disable-next-line`) for specific rules
(eg `security/no-inline-assembly`), then block disables for specific
rules. Do not disable rules for entire files, or disable all rules for regions
or files, unless absolutely necessary.

#### The main test suite
You can run the main test suite with `npm test`. This should run the tests and
print a summary of results with details of any failures. All tests will be run,
including both Solidity and JavaScript.

Any new tests should be added in the `test/` directory following the existing
directory structure as best as possible.

#### Contract deployment tests
The CI tool will boot a ganache instance and run `tools/eco.js` against it.
You can simulate this locally by starting `ganache-cli` and running
`node tools/deploy`, or using docker:
```
docker build -t currency .
docker run currency
```

#### Coverage reporting
Eco's coverage reporting toolchain works by inserting events into the solidity
code, and not all functionality is supported. To make this possible the
`run-cover.sh` script is used to run the coverage tools in an isolated environment and
apply some code changes to account for deficienies.

You can run the coverage suite with `npm run coverage`. It produces two coverage
reports, one for Solidity and one for JavaScript. The merged reports should
automatically open in your browser.

## Packaging and Releasing
Before releasing:
 - Verify that you have all the latest dependencies: `npm install`
 - Verify that the linter runs cleanly: `npm run lint`
 - Verify that the tests pass: `npm test`

To release:
 - Bump the version using `npm version`. Make major releases when the ABI has
   changed.
 - Run `npm publish`
 - Push the git tags to GitHub to mark the release: `git push --tags`
