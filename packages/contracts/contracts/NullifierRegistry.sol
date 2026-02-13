// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/INullifierRegistry.sol";

contract NullifierRegistry is Ownable, INullifierRegistry {
    mapping(bytes32 => bool) public spentNullifiers;

    constructor(address initialOwner) Ownable(initialOwner) {}

    function recordNullifier(
        bytes32 nullifier,
        uint256 epoch,
        address recipient
    ) external onlyOwner {
        require(!spentNullifiers[nullifier], "Already spent");
        spentNullifiers[nullifier] = true;
        emit NullifierSpent(nullifier, epoch, recipient);
    }

    function isSpent(bytes32 nullifier) external view returns (bool) {
        return spentNullifiers[nullifier];
    }
}
