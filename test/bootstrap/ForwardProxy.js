const SampleForward = artifacts.require('SampleForward');
const SumVerifier = artifacts.require('SumVerifier');
const ForwardProxy = artifacts.require('ForwardProxy');

contract('ForwardProxy [@group=2]', (accounts) => {
  let targetContract;
  let proxy;

  beforeEach(async () => {
    targetContract = await SampleForward.new();
    proxy = await SampleForward.at(
      (await ForwardProxy.new(targetContract.address)).address,
    );
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

  compare(
    'increments',
    async (obj) => obj.increment(),
    objectValue,
  );

  compare(
    'transfers',
    async (obj) => obj.sendTransaction({ from: accounts[0], value: 1000 }),
    objectValue,
  );

  compare(
    'sums',
    async (obj) => obj.sums(1, 2, 3, 4, 5, 6),
    objectValue,
  );

  compare(
    'retsums',
    undefined,
    async (obj) => obj.retsums(),
  );

  compare(
    'increments + returns',
    async (obj) => (await SumVerifier.new()).sumverify(obj.address),
    objectValue,
  );

  compare(
    'intcall',
    async (obj) => obj.intcall(100),
    objectValue,
  );

  compare(
    'extcall',
    async (obj) => obj.extcall(100),
    objectValue,
  );
});
