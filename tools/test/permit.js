const { signTypedData } = require('@metamask/eth-sig-util');
const { ethers } = require('ethers');

exports.createPermitMessageData = function createPermitMessageData(data) {
  const {
    name,
    address,
    chainId,
    owner,
    spender,
    value,
    nonce,
    deadline,
  } = data;

  const message = {
    owner,
    spender,
    value,
    nonce,
    deadline,
  };

  return {
    types: {
      EIP712Domain: [
        {
          name: 'name',
          type: 'string',
        },
        {
          name: 'version',
          type: 'string',
        },
        {
          name: 'chainId',
          type: 'uint256',
        },
        {
          name: 'verifyingContract',
          type: 'address',
        },
      ],
      Permit: [
        {
          name: 'owner',
          type: 'address',
        },
        {
          name: 'spender',
          type: 'address',
        },
        {
          name: 'value',
          type: 'uint256',
        },
        {
          name: 'nonce',
          type: 'uint256',
        },
        {
          name: 'deadline',
          type: 'uint256',
        },
      ],
    },
    primaryType: 'Permit',
    domain: {
      name,
      version: '1',
      chainId,
      verifyingContract: address,
    },
    message,
  };
};

exports.permit = async function permit(
  token,
  owner,
  spender,
  chainId,
  amount,
  deadline = Math.floor(new Date().getTime() / 1000 + (86400 * 3000)),
) {
  const nonce = await token.nonces(await owner.getAddress());

  const permitData = exports.createPermitMessageData({
    name: await token.name(),
    address: token.address,
    owner: await owner.getAddress(),
    spender: await spender.getAddress(),
    value: amount.toString(),
    nonce: nonce.toString(),
    chainId: chainId.toString(),
    deadline,
  });
  const sig = signTypedData({
    privateKey: Buffer.from(owner.privateKey.slice(2), 'hex'),
    data: permitData,
    version: 'V4',
  });
  const { v, r, s } = ethers.utils.splitSignature(sig);

  return token.permit(
    await owner.getAddress(),
    await spender.getAddress(),
    amount,
    deadline,
    v,
    r,
    s,
  );
};
