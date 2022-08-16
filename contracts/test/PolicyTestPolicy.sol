// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../../contracts/policy/ERC1820Client.sol";
import "@openzeppelin/contracts/utils/introspection/IERC1820Implementer.sol";
import "../../contracts/policy/PolicedUtils.sol";
import "../../contracts/policy/Policy.sol";
import "../../contracts/proxy/ForwardProxy.sol";

/** @title PolicyTestPolicy
 * A policy object used for testing policy actions.
 */
contract PolicyTestPolicy is Policy {
    /** Set the interface implementation for a given interface to the given
     * address.
     *
     * @param _label The interface name.
     * @param _impl The interface implementation.
     */
    function setLabel(string calldata _label, address _impl) external {
        ERC1820REGISTRY.setInterfaceImplementer(
            address(this),
            keccak256(abi.encodePacked(_label)),
            _impl
        );
    }

    /** Set the expected interface setter for a given policedutils to the given
     * address.
     *
     * @param _policedUtils The interface name.
     * @param _setter The interface implementation.
     */
    function setExpected(PolicedUtils _policedUtils, address _setter) external {
        _policedUtils.setExpectedInterfaceSet(_setter);
    }

    /** Force the execution of a function by the provided policed contract.
     *
     * @param _pol The contract to act as.
     * @param _action The act on.
     */
    function force(Policed _pol, address _action) public {
        _pol.policyCommand(address(_action), abi.encodeWithSignature("doit()"));
    }
}

/** @title FakeCommandAction
 * Object policy will execute, which in turn uses policy's privileges
 */
contract FakeCommandAction is Policy {
    /** The address of the contract being managed by this policy.
     */
    Policed public policed;

    /** The address of the contract providing the code to execute.
     */
    address public action;

    /** Construct a policy that enacts the `doit` code provided by the action
     * address in the context of the policed address.
     *
     * @param _policed The contract being policed.
     * @param _action The contract providing the code to execute.
     */
    constructor(address _policed, address _action) {
        policed = Policed(_policed);
        action = _action;
    }

    /** Execute the code in the `action` contract.
     *
     * This is executed in the storage context of the policed contract.
     *
     * @param _self The address of the policy contract.
     */
    function enacted(address _self) public {
        FakeCommandAction _fake = FakeCommandAction(_self);
        _fake.policed().policyCommand(
            _fake.action(),
            abi.encodeWithSignature("doit()")
        );
    }
}

/** @title FakeCommander
 * Object that is allowed by policy to take its role
 */
contract FakeCommander is PolicedUtils {
    constructor(Policy _policy) PolicedUtils(_policy) {}

    // public function to check each of the identifiers
    function GET_ID_FAUCET() external pure returns (bytes32) {
        return ID_FAUCET;
    }

    function GET_ID_ECO() external pure returns (bytes32) {
        return ID_ECO;
    }

    function GET_ID_CLEANUP() external pure returns (bytes32) {
        return ID_CLEANUP;
    }

    function GET_ID_TIMED_POLICIES() external pure returns (bytes32) {
        return ID_TIMED_POLICIES;
    }

    function GET_ID_TRUSTED_NODES() external pure returns (bytes32) {
        return ID_TRUSTED_NODES;
    }

    function GET_ID_POLICY_PROPOSALS() external pure returns (bytes32) {
        return ID_POLICY_PROPOSALS;
    }

    function GET_ID_POLICY_VOTES() external pure returns (bytes32) {
        return ID_POLICY_VOTES;
    }

    function GET_ID_CURRENCY_GOVERNANCE() external pure returns (bytes32) {
        return ID_CURRENCY_GOVERNANCE;
    }

    function GET_ID_CURRENCY_TIMER() external pure returns (bytes32) {
        return ID_CURRENCY_TIMER;
    }

    function GET_ID_ECOX() external pure returns (bytes32) {
        return ID_ECOX;
    }

    function GET_ID_ECOXSTAKING() external pure returns (bytes32) {
        return ID_ECOXSTAKING;
    }

    /** Run a FakeCommandAction in the context of the root policy object.
     *
     * @param _policed The address of the policed contract being acted on.
     * @param _action The action to enact.
     */
    function command(address _policed, address _action) public {
        policy.internalCommand(
            address(new FakeCommandAction(_policed, _action)),
            keccak256("Commander")
        );
    }
}

