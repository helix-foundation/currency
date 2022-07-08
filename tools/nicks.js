#!/usr/bin/env node

const fs = require('fs');
const { Transaction } = require('ethereumjs-tx');
const EthereumUtil = require('ethereumjs-util');
const commandLineArgs = require('command-line-args');
const web3 = require('web3');

/* Constants used in ECDSA for generating sigatures.
 *
 * These values were taken from the ERC1820 specification. They're used as fixed
 * points to allow ECDSA to be run "in reverse", finding a transaction that
 * matches a chosen signature (provided as input to this code). The resulting
 * transaction has some corresponding private key, but the key is not known and
 * cannot be efficiently recovered from the parameters here so long as ECDSA
 * private keys cannot be efficiently recovered from ECDSA signatures.
 */
const ECDSA_V_VALUE = 27;
const ECDSA_R_VALUE = '0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798';

/* Command line argument definitions for when this file is used as a command
 * line application.
 */
const OPT_DEFS = [
  {
    name: 'outfile',
    alias: 'o',
    type: String,
    defaultValue: '-',
  },
  {
    name: 'contract',
    type: String,
    multiple: false,
    defaultOption: true,
  },
  {
    name: 'signature',
    alias: 's',
    type: String,
    multiple: false,
    defaultValue:
      '0x0abababababababababababababababababababababababababababababababa',
  },
  {
    name: 'paramdata',
    alias: 'd',
    type: String,
    multiple: false,
    defaultValue: '',
  },
  {
    name: 'gas',
    alias: 'g',
    type: Number,
    defaultValue: 800000,
  },
  {
    name: 'gasPrice',
    alias: 'G',
    type: Number,
    defaultValue: 100000000000,
  },
];

/** Create a transaction that executes the provided bytecode (presumed to be a
 * constructor) over the given parameter data (must be pre-encoded) and using
 * the given gas limit value such that the signature is the s parameter.
 *
 * @param {bytecode} The constructor bytecode (should start with "0x").
 * @param {s} The signature of the transaction (s of the r,s pair from ECDSA).
 * @param {gas} The gas limit to use when running the transaction.
 * @param {gasPrice} The price (in wei) to pay for gas.
 * @param {paramdata} The encoded parameter list to pass to the constructor. This
 *                    is just appended to the bytecode (less and 0x prefix) and
 *                    the result forms the data field of the transaction object.
 */
function generateTx(bytecode, s, gas, gasPrice, paramdata) {
  const tx = new Transaction({
    nonce: 0,
    gasPrice,
    gasLimit: gas,
    value: 0,
    data:
      bytecode + (web3.utils.isHexStrict(paramdata) ? paramdata.slice(2) : ''),
    v: ECDSA_V_VALUE,
    r: ECDSA_R_VALUE,
    s,
  });

  return tx;
}

/** Wrap a transaction object in some convenience fields to make it easier to
 * work with in external programs.
 *
 * @param A transaction object (presumably from `generateTx`)
 */
function decorateTx(tx) {
  const from = EthereumUtil.bufferToHex(tx.from);
  const json = {};

  // eslint-disable-next-line no-underscore-dangle
  tx._fields.forEach((k) => {
    json[k] = EthereumUtil.bufferToHex(tx[k]);
  });

  return {
    tx,
    json,
    from,
    to: EthereumUtil.bufferToHex(EthereumUtil.generateAddress(tx.from, tx.nonce)),
    raw: EthereumUtil.bufferToHex(tx.serialize()),
  };
}

/** Write provided transaction data to an output file. This is used when the
 * utility is run as a command-line application to format the output and write
 * it either to STDOUT or a given file.
 *
 * @param {tx} The transcation data to write (presumable from `generateTx`).
 *             Should be undecorated (see `decorateTx`).
 * @param {outFile} The path to the file to write the transaction data to. If
 *                  `outFile === '-'` data will be written to STDOUT.
 */
function createTxFile(tx, outFile) {
  const txjs = decorateTx(tx);
  txjs.tx = txjs.json;
  delete txjs.json;

  if (outFile === '-') {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(txjs, null, 2));
  } else {
    fs.writeFileSync(outFile, JSON.stringify(txjs));
  }
}

module.exports = {
  generateTx,
  createTxFile,
  decorateTx,
};

/** Primary entrypoint used when this file is execute as a command-line
 * application.
 */
function main() {
  const options = commandLineArgs(OPT_DEFS);

  const tx = generateTx(
    JSON.parse(fs.readFileSync(options.contract, 'utf8')).bytecode,
    options.signature,
    options.gas,
    options.gasPrice,
    options.paramdata,
  );
  createTxFile(tx, options.outfile);
}

/* Check to see if this file is running as a command-line application and if it
 * is call main.
 */
if (typeof require !== 'undefined' && require.main === module) {
  main(process.argv, process.argv.length);
}
