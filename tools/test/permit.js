const { signTypedData } = require('@metamask/eth-sig-util')
const { ethers } = require('ethers')

exports.createPermitMessageData = function createPermitMessageData(data) {
  const { name, address, chainId, owner, spender, value, nonce, deadline } =
    data

  const message = {
    owner,
    spender,
    value,
    nonce,
    deadline,
  }

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
  }
}

exports.permit = async function permit(
  token,
  owner,
  spender,
  chainId,
  amount,
  deadline = Math.floor(new Date().getTime() / 1000 + 86400 * 3000)
) {
  const nonce = await token.nonces(await owner.getAddress())

  const permitData = exports.createPermitMessageData({
    name: await token.name(),
    address: token.address,
    owner: await owner.getAddress(),
    spender: await spender.getAddress(),
    value: amount.toString(),
    nonce: nonce.toString(),
    chainId: chainId.toString(),
    deadline,
  })
  const sig = signTypedData({
    privateKey: Buffer.from(owner.privateKey.slice(2), 'hex'),
    data: permitData,
    version: 'V4',
  })
  const { v, r, s } = ethers.utils.splitSignature(sig)

  return token.permit(
    await owner.getAddress(),
    await spender.getAddress(),
    amount,
    deadline,
    v,
    r,
    s
  )
}

exports.createDelegatePermitMessageData =
  function createDelegatePermitMessageData(data) {
    const { name, address, chainId, delegator, delegatee, nonce, deadline } =
      data

    const message = {
      delegator,
      delegatee,
      nonce,
      deadline,
    }

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
        Delegate: [
          {
            name: 'delegator',
            type: 'address',
          },
          {
            name: 'delegatee',
            type: 'address',
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
      primaryType: 'Delegate',
      domain: {
        name,
        version: '1',
        chainId,
        verifyingContract: address,
      },
      message,
    }
  }

exports.delegateBySig = async function delegateBySig(
  token,
  delegator,
  delegatee,
  chainId,
  sender,
  {
    deadline = Math.floor(new Date().getTime() / 1000 + 86400 * 3000),
    nonce,
    signer = delegator,
  }
) {
  const nonceToUse =
    nonce === undefined
      ? await token.delegationNonces(await delegator.getAddress())
      : nonce

  const delegationData = exports.createDelegatePermitMessageData({
    name: await token.name(),
    address: token.address,
    delegator: await delegator.getAddress(),
    delegatee: await delegatee.getAddress(),
    nonce: nonceToUse.toString(),
    chainId: chainId.toString(),
    deadline,
  })
  const sig = signTypedData({
    privateKey: Buffer.from(signer.privateKey.slice(2), 'hex'),
    data: delegationData,
    version: 'V4',
  })
  const { v, r, s } = ethers.utils.splitSignature(sig)

  return token
    .connect(sender)
    .delegateBySig(
      await delegator.getAddress(),
      await delegatee.getAddress(),
      deadline,
      v,
      r,
      s,
      {
        gasLimit: 1000000,
      }
    )
}