/** @title DummyPoliced
 * Object that will be manipulated
 */
contract DummyPoliced is Policed {
    /** A value that will be changed by a policy action.
     */
    uint256 public value = 1;

    constructor(Policy _policy) Policed(_policy) {}

    /** Initialize a contract as a clone/proxy of DummyPolicedUtils.
     *
     * @param _self The address being cloned.
     */
    function initialize(address _self) public override onlyConstruction {
        super.initialize(_self);
        value = DummyPoliced(_self).value();
    }
}

/** @title DummyPolicedUtils
 * Object that will be manipulated
 */
contract DummyPolicedUtils is PolicedUtils {
    /** A value that will be changed by a policy action.
     */
    uint256 public value = 1;

    /** An address value used to test the cloning functionality.
     */
    address public c;

    constructor(Policy _policy) PolicedUtils(_policy) {}

    modifier onlyInflation() {
        require(
            msg.sender == policyFor(ID_CURRENCY_GOVERNANCE),
            "Only the inflation contract may call this function."
        );
        _;
    }

    /** Set the value to two, to confirm that the contract itself can do so when
     * asked by a contract holding the Inflation role.
     */
    function modifierTest() public onlyInflation {
        value = 2;
    }

    /** Initialize a contract as a clone/proxy of DummyPolicedUtils.
     *
     * @param _self The address being cloned.
     */
    function initialize(address _self) public override onlyConstruction {
        super.initialize(_self);
        value = DummyPolicedUtils(_self).value();
    }

    /** Create a clone of this contract.
     */
    function cloneMe() public {
        c = clone();
    }
}

/** @title DummyInflation
 * Object that will act as inflation to test modifier
 */
contract DummyInflation is PolicedUtils {
    constructor(Policy _policy) PolicedUtils(_policy) {}

    /** Ask a policed contract to modify itself, verifying that having the
     * Inflation role is sufficient.
     */
    function callModifierTest() public {
        DummyPolicedUtils(policyFor(keccak256(abi.encodePacked("Dummy"))))
            .modifierTest();
    }
}

/** @title Policer
 * This will be delegatecall'd by DummyPolicedUtils
 * Inherits from DummyPolicedUtils to have easy access to storage layout
 */
contract Policer is DummyPolicedUtils {
    constructor(Policy _policy) DummyPolicedUtils(_policy) {}

    /** Set the value to 3. This is intended as a test policy action to be run
     * in the context of some other contract.
     */
    function doit() public onlyPolicy {
        value = 3;
    }
}

/** @title RevertingAction
 *
 * This acts as an action that always reverts for FakeCommandAction to execute.
 * It's used for testing the behaviour of Policy.internalCommand when the
 * delegatecall results in a revert.
 */
contract RevertingAction is PolicedUtils {
    constructor(Policy _policy) PolicedUtils(_policy) {}

    function doit() public view onlyPolicy {
        revert("failing as it should");
    }
}

/** @title PolicyForAll
 * A contract that acts as an interface implementer (policy) for all roles.
 */
contract PolicyForAll is IERC1820Implementer {
    bytes32 internal constant ERC1820_ACCEPT_MAGIC =
        keccak256(abi.encodePacked("ERC1820_ACCEPT_MAGIC"));

    /** ERC1820 permissioning interface
     */
    function canImplementInterfaceForAddress(bytes32, address)
        external
        pure
        override
        returns (bytes32)
    {
        return ERC1820_ACCEPT_MAGIC;
    }
}

/** @title RegistrationAttemptContract
 *
 * Attempts to register the address passed to the construcor as an ERC1820
 * interface implementer for the identifier given at the same time.
 */
contract RegistrationAttemptContract is ERC1820Client {
    address public implementer;
    string public identifier;

    constructor(address _implementer, string memory _identifier) {
        implementer = _implementer;
        identifier = _identifier;
    }

    function register() external {
        ERC1820REGISTRY.setInterfaceImplementer(
            address(this),
            keccak256(abi.encodePacked(identifier)),
            implementer
        );
    }
}
