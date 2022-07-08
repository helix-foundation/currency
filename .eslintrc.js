module.exports = {
  extends: "airbnb-base",
  plugins: [
    "@typescript-eslint",
    "mocha",
    "chai-friendly"
  ],
  parser: "@typescript-eslint/parser",
  rules: {
    "no-unused-expressions": 0,
    "no-plusplus": 0,
    "prefer-destructuring": 0,
    "mocha/no-exclusive-tests": "error",
    "chai-friendly/no-unused-expressions": 2,
    "no-multiple-empty-lines": [ "error", {
      max: 1,
      maxEOF: 0,
      maxBOF: 0
    }]
  },
  globals: {
    BigInt: "readonly",
    web3: "readonly",
    artifacts: "readonly",
    contract: "readonly",
    assert: "readonly"
  }
}
