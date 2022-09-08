//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title DAEM Vesting Contract
 * @dev Contract used to linearly vest tokens for multiple beneficiaries.
 * How to use:
 * Step 1: deploy the contract, a start date and a duration
 * Step 2: transfer the total amount of tokens to be vested to the Vesting contract
 * Step 3: Define beneficiaries and relative amounts they are due
 *
 * If after the start date some tokens are unassigned, the owner can claim them back
 * Anyone can release the due amount, by calling the release function and specifying the beneficiary address
 */
contract Vesting {
    uint256 public immutable start;
    uint256 public immutable duration;

    mapping(address => mapping(address => uint256)) public totalBalance;
    mapping(address => mapping(address => uint256)) public released;

    /* ========== CONSTRUCTOR ========== */

    constructor(
        uint256 _start,
        uint256 _duration
    ) {
        duration = _duration;
        start = _start;
    }

    /* ========== RESTRICTED FUNCTIONS ========== */

    /// @notice Vest a certain amount of tokens
    /// @param token the address of the tokens to be vested
    /// @param beneficiary the address that will be able to withdraw the tokens after the vesting period
    /// @param amount the amount of tokens the beneficiary will be able to withdraw
    function addBeneficiary(address token, address beneficiary, uint256 amount) external {
        require(block.timestamp < start, "Vesting started. Modifications forbidden");
        require(totalBalance[beneficiary][token] == 0, "Beneficiary is already in use");

        IERC20(token).transferFrom(msg.sender, address(this), amount);
        totalBalance[beneficiary][token] = amount;
    }

    /* ========== EXTERNAL FUNCTIONS ========== */

    /// @notice Sends the due amount of tokens to the specified beneficiary
    /// @param token the address of the tokens being vested
    /// @param beneficiary the address that will receive its due part
    function release(address token, address beneficiary) external {
        uint256 unreleased = releasableAmount(token, beneficiary);
        require(unreleased > 0, "Nothing to release");

        released[beneficiary][token] += unreleased;
        IERC20(token).transfer(beneficiary, unreleased);
    }

    /* ========== VIEWS FUNCTIONS ========== */

    /// @notice The amount a beneficiary has locked in the contract
    /// @param token the address of the tokens being vested
    /// @param beneficiary the address to check
    function lockedAmount(address token, address beneficiary) public view returns (uint256) {
        return totalBalance[beneficiary][token];
    }

    /// @notice The amount a beneficiary can release in this moment
    /// @param token the address of the tokens being vested
    /// @param beneficiary the address to check
    function releasableAmount(address token, address beneficiary) public view returns (uint256) {
        return vestedAmount(token, beneficiary) - released[beneficiary][token];
    }

    /// @notice The amount of tokens that have been vested for a beneficiary
    /// @param token the address of the tokens being vested
    /// @param beneficiary the address to check
    function vestedAmount(address token, address beneficiary) public view returns (uint256) {
        if (block.timestamp < start) {
            return 0;
        } else if (block.timestamp >= start + duration) {
            return totalBalance[beneficiary][token];
        } else {
            return (totalBalance[beneficiary][token] * (block.timestamp - start)) / duration;
        }
    }
}
