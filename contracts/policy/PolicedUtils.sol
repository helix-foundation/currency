// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "@openzeppelin/contracts/introspection/IERC1820Registry.sol";
// TODO: revert to @optionality.io/clone-factory/contracts/CloneFactory.sol
// as soon as that repo is 0.5 compatible
import "../clone/CloneFactory.sol";
import "./Policed.sol";
import "./ERC1820Client.sol";

/** @title Utility providing helpers for policed contracts
 *
 * See documentation for Policed to understand what a policed contract is.
 */
contract PolicedUtils is Policed, CloneFactory, ERC1820Client {
    // keccak256("Faucet")
    bytes32 public constant ID_FAUCET =
        0x93824b3fb91a9a455e79c6bb5ad7a2acaedbf7fea80464761d7d892aa7853d5e;

    // keccak256("ERC20Token")
    bytes32 public constant ID_ERC20TOKEN =
        0xaea199e31a596269b42cdafd93407f14436db6e4cad65417994c2eb37381e05a;

    // keccak256("ERC777Token")
    bytes32 public constant ID_ERC777TOKEN =
        0xac7fbab5f54a3ca8194167523c6753bfeb96a445279294b6125b68cce2177054;

    // keccak256("BalanceStore")
    bytes32 public constant ID_BALANCESTORE =
        0x10eb0fd2529484be37462efd7e95e7db98bdb78b6713e8e220ee2a5175707db6;

    // keccak256("ContractCleanup")
    bytes32 public constant ID_CLEANUP =
        0x1b74fc1bde1302df3d2e3f68112fbbf0ccbb287053160042e61d82481bb6e178;

    // keccak256("TimedPolicies")
    bytes32 public constant ID_TIMED_POLICIES =
        0xae30bfb87dec2bd0c16be9790f95842d84f58dc70b0a8f6ed22e9556176a7b19;

    // keccak256("TrustedNodes")
    bytes32 public constant ID_TRUSTED_NODES =
        0x0e3d3f2b74f96e5fd24f23acf8b4b352d4e1d0d0ed45271f4e44aa64f98b2284;

    // keccak256("PolicyProposals")
    bytes32 public constant ID_POLICY_PROPOSALS =
        0x331e3a11698d428947c09d6cfecc92b2ccbc4a527e4e795d850152babfaff37a;

    // keccak256("PolicyVotes")
    bytes32 public constant ID_POLICY_VOTES =
        0x65474dbc3934a157baaaa893dea8c73453f0cc9c47a4f857047e8f0c8b54888f;

    // keccak256("EcoLabs")
    bytes32 public constant ID_ECO_LABS =
        0x5f9af78bb9888a64eda8686df832be8039fe2a08c41dd13a3e0a34cadf714265;

    // keccak256("CurrencyGovernance")
    bytes32 public constant ID_CURRENCY_GOVERNANCE =
        0xe4ee44a5d338a8b2452cc9552ec014656668eaacb55683101b7e1c2b167e5225;

    // keccak256("CurrencyTimer")
    bytes32 public constant ID_CURRENCY_TIMER =
        0xe01e721169f17f30d0c130781195719ceba11f26f44578668ffd8462c7c1ebe9;

    // keccak256("ECOx")
    bytes32 public constant ID_ECOX =
        0xe10ab6c94f1da69921a0ca1c1b96b4fc339699153931c9bfd565e91f44c19b0b;

    // keccak256("ECOxLockup")
    bytes32 public constant ID_ECOXLOCKUP =
        0xdf849ae066ce5ea7a01105f3db8539dd51779b4506741de6731ef32f7f4daa18;

    address internal expectedInterfaceSet;

    constructor(address _policy) public Policed(_policy) {
        ERC1820REGISTRY.setManager(address(this), _policy);
    }

    /** ERC1820 permissioning interface
     *
     * @param _addr The address of the contract we might act on behalf of.
     */
    function canImplementInterfaceForAddress(bytes32, address _addr)
        external
        view
        override
        returns (bytes32)
    {
        require(
            _addr == policy || _addr == expectedInterfaceSet,
            "Only the policy or interface contract may call this function."
        );
        return ERC1820_ACCEPT_MAGIC;
    }

    /** Initialize the contract (replaces constructor)
     *
     * See documentation for Policed for an explanation.
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
        ERC1820REGISTRY.setManager(address(this), policy);
    }

    /** Set the expected interface set
     */
    function setExpectedInterfaceSet(address _addr) public onlyPolicy {
        expectedInterfaceSet = _addr;
    }

    /** Create a clone of this contract
     *
     * Creates a clone of this contract by instantiating a proxy at a new
     * address and initializing it based on the current contract. Uses
     * optionality.io's CloneFactory functionality.
     *
     * This is used to save gas cost during deployments. Rather than including
     * the full contract code in every contract that might instantiate it we
     * can deploy it once and reference the location it was deployed to. Then
     * calls to clone() can be used to create instances as needed without
     * increasing the code size of the instantiating contract.
     */
    function clone() public virtual returns (address) {
        address _clone = createClone(address(this));
        PolicedUtils(_clone).initialize(address(this));
        return _clone;
    }

    /** Find the policy contract for a particular identifier.
     *
     * This is intended as a helper function for contracts that are managed by
     * a policy framework. A typical use case is checking if the address calling
     * a function is the authorized policy for a particular action.
     *
     * eg:
     * ```
     * function doSomethingPrivileged() public {
     *   require(
     *     _msgSender() == policyFor(keccak256("PolicyForDoingPrivilegedThing")),
     *     "Only the privileged contract may call this"
     *     );
     * }
     * ```
     */
    function policyFor(bytes32 _id) internal view returns (address) {
        return ERC1820REGISTRY.getInterfaceImplementer(policy, _id);
    }
}
