// 123 is id of coverage network defined in truffle-config.js
exports.isCoverage = async () => (await web3.eth.net.getId()) === 123;
