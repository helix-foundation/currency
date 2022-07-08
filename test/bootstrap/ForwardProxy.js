const { ethers } = require('hardhat');
const { assert } = require('chai');
const { loadFixture } = require('ethereum-waffle');

describe('ForwardProxy [@group=2]', () => {
  const fixture = async () => {
    const targetContract = await (await ethers.getContractFactory('SampleForward')).deploy();
    const proxy = await ethers.getContractAt(
      'SampleForward',
      (
        await (await ethers.getContractFactory('ForwardProxy')).deploy(targetContract.address)
      ).address,
    );

    const sumVerifier = await (await ethers.getContractFactory('SumVerifier')).deploy();

    return {
      accounts: await ethers.getSigners(),
      targetContract,
      proxy,
      sumVerifier,
    };
  };

  let targetContract;
  let proxy;
  let sumVerifier;
  let accounts;

  beforeEach(async () => {
    ({
      accounts, targetContract, proxy, sumVerifier,
    } = await loadFixture(fixture));
  });

  function compare(description, action, verify) {
    it(description, async () => {
      if (action) {
        for (let i = 0; i < 3; i += 1) {
          /* eslint-disable no-await-in-loop, no-unused-vars */
          const a = await action(targetContract);
          const b = await action(proxy);
          /* eslint-enable no-await-in-loop, no-unused-vars */
          /* Logging used to analyze gas costs.
          console.log(JSON.stringify(a.receipt.gasUsed),
            JSON.stringify(b.receipt.gasUsed),
            b.receipt.gasUsed - a.receipt.gasUsed);
          */
        }
      }
      if (verify) {
        const a = await verify(targetContract);
        const b = await verify(proxy);
        assert.deepEqual(a, b);
      }
    });
  }

  const objectValue = async (obj) => obj.value();

  compare('increments', async (obj) => obj.increment(), objectValue);

  compare(
    'transfers',
    async (obj) => accounts[0].sendTransaction({ to: obj.address, value: 1000 }),
    objectValue,
  );

  compare('sums', async (obj) => obj.sums(1, 2, 3, 4, 5, 6), objectValue);

  compare('retsums', undefined, async (obj) => obj.retsums());

  compare('increments + returns', async (obj) => sumVerifier.sumverify(obj.address), objectValue);

  compare('intcall', async (obj) => obj.intcall(100), objectValue);

  compare('extcall', async (obj) => obj.extcall(100), objectValue);
});
