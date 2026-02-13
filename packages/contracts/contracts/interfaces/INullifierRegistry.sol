// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface INullifierRegistry {
    event NullifierSpent(bytes32 indexed nullifier, uint256 epoch, address recipient);

    function recordNullifier(bytes32 nullifier, uint256 epoch, address recipient) external;

    function isSpent(bytes32 nullifier) external view returns (bool);
}
