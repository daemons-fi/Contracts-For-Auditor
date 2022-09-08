// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../infrastructure/ConditionsChecker.sol";
import "../infrastructure/Messages.sol";
import "../interfaces/uniswapV2/IUniswapV2Router.sol";
import "../interfaces/uniswapV2/IUniswapV2Factory.sol";

contract ZapOutScriptExecutor is ConditionsChecker {
    constructor() ConditionsChecker(500000) {}

    /* ========== HASH FUNCTIONS ========== */

    function hash(ZapOut calldata zapOut) private pure returns (bytes32) {
        bytes32 eip712DomainHash = keccak256(
            abi.encode(EIP712_DOMAIN_TYPEHASH, keccak256(bytes("Daemons-ZapOut-v01")))
        );

        bytes32 zapOutHash = keccak256(
            bytes.concat(
                abi.encode(
                    ZAP_OUT_TYPEHASH,
                    zapOut.scriptId,
                    zapOut.tokenA,
                    zapOut.tokenB,
                    zapOut.amount,
                    zapOut.typeAmt,
                    zapOut.outputChoice,
                    zapOut.user,
                    zapOut.kontract,
                    zapOut.executor,
                    zapOut.chainId,
                    zapOut.tip
                ),
                abi.encodePacked(
                    hashBalance(zapOut.balance),
                    hashFrequency(zapOut.frequency),
                    hashPrice(zapOut.price),
                    hashRepetitions(zapOut.repetitions),
                    hashFollow(zapOut.follow)
                )
            )
        );

        return keccak256(abi.encodePacked("\x19\x01", eip712DomainHash, zapOutHash));
    }

    /* ========== VERIFICATION FUNCTIONS ========== */

    /// @notice verifies if all conditions of the given message are true
    /// @param message the message to verify
    function verify(
        ZapOut calldata message,
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

        // the minimum amount in order to have the zapOut going through.
        // if typeAmt==Absolute -> it's the amount in the message,
        // otherwise it's enough if the user has more than 0 in the wallet.
        uint256 minAmount = message.typeAmt == 0 ? message.amount - 1 : 0;
        address pair = getPair(message.kontract, message.tokenA, message.tokenB);
        verifyAllowance(message.user, pair, minAmount);
        require(ERC20(pair).balanceOf(message.user) > minAmount, "[SCRIPT_BALANCE][TMP]");

        verifyFrequency(message.frequency, message.scriptId);
        verifyBalance(message.balance, message.user);
        verifyPrice(message.price);
    }

    /* ========== EXECUTION FUNCTIONS ========== */

    /// @notice executes the given message, if the verification step passes
    /// @param message the message to execute
    function execute(
        ZapOut calldata message,
        bytes32 r,
        bytes32 s,
        uint8 v
    ) external {
        verify(message, r, s, v);
        lastExecutions[message.scriptId] = block.timestamp;
        repetitionsCount[message.scriptId] += 1;

        // define how much should be zapped out
        IERC20 pair = IERC20(getPair(message.kontract, message.tokenA, message.tokenB));
        uint256 amount = message.typeAmt == 0 // absolute type: just return the given amount
            ? message.amount // percentage type: the amount represents a percentage on 10000
            : (pair.balanceOf(message.user) * message.amount) / 10000;

        // get the pair from the user
        pair.transferFrom(message.user, address(this), amount);

        // remove liquidity
        approveTokenIfNeeded(address(pair), message.kontract, amount);

        if (message.outputChoice == 0) {
            // user wants to get A+B, we directly send the liquidity there
            IUniswapV2Router01(message.kontract).removeLiquidity(
                message.tokenA,
                message.tokenB,
                amount,
                0,
                0,
                message.user,
                block.timestamp
            );
        } else {
            // user wants only one of the tokens. We get the liquidity here and swap
            IUniswapV2Router01(message.kontract).removeLiquidity(
                message.tokenA,
                message.tokenB,
                amount,
                0,
                0,
                address(this),
                block.timestamp
            );

            if (message.outputChoice == 1) {
                // receive only tokenA
                swapAndSend(message.tokenB, message.tokenA, message.user, message.kontract);
            } else {
                // receive only tokenB
                swapAndSend(message.tokenA, message.tokenB, message.user, message.kontract);
            }
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

    function getPair(
        address kontract,
        address tokenA,
        address tokenB
    ) private view returns (address) {
        address factory = IUniswapV2Router01(kontract).factory();
        return IUniswapV2Factory(factory).getPair(tokenA, tokenB);
    }

    function swapAndSend(
        address tokenFrom,
        address tokenTo,
        address user,
        address kontract
    ) private {
        address[] memory path = new address[](2);
        path[0] = tokenFrom;
        path[1] = tokenTo;

        // we swap all the tokens the contract just received
        uint256 amount = IERC20(tokenFrom).balanceOf(address(this));
        approveTokenIfNeeded(tokenFrom, kontract, amount);

        IUniswapV2Router01(kontract).swapExactTokensForTokens(
            amount,
            0,
            path,
            user,
            block.timestamp + 600000 // 10 minutes
        );

        IERC20(tokenTo).transfer(user, IERC20(tokenTo).balanceOf(address(this)));
    }

    function approveTokenIfNeeded(address token, address spender, uint256 amount) private {
        if (IERC20(token).allowance(address(this), spender) <= amount) {
            IERC20(token).approve(spender, type(uint256).max);
        }
    }
}
