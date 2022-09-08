// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../infrastructure/ConditionsChecker.sol";
import "../infrastructure/ConditionsCheckerForMoneyMarket.sol";
import "../infrastructure/Messages.sol";

contract MmBaseScriptExecutor is ConditionsChecker, ConditionsCheckerForMoneyMarket {
    mapping(address => mapping(IERC20 => bool)) private allowances;

    constructor() ConditionsChecker(460000) {}

    /* ========== HASH FUNCTIONS ========== */

    function hash(MmBase calldata mm) private pure returns (bytes32) {
        bytes32 eip712DomainHash = keccak256(
            abi.encode(EIP712_DOMAIN_TYPEHASH, keccak256(bytes("Daemons-MM-Base-v01")))
        );

        bytes32 mmHash = keccak256(
            bytes.concat(
                abi.encode(
                    MM_BASE_TYPEHASH,
                    mm.scriptId,
                    mm.token,
                    mm.aToken,
                    mm.action,
                    mm.typeAmt,
                    mm.amount,
                    mm.user,
                    mm.kontract,
                    mm.executor,
                    mm.chainId,
                    mm.tip
                ),
                abi.encodePacked(
                    hashBalance(mm.balance),
                    hashFrequency(mm.frequency),
                    hashPrice(mm.price),
                    hashRepetitions(mm.repetitions),
                    hashFollow(mm.follow),
                    hashHealthFactor(mm.healthFactor)
                )
            )
        );

        return keccak256(abi.encodePacked("\x19\x01", eip712DomainHash, mmHash));
    }

    /* ========== VERIFICATION FUNCTIONS ========== */

    function verifySignature(
        MmBase calldata message,
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
        MmBase calldata message,
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
        // check if the action can be performed
        // if typeAmt==Absolute -> it's the amount in the message,
        // otherwise it's enough if the user has more than 0 in the wallet.
        address tokenAddr = message.action == 0x00 ? message.token : message.aToken;
        uint256 minAmount = message.typeAmt == 0 ? message.amount - 1 : 0;
        verifyAllowance(message.user, tokenAddr, minAmount);
        require(ERC20(tokenAddr).balanceOf(message.user) > minAmount, "[SCRIPT_BALANCE][TMP]");

        verifyFrequency(message.frequency, message.scriptId);
        verifyBalance(message.balance, message.user);
        verifyPrice(message.price);
        verifyHealthFactor(message.healthFactor, message.user);
    }

    /* ========== EXECUTION FUNCTIONS ========== */

    /// @notice executes the given message, if the verification step passes
    /// @param message the message to execute
    function execute(
        MmBase calldata message,
        bytes32 r,
        bytes32 s,
        uint8 v
    ) external {
        verify(message, r, s, v);
        lastExecutions[message.scriptId] = block.timestamp;
        repetitionsCount[message.scriptId] += 1;

        if (message.action == 0x00) {
            supply(message);
        } else if (message.action == 0x01) {
            withdraw(message);
        }

        // Reward executor
        gasTank.addReward(
            message.scriptId,
            GAS_LIMIT * gasPriceFeed.lastGasPrice(),
            message.tip,
            message.user,
            _msgSender()
        );
    }

    function giveAllowance(IERC20 _token, address _exchange) private {
        IERC20(_token).approve(_exchange, type(uint256).max);
        allowances[_exchange][_token] = true;
    }

    function withdraw(MmBase calldata message) private {
        // step 0 get the aTokens from the user
        IERC20 aToken = IERC20(message.aToken);
        uint256 amount = message.typeAmt == 0 // absolute type: just return the given amount
            ? message.amount // percentage type: the amount represents a percentage on 10000
            : (aToken.balanceOf(message.user) * message.amount) / 10000;
        aToken.transferFrom(message.user, address(this), amount);

        // step 1 call withdraw function
        IMoneyMarket(message.kontract).withdraw(message.token, amount, message.user);
    }

    function supply(MmBase calldata message) private {
        // step 0 get the Tokens from the user
        IERC20 tokenFrom = IERC20(message.token);
        uint256 amount = message.typeAmt == 0 // absolute type: just return the given amount
            ? message.amount // percentage type: the amount represents a percentage on 10000
            : (tokenFrom.balanceOf(message.user) * message.amount) / 10000;
        tokenFrom.transferFrom(message.user, address(this), amount);

        // step 1 grant allowance to the router if it has not been given yet
        if (!allowances[message.kontract][tokenFrom]) giveAllowance(tokenFrom, message.kontract);

        // step 2 call supply function
        IMoneyMarket(message.kontract).deposit(message.token, amount, message.user, 0);
    }
}
