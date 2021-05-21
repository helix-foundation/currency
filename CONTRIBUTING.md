# Contributing to the Eco Currency

## Table of Contents
 - [Security](#security)
 - [Tooling](#tooling)

## Security
### Reporting Vulnerabilities
If you believe you've identified a security vulnerability in our contracts or
other software please email eng at eco dot io. This will help ensure your issue
gets attention promptly while also providing us an opportunity to fix any
problem before it's publicized. We'll make sure to publicly disclose the
vulnerability and credit you for finding it.

## Tooling
### The Test Suites
There are 4 key processes run by our CI tooling:
 - The lint/style rules
 - The main test suite
 - A full run of contract deployment onto ganache
 - An extra run of the test suite with coverage annotations

#### The Linter
We currently use `solhint` and `eslint` to check for common errors and ensure
consistent styling. You can run the full suite of lint rules (both linters)
with `npm run lint` from the project root.

##### Auto-formatting
We use `prettier` to automatically format our code. You can run the
autoformatter across the project by running `npm run format` from the project
root.

##### Linter Caveats
Some of our solhint rules are in need of maintenace, and the following warnings
tend to be emitted when they shouldn't be (Solidity code):
 - mixedcase
 - no-empty-blocks
 
We also exempt files that are imported from other projects from our style rules.
These files should be kept as close to their upstream originals as possible, and
should include both the URL they were retrieved from and any relevant license
information. This will help us keep up with upstream changes. (When possible,
include files using npm packages, but there are exceptions when the files need
to be modified or when upstream does not publish packages.)

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
Our coverage reporting toolchain works by inserting events into the solidity
code, and not all functionality is supported. To make this possible we use the
`run-cover.sh` script to run the coverage tools in an isolated environment and
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
