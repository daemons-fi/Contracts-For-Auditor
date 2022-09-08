//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IBeefyVault is IERC20 {

    /// @notice Deposit a certain amount of LPs into a beefy vault
    /// @param _amount the amount to deposit
    function deposit(uint _amount) external;

    /// @notice Withdraw a certain amount of LP shares from a beefy vault
    /// @param _shares the amount to deposit
    function withdraw(uint256 _shares) external;
}
