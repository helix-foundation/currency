/* eslint-disable no-console, no-await-in-loop, no-restricted-syntax */
/* eslint-disable import/no-extraneous-dependencies */

const util = require('util')
const { sprintf } = require('sprintf-js')

exports.trace = async (promise, verbose = false) => {
  const s = util.promisify(web3.currentProvider.send)
  const { toBN } = web3.utils

  const before = await web3.eth.getBlockNumber()
  try {
    return await promise
  } finally {
    const after = await web3.eth.getBlockNumber()
    for (let bnum = before + 1; bnum <= after; bnum += 1) {
      const block = await web3.eth.getBlock(bnum)

      if (block.number === before) {
        console.log('No transactions performed')
      }

      console.log(
        `Tracing block ${block.hash} (${block.number}) ${block.gasUsed}/${block.gasLimit}`
      )

      for (const tid of block.transactions) {
        const transaction = await web3.eth.getTransactionReceipt(tid)
        console.log(`Tracing transaction ${tid}`)
        const trace = await s({
          jsonrpc: '2.0',
          method: 'debug_traceTransaction',
          params: [
            tid,
            { disableStorage: true, disableMemory: true, disableStack: false },
          ],
          id: 99,
        })
        if (verbose) {
          console.log(block)
          console.log(transaction)
          console.log(trace)
        }

        const addrs = []
        addrs[0] = transaction.to

        for (let i = 0; i < trace.result.structLogs.length; i += 1) {
          const prev = trace.result.structLogs[i - 1]
          const x = trace.result.structLogs[i]
          let addr = ''

          if (prev && prev.depth === x.depth - 1) {
            const { stack } = prev
            addrs[x.depth] = `0x${toBN(stack[stack.length - 2]).toJSON()}`
          }

          if (!prev || prev.depth !== x.depth) {
            addr = addrs[x.depth]
          }

          console.log(
            sprintf(
              '%-20s %10d %6d %s',
              ' '.repeat(x.depth) + x.op,
              x.gas,
              x.pc,
              addr
            )
          )
          if (verbose) {
            console.log(x)
          }
        }
      }
    }
  }
}
