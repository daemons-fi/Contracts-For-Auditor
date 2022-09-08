// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../infrastructure/ConditionsChecker.sol";
import "../infrastructure/ConditionsCheckerForMoneyMarket.sol";
import "../infrastructure/Messages.sol";

contract PassScriptExecutor is ConditionsChecker, ConditionsCheckerForMoneyMarket {
    constructor() ConditionsChecker(150000) {}

    /* ========== HASH FUNCTIONS ========== */

    function hash(Pass calldata pass) private pure returns (bytes32) {
        bytes32 eip712DomainHash = keccak256(
            abi.encode(EIP712_DOMAIN_TYPEHASH, keccak256(bytes("Daemons-Pass-v01")))
        );

        bytes32 passHash = keccak256(
            bytes.concat(
                abi.encode(
                    PASS_TYPEHASH,
                    pass.scriptId,
                    pass.user,
                    pass.executor,
                    pass.chainId,
                    pass.tip
                ),
                abi.encodePacked(
                    hashBalance(pass.balance),
                    hashFrequency(pass.frequency),
                    hashPrice(pass.price),
                    hashRepetitions(pass.repetitions),
                    hashFollow(pass.follow),
                    hashHealthFactor(pass.healthFactor)
                )
            )
        );

        return keccak256(abi.encodePacked("\x19\x01", eip712DomainHash, passHash));
    }

    /* ========== VERIFICATION FUNCTIONS ========== */

    /// @notice verifies if all conditions of the given message are true
    /// @param message the message to verify
    function verify(
        Pass calldata message,
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
        verifyFrequency(message.frequency, message.scriptId);
        verifyBalance(message.balance, message.user);
        verifyPrice(message.price);
        verifyHealthFactor(message.healthFactor, message.user);
    }

    /* ========== EXECUTION FUNCTIONS ========== */

    /// @notice executes the given message, if the verification step passes
    /// @param message the message to execute
    function execute(
        Pass calldata message,
        bytes32 r,
        bytes32 s,
        uint8 v
    ) external {
        verify(message, r, s, v);
        lastExecutions[message.scriptId] = block.timestamp;
        repetitionsCount[message.scriptId] += 1;

        // Do nothing, just pass

        // Reward executor
        gasTank.addReward(
            message.scriptId,
            GAS_LIMIT * gasPriceFeed.lastGasPrice(),
            message.tip,
            message.user,
            _msgSender()
        );
    }
}
