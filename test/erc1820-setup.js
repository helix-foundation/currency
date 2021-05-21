const { singletons } = require('@openzeppelin/test-helpers');

before(async () => {
  const [account] = await web3.eth.getAccounts();
  await singletons.ERC1820Registry(account);
});
