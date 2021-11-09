/* -*- c-basic-offset: 4 -*- */
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

/** TODO: DOC THIS */
interface TokenEvents {
    /** TODO: DOC THIS */
    function emitSentEvent(
        address _operator,
        address _from,
        address _to,
        uint256 _amount,
        bytes calldata _data,
        bytes calldata _operatorData
    ) external;

    /** TODO: DOC THIS */
    function emitMintedEvent(
        address _operator,
        address _to,
        uint256 _amount,
        bytes calldata _data,
        bytes calldata _operatorData
    ) external;

    /** TODO: DOC THIS */
    function emitBurnedEvent(
        address _operator,
        address _from,
        uint256 _amount,
        bytes calldata _data,
        bytes calldata _operatorData
    ) external;
}
