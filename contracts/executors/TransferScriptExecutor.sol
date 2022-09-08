// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../infrastructure/ConditionsChecker.sol";
import "../infrastructure/Messages.sol";
import "../interfaces/uniswapV2/IUniswapV2Router.sol";

contract TransferScriptExecutor is ConditionsChecker {
    constructor() ConditionsChecker(200000) {}

    /* ========== HASH FUNCTIONS ========== */

    function hash(Transfer calldata transfer) private pure returns (bytes32) {
        bytes32 eip712DomainHash = keccak256(
            abi.encode(EIP712_DOMAIN_TYPEHASH, keccak256(bytes("Daemons-Transfer-v01")))
        );

        bytes32 transferHash = keccak256(
            bytes.concat(
                abi.encode(
                    TRANSFER_TYPEHASH,
                    transfer.scriptId,
                    transfer.token,
                    transfer.destination,
                    transfer.typeAmt,
                    transfer.amount,
                    transfer.user,
                    transfer.executor,
                    transfer.chainId,
                    transfer.tip
                ),
                abi.encodePacked(
                    hashBalance(transfer.balance),
                    hashFrequency(transfer.frequency),
                    hashPrice(transfer.price),
                    hashRepetitions(transfer.repetitions),
                    hashFollow(transfer.follow)
                )
            )
        );

        return keccak256(abi.encodePacked("\x19\x01", eip712DomainHash, transferHash));
    }

    /* ========== VERIFICATION FUNCTIONS ========== */

    function verifySignature(
        Transfer calldata message,
        bytes32 r,
        bytes32 s,
        uint8 v
    ) private view {
        require(message.chainId == chainId, "[CHAIN][ERROR]");
        require(message.user == ecrecover(hash(message), v, r, s), "[SIGNATURE][FINAL]");
    }

    /// @notice verifies if all conditions of the given message are true
    /// @param message the message to verify
    function verify(
        Transfer calldata message,
        bytes32 r,
        bytes32 s,
        uint8 v
    ) public view {
        verifyRevocation(message.user, message.scriptId);
        verifySignature(message, r, s, v);
        verifyRepetitions(message.repetitions, message.scriptId);

        verifyFollow(message.follow, message.scriptId);
        verifyGasTank(message.user);
        verifyTip(message.tip, message.user);
        // the minimum amount in order to have the transfer going through.
        // if typeAmt==Absolute -> it's the amount in the message,
        // otherwise it's enough if the user has more than 0 in the wallet.
        uint256 minAmount = message.typeAmt == 0 ? message.amount - 1 : 0;
        verifyAllowance(message.user, message.token, minAmount);
        require(ERC20(message.token).balanceOf(message.user) > minAmount, "[SCRIPT_BALANCE][TMP]");

        verifyFrequency(message.frequency, message.scriptId);
        verifyBalance(message.balance, message.user);
        verifyPrice(message.price);
    }

    /* ========== EXECUTION FUNCTIONS ========== */

    /// @notice executes the given message, if the verification step passes
    /// @param message the message to execute
    function execute(
        Transfer calldata message,
        bytes32 r,
        bytes32 s,
        uint8 v
    ) external {
        verify(message, r, s, v);
        lastExecutions[message.scriptId] = block.timestamp;
        repetitionsCount[message.scriptId] += 1;

        // define how much should be transferred
        IERC20 tokenFrom = IERC20(message.token);
        uint256 amount = message.typeAmt == 0 // absolute type: just return the given amount
            ? message.amount // percentage type: the amount represents a percentage on 10000
            : (tokenFrom.balanceOf(message.user) * message.amount) / 10000;

        // transfer the tokens to the destination
        tokenFrom.transferFrom(message.user, message.destination, amount);

        // reward executor
        gasTank.addReward(
            message.scriptId,
            GAS_LIMIT * gasPriceFeed.lastGasPrice(),
            message.tip,
            message.user,
            _msgSender()
        );
    }
}
