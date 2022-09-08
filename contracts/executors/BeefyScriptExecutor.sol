// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../infrastructure/ConditionsChecker.sol";
import "../infrastructure/Messages.sol";
import "../interfaces/beefy/IBeefyVault.sol";

contract BeefyScriptExecutor is ConditionsChecker {
    constructor() ConditionsChecker(400000) {}

    /* ========== HASH FUNCTIONS ========== */

    function hash(Beefy calldata beefy) private pure returns (bytes32) {
        bytes32 eip712DomainHash = keccak256(
            abi.encode(EIP712_DOMAIN_TYPEHASH, keccak256(bytes("Daemons-Beefy-v01")))
        );

        bytes32 beefyHash = keccak256(
            bytes.concat(
                abi.encode(
                    BEEFY_TYPEHASH,
                    beefy.scriptId,
                    beefy.lpAddress,
                    beefy.mooAddress,
                    beefy.action,
                    beefy.typeAmt,
                    beefy.amount,
                    beefy.user,
                    beefy.executor,
                    beefy.chainId,
                    beefy.tip
                ),
                abi.encodePacked(
                    hashBalance(beefy.balance),
                    hashFrequency(beefy.frequency),
                    hashPrice(beefy.price),
                    hashRepetitions(beefy.repetitions),
                    hashFollow(beefy.follow)
                )
            )
        );

        return keccak256(abi.encodePacked("\x19\x01", eip712DomainHash, beefyHash));
    }

    /* ========== VERIFICATION FUNCTIONS ========== */

    /// @notice verifies if all conditions of the given message are true
    /// @param message the message to verify
    function verify(
        Beefy calldata message,
        bytes32 r,
        bytes32 s,
        uint8 v
    ) public view {
        require(message.chainId == chainId, "[CHAIN][ERROR]");
        verifyRevocation(message.user, message.scriptId);
        require(message.user == ecrecover(hash(message), v, r, s), "[SIGNATURE][FINAL]");
        verifyRepetitions(message.repetitions, message.scriptId);

        verifyFollow(message.follow, message.scriptId);
        verifyGasTank(message.user);
        verifyTip(message.tip, message.user);

        // when depositing we check the LP, when withdrawing the MOO
        address tokenToCheck = message.action == 0 ? message.lpAddress : message.mooAddress;

        // the minimum amount in order to have the operation going through.
        // if typeAmt==Absolute -> it's the amount in the message,
        // otherwise it's enough if the user has more than 0 in the wallet.
        uint256 minAmount = message.typeAmt == 0 ? message.amount - 1 : 0;
        verifyAllowance(message.user, tokenToCheck, minAmount);
        require(ERC20(tokenToCheck).balanceOf(message.user) > minAmount, "[SCRIPT_BALANCE][TMP]");

        verifyFrequency(message.frequency, message.scriptId);
        verifyBalance(message.balance, message.user);
        verifyPrice(message.price);
    }

    /* ========== EXECUTION FUNCTIONS ========== */

    /// @notice executes the given message, if the verification step passes
    /// @param message the message to execute
    function execute(
        Beefy calldata message,
        bytes32 r,
        bytes32 s,
        uint8 v
    ) external {
        verify(message, r, s, v);
        lastExecutions[message.scriptId] = block.timestamp;
        repetitionsCount[message.scriptId] += 1;

        if (message.action == 0x00) {
            deposit(message);
        } else if (message.action == 0x01) {
            withdraw(message);
        }

        // reward executor
        gasTank.addReward(
            message.scriptId,
            GAS_LIMIT * gasPriceFeed.lastGasPrice(),
            message.tip,
            message.user,
            _msgSender()
        );
    }

    function deposit(Beefy calldata message) private {
        // Get the LP Tokens from the user
        IERC20 lpToken = IERC20(message.lpAddress);
        uint256 amount = message.typeAmt == 0 // absolute type: just return the given amount
            ? message.amount // percentage type: the amount represents a percentage on 10000
            : (lpToken.balanceOf(message.user) * message.amount) / 10000;
        lpToken.transferFrom(message.user, address(this), amount);

        // Grant allowance, if needed
        approveTokenIfNeeded(message.lpAddress, message.mooAddress, amount);

        // Deposit into Beefy vault
        IBeefyVault(message.mooAddress).deposit(amount);

        // Send moo tokens to user
        IERC20(message.mooAddress).transfer(
            message.user,
            IERC20(message.mooAddress).balanceOf(address(this))
        );
    }

    function withdraw(Beefy calldata message) private {
        // step 0 get the mooToken from the user
        IERC20 mooToken = IERC20(message.mooAddress);
        uint256 amount = message.typeAmt == 0 // absolute type: just return the given amount
            ? message.amount // percentage type: the amount represents a percentage on 10000
            : (mooToken.balanceOf(message.user) * message.amount) / 10000;
        mooToken.transferFrom(message.user, address(this), amount);

        // step 1 call withdraw function
        IBeefyVault(message.mooAddress).withdraw(amount);

        // Send lp tokens to user
        IERC20(message.lpAddress).transfer(
            message.user,
            IERC20(message.lpAddress).balanceOf(address(this))
        );
    }

    function approveTokenIfNeeded(
        address token,
        address spender,
        uint256 amount
    ) private {
        if (IERC20(token).allowance(address(this), spender) <= amount) {
            IERC20(token).approve(spender, type(uint256).max);
        }
    }
}
