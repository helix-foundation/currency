/* -*- c-basic-offset: 4 -*- */
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../policy/PolicedUtils.sol";
import "../utils/TimeUtils.sol";
import "./TokenEvents.sol";
import "./GenerationStore.sol";
import "../governance/CurrencyGovernance.sol";
import "./InflationRootHashProposal.sol";

/** @title Eco Balance Store
 * This implements a shared balance store to be used by the ECO network to
 * store token account balances in a way that is sharable across multiple token
 * interface definitions.
 *
 * Only pre-authorized interface contract instances are permitted to interact
 * with this contract. These instances are authorized by the balance store
 * contract policy, and their access can be revoked by the policy at any time.
 *
 * This contract does not represent a token by itself! It only makes sense in
 * the context of an interface, presumably implementing a widely accepted token
 * contract standard, ie ERC20.
 */
contract EcoBalanceStore is GenerationStore, TimeUtils {
    /* Event to be emitted whenever a new token interface is authorized to
     * interact with this balance store instance.
     */
    event Authorized(address indexed source, string contractIdentifier);

    /* Event to be emitted whenever a token interface's authorization to interact
     * with this balance store instance is revoked.
     */
    event Revoked(address indexed source, string contractIdentifier);

    /* Event to be emitted whenever new tokens are minted in this balance store.
       The value parameter is in basic unit of 10^{-18} (atto) ECO tokens
     */
    event Minted(address indexed source, address indexed to, uint256 value);

    /* Event to be emitted whenever tokens in this balance store are burned.
       The value parameter is in basic unit of 10^{-18} (atto) ECO tokens
     */
    event Burned(address indexed source, address indexed from, uint256 value);

    /* Event to be emitted when InflationRootHashProposalStarted contract spawned.
     */
    event InflationRootHashProposalStarted(
        address inflationRootHashProposalContract,
        uint256 indexed generation
    );

    /* A list indicating which policies are permitted to operate on this
     * balance store.
     */
    bytes32[] public authorizedContracts;

    /* For cleaning authorizedContracts, a list of keys */
    address[] private authorizedContractAddresses;

    uint256 public constant INITIAL_INFLATION_MULTIPLIER =
        1_000_000_000_000_000_000;

    mapping(uint256 => InflationRootHashProposal)
        public rootHashAddressPerGeneration;
    InflationRootHashProposal public inflationRootHashProposalImpl;

    constructor(
        address _policy,
        InflationRootHashProposal _rootHashProposalImpl
    ) public GenerationStore(_policy) {
        configureDefaultAuthorizedContracts();
        inflationRootHashProposalImpl = _rootHashProposalImpl;
        historicLinearInflation[
            GENERATION_START
        ] = INITIAL_INFLATION_MULTIPLIER;
    }

    function configureDefaultAuthorizedContracts() internal {
        authorizedContracts.push(ID_ERC20TOKEN);
        authorizedContracts.push(ID_ERC777TOKEN);
    }

    function authorize(string calldata _policyIdentifier) external onlyPolicy {
        bytes32 _hash = keccak256(abi.encodePacked(_policyIdentifier));
        for (uint256 i = 0; i < authorizedContracts.length; ++i) {
            require(
                authorizedContracts[i] != _hash,
                "Contract is already authorized"
            );
        }
        authorizedContracts.push(_hash);

        reAuthorize();
        emit Authorized(msg.sender, _policyIdentifier);
    }

    function revoke(string calldata _policyIdentifier) external onlyPolicy {
        bytes32 _hash = keccak256(abi.encodePacked(_policyIdentifier));
        for (uint256 i = 0; i < authorizedContracts.length; ++i) {
            if (authorizedContracts[i] == _hash) {
                if (i != authorizedContracts.length - 1) {
                    authorizedContracts[i] = authorizedContracts[
                        authorizedContracts.length - 1
                    ];
                }
                authorizedContracts.pop();

                reAuthorize();
                emit Revoked(msg.sender, _policyIdentifier);
                return;
            }
        }

        revert("Contract is not authorized");
    }

    function isAuthorized(address _contract) external view returns (bool) {
        for (uint256 i = 0; i < authorizedContractAddresses.length; ++i) {
            if (authorizedContractAddresses[i] == _contract) {
                return true;
            }
        }
        return false;
    }

    function tokenTransfer(
        address _operator,
        address _from,
        address _to,
        uint256 _value,
        bytes calldata _data,
        bytes calldata _operatorData
    ) external {
        bool authorized = false;
        for (uint256 i = 0; i < authorizedContractAddresses.length; ++i) {
            TokenEvents token = TokenEvents(authorizedContractAddresses[i]);
            token.emitSentEvent(
                _operator,
                _from,
                _to,
                _value,
                _data,
                _operatorData
            );

            authorized = authorized || msg.sender == address(token);
        }

        require(authorized, "Sender not authorized to call this function");

        update(_from);
        update(_to);

        uint256 _uninflatedValue = _value *
            historicLinearInflation[currentGeneration];

        mapping(address => uint256) storage bal = balances[currentGeneration];

        require(
            bal[_from] >= _uninflatedValue,
            "Source account has insufficient tokens"
        );

        bal[_from] = bal[_from] - _uninflatedValue;
        bal[_to] = bal[_to] + _uninflatedValue;
    }

    function tokenBurn(
        address _operator,
        address _from,
        uint256 _value,
        bytes calldata _data,
        bytes calldata _operatorData
    ) external {
        // apply inflation scalefactor here to convert _value to the uninflated store
        bool authorized = msg.sender == policy;
        for (uint256 i = 0; i < authorizedContractAddresses.length; ++i) {
            TokenEvents token = TokenEvents(authorizedContractAddresses[i]);
            token.emitBurnedEvent(
                _operator,
                _from,
                _value,
                _data,
                _operatorData
            );
            authorized = authorized || msg.sender == address(token);
        }

        require(authorized, "Sender not authorized to call this function");

        update(_from);

        uint256 _uninflatedValue = _value *
            historicLinearInflation[currentGeneration];

        mapping(address => uint256) storage bal = balances[currentGeneration];

        require(bal[_from] >= _uninflatedValue, "Insufficient funds to burn");
        bal[_from] = bal[_from] - _uninflatedValue;
        historicTotalSupplyUninflated[currentGeneration] =
            historicTotalSupplyUninflated[currentGeneration] -
            _uninflatedValue;
    }

    function initialize(address _self) public override onlyConstruction {
        super.initialize(_self);
        configureDefaultAuthorizedContracts();
        inflationRootHashProposalImpl = EcoBalanceStore(_self)
            .inflationRootHashProposalImpl();
    }

    function mint(address _to, uint256 _value) external {
        require(
            msg.sender == policyFor(ID_CURRENCY_GOVERNANCE) ||
                msg.sender == policyFor(ID_CURRENCY_TIMER) ||
                msg.sender == policyFor(ID_ECOX) ||
                msg.sender == policyFor(ID_FAUCET),
            "Caller not authorized to mint tokens"
        );

        update(_to);
        uint256 _uninflatedValue = _value *
            historicLinearInflation[currentGeneration];
        mapping(address => uint256) storage bal = balances[currentGeneration];
        bal[_to] = bal[_to] + _uninflatedValue;
        historicTotalSupplyUninflated[currentGeneration] =
            historicTotalSupplyUninflated[currentGeneration] +
            _uninflatedValue;
        for (uint256 i = 0; i < authorizedContractAddresses.length; ++i) {
            TokenEvents token = TokenEvents(authorizedContractAddresses[i]);
            token.emitMintedEvent(msg.sender, _to, _value, "", "");
        }
    }

    function destruct() external {
        require(
            msg.sender == policyFor(ID_CLEANUP),
            "Only the cleanup policy contract can call destruct"
        );
        selfdestruct(payable(msg.sender));
    }

    function name() public pure returns (string memory) {
        return "Eco";
    }

    function symbol() public pure returns (string memory) {
        return "ECO";
    }

    function decimals() public pure returns (uint8) {
        return 18;
    }

    function reAuthorize() public {
        delete authorizedContractAddresses;
        for (uint256 i = 0; i < authorizedContracts.length; ++i) {
            bytes32 _hash = authorizedContracts[i];
            address _contract = policyFor(_hash);
            if (_contract != address(0)) {
                authorizedContractAddresses.push(_contract);
                (bool success, ) = _contract.call(
                    abi.encodeWithSignature("updateStore()")
                );
                require(success, "Failed to upateStore on authorized contract");
            }
        }
    }

    function notifyGenerationIncrease() public virtual override {
        uint256 _old = currentGeneration;
        super.notifyGenerationIncrease();

        CurrencyGovernance bg = CurrencyGovernance(
            policyFor(ID_CURRENCY_GOVERNANCE)
        );

        if (address(bg) != address(0)) {
            address winner = bg.winner();
            if (winner != address(0)) {
                bool _valid;
                uint256 _randomInflationWinners;
                uint256 _randomInflationPrize;
                uint256 _lockupDuration;
                uint256 _lockupInterest;
                uint256 _inflationMultiplier = INITIAL_INFLATION_MULTIPLIER;
                (
                    _valid,
                    _randomInflationWinners,
                    _randomInflationPrize,
                    _lockupDuration,
                    _lockupInterest,
                    _inflationMultiplier
                ) = bg.proposals(winner);

                // updates the inflation value
                historicLinearInflation[currentGeneration] =
                    (historicLinearInflation[currentGeneration] *
                        _inflationMultiplier) /
                    INITIAL_INFLATION_MULTIPLIER;
            }
        }

        rootHashAddressPerGeneration[_old] = InflationRootHashProposal(
            inflationRootHashProposalImpl.clone()
        );
        rootHashAddressPerGeneration[_old].configure(_old);

        emit InflationRootHashProposalStarted(
            address(rootHashAddressPerGeneration[_old]),
            _old
        );
    }
}
