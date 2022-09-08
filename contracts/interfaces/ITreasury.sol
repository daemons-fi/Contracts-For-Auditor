//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.9;

interface ITreasury {
    /// @notice The percentage that will be given to the executor after the taxes on tips have been calculated
    function TIPS_AFTER_TAXES_PERCENTAGE() external view returns (uint16);

    /// @notice The amount of DAEM tokens left to be distributed
    function tokensForDistribution() external view returns (uint256);

    /// @notice Function called by the gas tank to initialize a payout to the specified user
    /// @param user the user to be paid
    /// @param dueFromTips the amount the user earned via DAEM tips
    function requestPayout(address user, uint256 dueFromTips) external payable;

    /// @notice Function called by the gas tank to immediately stake the payout of the specified user
    /// @param user the user to be paid
    /// @param dueFromTips the amount the user earned via DAEM tips
    function stakePayout(address user, uint256 dueFromTips) external payable;

    /// @notice Given an amount of Ethereum, calculates how many DAEM it corresponds to
    /// @param ethAmount the ethereum amount
    function ethToDAEM(uint256 ethAmount) external view returns (uint256);
}
