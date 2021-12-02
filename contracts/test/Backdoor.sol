// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../../contracts/governance/Proposal.sol";
import "../../contracts/policy/Policy.sol";
import "../../contracts/policy/PolicyInit.sol";
import "../../contracts/proxy/ForwardProxy.sol";
import "../../contracts/deploy/EcoInitializable.sol";
import "../../contracts/deploy/EcoBootstrap.sol";
import "../../contracts/governance/TrustedNodes.sol";
import "./FakePolicy.sol";

/** @title Backdoor
 *
 * A dummy contract used in tests.
 */
contract Backdoor is Policed {
    constructor(address _policy) Policed(_policy) {}
}

/** @title Empty
 *
 * A contract with one attribute.
 */
contract Empty {
    /** A publicly visible number.
     */
    uint256 public number;

    /** Construct a new contract.
     *
     * @param _number The value to set the number attribute to.
     */
    constructor(uint256 _number) {
        number = _number;
    }
}

/** @title BackdoorProposal
 *
 * A proposal to institute a policy. Probably something that shouldn't pass,
 * used to test enacting proposals, including doing bad things.
 */
contract BackdoorProposal is Policy, Proposal {
    /** The name of the proposal.
     */
    function name() public pure override returns (string memory) {
        return "Backdoor";
    }

    /** A description of what the proposal does.
     */
    function description() public pure override returns (string memory) {
        return "Install a nasty backdoor";
    }

    /** A URL for more information.
     */
    function url() public pure override returns (string memory) {
        return "http://something";
    }

    /** Enact the proposal.
     */
    function enacted(address) public override {
        setInterfaceImplementation(
            "Backdoor",
            address(new Backdoor(address(this)))
        );
        setters.push(keccak256(abi.encodePacked("Backdoor")));
    }
}

/** @title SampleHandler
 *
 * A policy hanlder used for testing policy adoption.
 */
contract SampleHandler is Policed {
    /** The ID of this handler, so we can tell which one was adopted when there
     * are multiple instances.
     */
    uint256 public id;

    constructor(address _policy, uint256 _id) Policed(_policy) {
        id = _id;
    }
}

/** @title SampleProposal
 *
 * A proposal used for testing proposal adoption.
 */
contract SampleProposal is Policy, Proposal {
    /** The ID to assign to the adopted handler.
     */
    uint256 public id;

    constructor(uint256 _id) {
        id = _id;
    }

    /** The name of the proposal.
     */
    function name() public pure override returns (string memory) {
        return "Sample";
    }

    /** A description of what the proposal does.
     */
    function description() public pure override returns (string memory) {
        return "A trackalbe sample";
    }

    /** A URL for more information.
     */
    function url() public pure override returns (string memory) {
        return "http://something";
    }

    /** Enact the proposal.
     */
    function enacted(address _self) public override {
        setInterfaceImplementation(
            "TestSample",
            address(
                new SampleHandler(address(this), SampleProposal(_self).id())
            )
        );
    }
}

/** @title PolicyTest
 * Extension of Policy used just for testing.
 */
contract PolicyTest is FakePolicy {
    /** Test the enacting of a given proposal.
     *
     * @param _delegate The proposal to enact.
     */
    function testDirectVote(address _delegate) external {
        (bool success, ) = _delegate.delegatecall(
            abi.encodeWithSelector(
                bytes4(keccak256("enacted(address)")),
                _delegate
            )
        );
        require(success, "Call failed");
    }

    /** Test the setting of an interface implementation address.
     *
     * @param _key The interface name.
     * @param _value The address of the implementation.
     */
    function testDirectSet(string calldata _key, address _value) external {
        setInterfaceImplementation(_key, _value);
    }

    /** Test trusting an address.
     *
     * @param _registry The trust registry to add the address to.
     * @param _address The address to trust.
     */
    function testTrust(TrustedNodes _registry, address _address) external {
        _registry.trust(_address);
    }

    /** Test distrusting an address.
     *
     * @param _registry The trust registry to remove the address from.
     * @param _address The address to distrust.
     */
    function testDistrust(TrustedNodes _registry, address _address) external {
        _registry.distrust(_address);
    }
}
