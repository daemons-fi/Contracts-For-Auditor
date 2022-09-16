//SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

interface IGasTank {
    /// @notice Event fired each time a script has been executed.
    /// @dev This event will be listened to in the Storage and
    /// it will trigger the creation of new transactions in the DB.
    event ScriptExecuted(bytes32 scriptId, address scriptOwner, address executor);

    /// @notice Get the amount of ETH the user has deposited in the gas tank
    /// @param user the address of the user to inspect
    /// @return the user gas balance
    function gasBalanceOf(address user) external view returns (uint256);

    /// @notice Add ETH to the gas tank
    function depositGas() external payable;

    /// @notice Withdraw ETH from the gas tank
    /// @param amount the amount of gas to withdraw
    function withdrawGas(uint256 amount) external;

    /// @notice Withdraw all ETH from the gas tank
    function withdrawAllGas() external;

    /// @notice Get the amount of DAEM the user has deposited in the tip jar
    /// @param user the address of the user to inspect
    /// @return the user gas balance
    function tipBalanceOf(address user) external view returns (uint256);

    /// @notice Deposits DAEM into the tip jar
    /// @param amount the amount of DAEM to deposit
    function depositTip(uint256 amount) external;

    /// @notice Withdraws DAEM from the tip jar
    /// @param amount the amount of DAEM to deposit
    function withdrawTip(uint256 amount) external;

    /// @notice Withdraws all DAEM from the tip jar
    function withdrawAllTip() external;

    /// @notice Removes funds from the gas tank of a user,
    /// in order to have them employed as payment for the execution of a script.
    /// @dev note: only executor contracts can call this function.
    /// @param scriptId the id of the script being executed
    /// @param ethAmount the amount of ETH to withdraw from the user gas tank
    /// @param tipAmount the amount of DAEM to withdraw from the user tip jar
    /// @param user the script owner
    /// @param executor the script executor
    function addReward(
        bytes32 scriptId,
        uint256 ethAmount,
        uint256 tipAmount,
        address user,
        address executor
    ) external;

    /// @notice The amount of tokens that can be claimed as payment for an executor work
    /// @param user the address of the user to inspect
    function claimable(address user) external view returns (uint256);

    /// @notice Claim the token received as payment for an executor work
    function claimReward() external;

    /// @notice Immediately deposit the user's claimable amount into the treasury for staking purposes
    function claimAndStakeReward() external;
}
