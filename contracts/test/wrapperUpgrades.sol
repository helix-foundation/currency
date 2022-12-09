// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";
import "../governance/community/proposals/Proposal.sol";

contract Wrapper {
    event HereIAm(uint256 index);

    function whoAmI() external returns (uint256) {
        emit HereIAm(1);
        return 1;
    }
}

contract UpgradedWrapper {
    event HereIAm(uint256 index);

    function whoAmI() external returns (uint256) {
        emit HereIAm(2);
        return 2;
    }
}

contract OZProxy is TransparentUpgradeableProxy {
    constructor(address _wrapper, address _policy)
        TransparentUpgradeableProxy(_wrapper, _policy, bytes(""))
    {}

    function whoAmI() external ifAdmin returns (uint256) {
        return 3;
    }

    // this kind of function is unsafe as it can clash with the proxied functionality
    function whoAmINonAdmin() external pure returns (uint256) {
        return 4;
    }
}

contract WrapperUpgradeProposal is Proposal {
    UpgradedWrapper public immutable upgradedWrapper;

    OZProxy public immutable ozProxy;

    constructor(UpgradedWrapper _upgradedWrapper, OZProxy _ozProxy) {
        upgradedWrapper = _upgradedWrapper;
        ozProxy = _ozProxy;
    }

    function name() external pure returns (string memory) {
        return "I am the wrapper upgrade proposal";
    }

    function description() external pure returns (string memory) {
        return "I upgrade the wrapper to say it is poodled";
    }

    function url() external pure returns (string memory) {
        return "www.wrapper-upgrayedd.com";
    }

    function enacted(address) external {
        ozProxy.upgradeTo(address(upgradedWrapper));
    }
}
