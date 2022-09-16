// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/access/Ownable.sol";

/// @title WithOperators Contract
/// @notice Contract defining the `operator` role, that can be assigned and removed from the contract owner
/// This role is especially useful when you need some access restriction, but want to allow multiple contracts
/// (or non-owners) to call the functions
abstract contract WithOperators is Ownable {
    // The mapping containing the list of all possible operators
    mapping(address => bool) operators;

    /// @notice Adds the given address to the list of operators
    /// @param operator the address that will be added to the list of allowed operators
    function addOperator(address operator) external onlyOwner {
        operators[operator] = true;
    }

    /// @notice Removes the given address from the list of operators
    /// @param operator the address that will be removed from the list of allowed operators
    function removeOperator(address operator) external onlyOwner {
        operators[operator] = false;
    }

    /// @notice Return true if the passed address is one of the allowed operators, false otherwise
    /// @param operator the address to verify
    function isOperator(address operator) external view returns (bool) {
        return operators[operator];
    }

    /// @dev Throws if called by any account other than the allowed operators.
    modifier onlyOperators() {
        require(operators[_msgSender()], "Unauthorized. Only operators");
        _;
    }

    /// @dev Throws if called by any account other than the owner OR allowed operators.
    modifier onlyOwnerOrOperators() {
        require(
            owner() == _msgSender() || operators[_msgSender()],
            "Unauthorized. operators/Owner"
        );
        _;
    }
}
