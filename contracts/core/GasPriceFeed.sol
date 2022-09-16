//SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/access/Ownable.sol";

/// @title GasPriceFeed Contract
/// @notice Contract that will serve as oracle for all executors,
/// relatively to the gas price on that chain
contract GasPriceFeed is Ownable {
    uint256 public lastGasPrice = 1000000000;

    /// @notice Set the latest gas price.
    /// @dev This value will be used as reference to pay out the executors rewards.
    function setGasPrice(uint256 gasPrice) external onlyOwner {
        require(gasPrice > 0, "GasPrice must be greater than 0");
        lastGasPrice = gasPrice;
    }
}
