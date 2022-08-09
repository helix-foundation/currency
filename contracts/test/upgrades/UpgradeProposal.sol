// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../../../contracts/policy/Policy.sol";
import "../../../contracts/policy/Policed.sol";
import "../../../contracts/proxy/ForwardTarget.sol";
import "../../../contracts/governance/community/Proposal.sol";

/** @title MakeTrustedPoodle
 * A proposal to add a new function to TrustedNodes.sol
 */
contract UpgradeProposal is Policy, Proposal {
    /** The address of the updated TrustedNodes contract
     */
    address public immutable newTrustedNodes;
    address public immutable newEco;
    address public immutable newTimedPolicies;
    address public immutable newPolicyProposals;
    address public immutable newPolicyVotes;
    address public immutable newCurrencyGovernance;
    address public immutable newCurrencyTimer;
    address public immutable newEcoxStaking;

    // keccak256("Faucet")
    bytes32 internal constant ID_FAUCET =
        0x93824b3fb91a9a455e79c6bb5ad7a2acaedbf7fea80464761d7d892aa7853d5e;

    // keccak256("ECO")
    bytes32 internal constant ID_ECO =
        0xe0391e627a5766ef56109c7c98e0542c6e96a116720d7c626119be5b67e1813d;

    // keccak256("ContractCleanup")
    bytes32 internal constant ID_CLEANUP =
        0x1b74fc1bde1302df3d2e3f68112fbbf0ccbb287053160042e61d82481bb6e178;

    // keccak256("TimedPolicies")
    bytes32 internal constant ID_TIMED_POLICIES =
        0xae30bfb87dec2bd0c16be9790f95842d84f58dc70b0a8f6ed22e9556176a7b19;

    // keccak256("TrustedNodes")
    bytes32 internal constant ID_TRUSTED_NODES =
        0x0e3d3f2b74f96e5fd24f23acf8b4b352d4e1d0d0ed45271f4e44aa64f98b2284;

    // keccak256("PolicyProposals")
    bytes32 internal constant ID_POLICY_PROPOSALS =
        0x331e3a11698d428947c09d6cfecc92b2ccbc4a527e4e795d850152babfaff37a;

    // keccak256("PolicyVotes")
    bytes32 internal constant ID_POLICY_VOTES =
        0x65474dbc3934a157baaaa893dea8c73453f0cc9c47a4f857047e8f0c8b54888f;

    // keccak256("CurrencyGovernance")
    bytes32 internal constant ID_CURRENCY_GOVERNANCE =
        0xe4ee44a5d338a8b2452cc9552ec014656668eaacb55683101b7e1c2b167e5225;

    // keccak256("CurrencyTimer")
    bytes32 internal constant ID_CURRENCY_TIMER =
        0xe01e721169f17f30d0c130781195719ceba11f26f44578668ffd8462c7c1ebe9;

    // keccak256("ECOxStaking")
    bytes32 internal constant ID_ECOXSTAKING =
        0x3776fba25fb0e7d0848ec503ec48569754f9d46736d6ace08b6eed818399d8e1;

    /** The address of the updating contract
     */
    address public immutable implementationUpdatingTarget;

    // The ID hash for the TrustedNodes contract
    bytes32 public constant trustedNodesId =
        keccak256(abi.encodePacked("TrustedNodes"));
    

    /** Instantiate a new proposal.
     *
     * @param _newTrustedNodes The address of the updated TrustedNodes contract
     */
    constructor(
        address _newTrustedNodes, 
        address _newEco, 
        address _newTimedPolicies, 
        address _newPolicyProposals, 
        address _newPolicyVotes, 
        address _newCurrencyGovernance, 
        address _newCurrencyTimer, 
        address _newEcoxStaking, 
        address _implementationUpdatingTarget
    ) {
        newTrustedNodes = _newTrustedNodes;
        newEco = _newEco;
        newTimedPolicies = _newTimedPolicies;
        newPolicyProposals = _newPolicyProposals;
        newPolicyVotes = _newPolicyVotes;
        newCurrencyGovernance = _newCurrencyGovernance;
        newCurrencyTimer = _newCurrencyTimer;
        newEcoxStaking = _newEcoxStaking;

        implementationUpdatingTarget = _implementationUpdatingTarget;
    }

    /** The name of the proposal.
     */
    function name() public pure override returns (string memory) {
        return "Upgrades Galore";
    }

    /** A description of what the proposal does.
     */
    function description() public pure override returns (string memory) {
        return "Whole lotta upgrades";
    }

    /** A URL where more details can be found.
     */
    function url() public pure override returns (string memory) {
        return "https://description.of.proposal";
    }

    /** Enact the proposal.
     *
     * This is executed in the storage context of the root policy contract.
     */
    function enacted(address) public override {
        Policed(policyFor(ID_TRUSTED_NODES)).policyCommand(
            implementationUpdatingTarget,
            abi.encodeWithSignature(
                "updateImplementation(address)",
                newTrustedNodes
            )
        );

        Policed(policyFor(ID_ECO)).policyCommand(
            implementationUpdatingTarget,
            abi.encodeWithSignature(
                "updateImplementation(address)",
                newEco
            )
        );

        Policed(policyFor(ID_TIMED_POLICIES)).policyCommand(
            implementationUpdatingTarget,
            abi.encodeWithSignature(
                "updateImplementation(address)",
                newTimedPolicies
            )
        );

        Policed(policyFor(ID_POLICY_PROPOSALS)).policyCommand(
            implementationUpdatingTarget,
            abi.encodeWithSignature(
                "updateImplementation(address)",
                newPolicyProposals
            )
        );

        Policed(policyFor(ID_POLICY_VOTES)).policyCommand(
            implementationUpdatingTarget,
            abi.encodeWithSignature(
                "updateImplementation(address)",
                newPolicyVotes
            )
        );

        Policed(policyFor(ID_CURRENCY_GOVERNANCE)).policyCommand(
            implementationUpdatingTarget,
            abi.encodeWithSignature(
                "updateImplementation(address)",
                newCurrencyGovernance
            )
        );

        Policed(policyFor(ID_CURRENCY_TIMER)).policyCommand(
            implementationUpdatingTarget,
            abi.encodeWithSignature(
                "updateImplementation(address)",
                newCurrencyTimer
            )
        );

        Policed(policyFor(ID_ECOXSTAKING)).policyCommand(
            implementationUpdatingTarget,
            abi.encodeWithSignature(
                "updateImplementation(address)",
                newEcoxStaking
            )
        );
    }
}
