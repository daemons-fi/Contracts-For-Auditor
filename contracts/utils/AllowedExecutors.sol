// SPDX-License-Identifier: MIT
// OpenZeppelin Contracts (last updated v4.7.0) (access/Ownable.sol)

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";

abstract contract AllowedExecutors is Ownable {
    // The mapping containing the list of all possible executors
    mapping(address => bool) executors;

    /// @notice Adds the given address to the list of executors
    /// @param executor the address that will be added to the list of allowed executors
    function addExecutor(address executor) external onlyOwner {
        executors[executor] = true;
    }

    /// @notice Removes the given address from the list of executors
    /// @param executor the address that will be removed from the list of allowed executors
    function removeExecutor(address executor) external onlyOwner {
        executors[executor] = false;
    }

    /// @notice Return true if the passed address is one of the allowed executors, false otherwise
    /// @param executor the address to verify
    function isExecutor(address executor) external view returns (bool) {
        return executors[executor];
    }

    /// @dev Throws if called by any account other than the allowed executors.
    modifier onlyAllowedExecutors() {
        require(executors[_msgSender()], "Unauthorized. Only Executors");
        _;
    }

    /// @dev Throws if called by any account other than the owner OR allowed executors.
    modifier onlyOwnerOrAllowedExecutors() {
        require(
            owner() == _msgSender() || executors[_msgSender()],
            "Unauthorized. Executors/Owner"
        );
        _;
    }
}
