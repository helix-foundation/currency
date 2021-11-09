// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/presets/ERC20PresetMinterPauser.sol";
import "../../contracts/proxy/ForwardTarget.sol";

/** @title ERC20 test token */
contract Token20 is ForwardTarget, Ownable, ERC20PresetMinterPauser {
    constructor() public ERC20PresetMinterPauser("Twenty", "20") {}

    /** @notice Upgrade function */
    function upgrade(address _target) public {
        setImplementation(_target);
    }

    /** @notice Chained initializer */
    function initialize(address _self) public override onlyConstruction {
        super.initialize(_self);
        _setupRole(MINTER_ROLE, Token20(_self).owner());
    }
}
