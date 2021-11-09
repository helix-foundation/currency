// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/utils/introspection/IERC1820Registry.sol";
import "../proxy/ForwardTarget.sol";
import "./ERC1820Client.sol";

/** @title The policy contract that oversees other contracts
 *
 * Policy contracts provide a mechanism for building pluggable (after deploy)
 * governance systems for other contracts.
 */
contract Policy is ForwardTarget, ERC1820Client {
    bytes32[] public setters;

    /** Remove the specified role from the contract calling this function.
     * This is for cleanup only, so if another contract has taken the
     * role, this does nothing.
     *
     * @param _interfaceIdentifierHash The interface identifier to remove from
     *                                 the registry.
     */
    function removeSelf(bytes32 _interfaceIdentifierHash) external {
        address old = ERC1820REGISTRY.getInterfaceImplementer(
            address(this),
            _interfaceIdentifierHash
        );

        if (old == msg.sender) {
            ERC1820REGISTRY.setInterfaceImplementer(
                address(this),
                _interfaceIdentifierHash,
                address(0)
            );
        }
    }

    /** Find the policy contract for a particular identifier.
     *
     * @param _interfaceIdentifierHash The hash of the interface identifier
     *                                 look up.
     */
    function policyFor(bytes32 _interfaceIdentifierHash)
        public
        view
        returns (address)
    {
        return
            ERC1820REGISTRY.getInterfaceImplementer(
                address(this),
                _interfaceIdentifierHash
            );
    }

    /** Enact the code of one of the governance contracts.
     *
     * @param _delegate The contract code to delegate execution to.
     */
    function internalCommand(address _delegate) public {
        /*
         * Amount of setters is predefined by ECO and is reasonable
         * from gas consumption standpoint. Change to amount of setter
         * Have to go through reviewed policy proposal framework
         */
        for (uint256 i = 0; i < setters.length; ++i) {
            if (
                ERC1820REGISTRY.getInterfaceImplementer(
                    address(this),
                    setters[i]
                ) == msg.sender
            ) {
                // solhint-disable-next-line avoid-low-level-calls
                (bool _success, ) = _delegate.delegatecall(
                    abi.encodeWithSignature("enacted(address)", _delegate)
                );
                require(_success, "Command failed during delegatecall");
                return;
            }
        }
        require(
            false,
            "Failed to find an appropriate permission for the delegate address."
        );
    }

    /** Initialize the contract (replaces constructor)
     *
     * Policy contracts are often the targets of proxies, and therefore need a
     * mechanism to initialize internal state when adopted by a new proxy. This
     * replaces the constructor.
     *
     * @param _self The address of the original contract deployment (as opposed
     *              to the address of the proxy contract, which takes the place
     *              of `this`).
     */
    function initialize(address _self)
        public
        virtual
        override
        onlyConstruction
    {
        super.initialize(_self);
    }
}
