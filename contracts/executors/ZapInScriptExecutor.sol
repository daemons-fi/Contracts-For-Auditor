// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../infrastructure/ConditionsChecker.sol";
import "../infrastructure/Messages.sol";
import "../interfaces/uniswapV2/IUniswapV2Router.sol";
import "../interfaces/uniswapV2/IUniswapV2Factory.sol";
import "../interfaces/uniswapV2/IUniswapV2Pair.sol";
import "../utils/Babylonian.sol";

/*
 * @author Inspiration from the work of Zapper, Beefy and PancakeSwap.
 * Implemented and modified by Daemons teams.
 */
contract ZapInScriptExecutor is ConditionsChecker {
    constructor() ConditionsChecker(500000) {}

    /* ========== HASH FUNCTIONS ========== */

    function hash(ZapIn calldata zapIn) private pure returns (bytes32) {
        bytes32 eip712DomainHash = keccak256(
            abi.encode(EIP712_DOMAIN_TYPEHASH, keccak256(bytes("Daemons-ZapIn-v01")))
        );

        bytes32 zapInHash = keccak256(
            bytes.concat(
                abi.encode(
                    ZAP_IN_TYPEHASH,
                    zapIn.scriptId,
                    zapIn.pair,
                    zapIn.amountA,
                    zapIn.amountB,
                    zapIn.typeAmtA,
                    zapIn.typeAmtB,
                    zapIn.user,
                    zapIn.kontract,
                    zapIn.executor,
                    zapIn.chainId,
                    zapIn.tip
                ),
                abi.encodePacked(
                    hashBalance(zapIn.balance),
                    hashFrequency(zapIn.frequency),
                    hashPrice(zapIn.price),
                    hashRepetitions(zapIn.repetitions),
                    hashFollow(zapIn.follow)
                )
            )
        );

        return keccak256(abi.encodePacked("\x19\x01", eip712DomainHash, zapInHash));
    }

    /* ========== VERIFICATION FUNCTIONS ========== */

    /// @notice verifies if all conditions of the given message are true
    /// @param message the message to verify
    function verify(
        ZapIn calldata message,
        bytes32 r,
        bytes32 s,
        uint8 v
    ) public view {
        require(message.chainId == chainId, "[CHAIN][ERROR]");
        verifyRevocation(message.user, message.scriptId);
        require(message.user == ecrecover(hash(message), v, r, s), "[SIGNATURE][FINAL]");
        require(!(message.amountA == 0 && message.amountB == 0), "[ZERO_AMOUNT][FINAL]");

        address tokenA = IUniswapV2Pair(message.pair).token0();
        address tokenB = IUniswapV2Pair(message.pair).token1();
        verifyRepetitions(message.repetitions, message.scriptId);

        verifyFollow(message.follow, message.scriptId);
        verifyGasTank(message.user);
        verifyTip(message.tip, message.user);

        // the user balance of token A must be >= the specified amount
        uint256 minAmountA = message.typeAmtA == 0 ? message.amountA : 0;
        verifyAllowance(message.user, tokenA, minAmountA);
        require(ERC20(tokenA).balanceOf(message.user) >= minAmountA, "[SCRIPT_BALANCE][TMP]");

        // the user balance of token B must be >= the specified amount
        uint256 minAmountB = message.typeAmtB == 0 ? message.amountB : 0;
        verifyAllowance(message.user, tokenB, minAmountB);
        require(ERC20(tokenB).balanceOf(message.user) >= minAmountB, "[SCRIPT_BALANCE][TMP]");

        verifyFrequency(message.frequency, message.scriptId);
        verifyBalance(message.balance, message.user);
        verifyPrice(message.price);
    }

    /* ========== EXECUTION FUNCTIONS ========== */

    /// @notice executes the given message, if the verification step passes
    /// @param message the message to execute
    function execute(
        ZapIn calldata message,
        bytes32 r,
        bytes32 s,
        uint8 v
    ) external {
        verify(message, r, s, v);
        lastExecutions[message.scriptId] = block.timestamp;
        repetitionsCount[message.scriptId] += 1;

        address tokenA = IUniswapV2Pair(message.pair).token0();
        address tokenB = IUniswapV2Pair(message.pair).token1();

        // define how much should be zapped in the LP
        // absolute type: just return the given amount
        // percentage type: the amount represents a percentage on 10000
        uint256 amountA = message.typeAmtA == 0
            ? message.amountA
            : (IERC20(tokenA).balanceOf(message.user) * message.amountA) / 10000;
        uint256 amountB = message.typeAmtB == 0
            ? message.amountB
            : (IERC20(tokenB).balanceOf(message.user) * message.amountB) / 10000;

        approveTokenIfNeeded(tokenA, message.kontract, amountA);
        approveTokenIfNeeded(tokenB, message.kontract, amountB);

        // get the tokens from the user
        if (amountA > 0) IERC20(tokenA).transferFrom(message.user, address(this), amountA);
        if (amountB > 0) IERC20(tokenB).transferFrom(message.user, address(this), amountB);

        zapAndAddLiquidity(
            tokenA,
            tokenB,
            amountA,
            amountB,
            message.pair,
            0,
            IUniswapV2Router01(message.kontract),
            message.user
        );

        // reward executor
        gasTank.addReward(
            message.scriptId,
            GAS_LIMIT * gasPriceFeed.lastGasPrice(),
            message.tip,
            message.user,
            _msgSender()
        );
    }

    function zapAndAddLiquidity(
        address _token0,
        address _token1,
        uint256 _token0AmountIn,
        uint256 _token1AmountIn,
        address _pair,
        uint256 _tokenAmountOutMin,
        IUniswapV2Router01 _router,
        address _user
    ) private {
        uint256 amtA;
        uint256 amtB;

        if (_token0AmountIn > 0 && _token1AmountIn > 0) {
            // Zap with Rebalancing
            (amtA, amtB) = _zapInRebalancing(
                _token0,
                _token1,
                _token0AmountIn,
                _token1AmountIn,
                _pair,
                _tokenAmountOutMin,
                _router
            );
        } else if (_token0AmountIn > 0) {
            // Zap A
            (amtA, amtB) = _zapIn(
                _token0,
                _token1,
                true,
                _token0AmountIn,
                _pair,
                _tokenAmountOutMin,
                _router
            );
        } else {
            // Zap B
            (amtB, amtA) = _zapIn(
                _token0,
                _token1,
                false,
                _token1AmountIn,
                _pair,
                _tokenAmountOutMin,
                _router
            );
        }

        // Add liquidity and send LP to the user
        _router.addLiquidity(_token0, _token1, amtA, amtB, 1, 1, _user, block.timestamp);
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

    /*
     * @notice Zap a token in (e.g. token/other token)
     * @param _tokenToZap: token to zap
     * @param _tokenAmountIn: amount of token to swap
     * @param _tokenAmountOutMin: minimum token to receive in the intermediary swap
     */
    function _zapIn(
        address _token0,
        address _token1,
        bool _zapToken0,
        uint256 _tokenAmountIn,
        address _pair,
        uint256 _tokenAmountOutMin,
        IUniswapV2Router01 _router
    ) internal returns (uint256, uint256) {
        (uint256 _reserveA, uint256 _reserveB, ) = IUniswapV2Pair(_pair).getReserves();
        // Retrieve the path
        address[] memory path = new address[](2);
        path[0] = _zapToken0 ? _token0 : _token1;
        path[1] = _zapToken0 ? _token1 : _token0;

        // Initiates an estimation to swap
        uint256 swapAmountIn = _zapToken0
            ? _calculateAmountToSwap(_tokenAmountIn, _reserveA, _reserveB, _router)
            : _calculateAmountToSwap(_tokenAmountIn, _reserveB, _reserveA, _router);

        uint256[] memory swappedAmounts = _router.swapExactTokensForTokens(
            swapAmountIn,
            _tokenAmountOutMin,
            path,
            address(this),
            block.timestamp
        );

        return (_tokenAmountIn - swappedAmounts[0], swappedAmounts[1]);
    }

    /*
     * @notice Zap two tokens in, rebalance them to 50-50, before adding them to LP
     * @param _token0ToZap: address of token0 to zap
     * @param _token1ToZap: address of token1 to zap
     * @param _token0AmountIn: amount of token0 to zap
     * @param _token1AmountIn: amount of token1 to zap
     * @param _lpToken: LP token address
     * @param _tokenAmountInMax: maximum token amount to sell (in token to sell in the intermediary swap)
     * @param _isToken0Sold: whether token0 is expected to be sold (if false, sell token1)
     */
    function _zapInRebalancing(
        address _token0,
        address _token1,
        uint256 _token0AmountIn,
        uint256 _token1AmountIn,
        address _pair,
        uint256 _tokenAmountOutMin,
        IUniswapV2Router01 _router
    ) internal returns (uint256, uint256) {
        (uint256 _reserveA, uint256 _reserveB, ) = IUniswapV2Pair(_pair).getReserves();
        bool zapToken0 = (_token0AmountIn * _reserveB > _token1AmountIn * _reserveA);
        uint256 swapAmountIn = _calculateAmountToSwapForRebalancing(
            _token0AmountIn,
            _token1AmountIn,
            _reserveA,
            _reserveB,
            zapToken0,
            _router
        );

        address[] memory path = new address[](2);
        path[0] = zapToken0 ? _token0 : _token1;
        path[1] = zapToken0 ? _token1 : _token0;

        // Execute the swap and retrieve quantity received
        uint256[] memory swappedAmounts = _router.swapExactTokensForTokens(
            swapAmountIn,
            _tokenAmountOutMin,
            path,
            address(this),
            block.timestamp
        );

        return (
            (zapToken0 ? _token0AmountIn : _token1AmountIn) - swappedAmounts[0],
            (zapToken0 ? _token1AmountIn : _token0AmountIn) + swappedAmounts[1]
        );
    }

    /*
     * @notice Calculate the swap amount to get the price at 50/50 split
     * @param _token0AmountIn: amount of token 0
     * @param _reserve0: amount in reserve for token0
     * @param _reserve1: amount in reserve for token1
     * @return amountToSwap: swapped amount (in token0)
     */
    function _calculateAmountToSwap(
        uint256 _token0AmountIn,
        uint256 _reserve0,
        uint256 _reserve1,
        IUniswapV2Router01 _router
    ) private pure returns (uint256 amountToSwap) {
        uint256 halfToken0Amount = _token0AmountIn / 2;
        uint256 nominator = _router.getAmountOut(halfToken0Amount, _reserve0, _reserve1);
        uint256 denominator = _router.quote(
            halfToken0Amount,
            _reserve0 + halfToken0Amount,
            _reserve1 - nominator
        );

        // Adjustment for price impact
        amountToSwap =
            _token0AmountIn -
            Babylonian.sqrt((halfToken0Amount * halfToken0Amount * nominator) / denominator);

        return amountToSwap;
    }

    /*
     * @notice Calculate the amount to swap to get the tokens at a 50/50 split
     * @param _token0AmountIn: amount of token 0
     * @param _token1AmountIn: amount of token 1
     * @param _reserve0: amount in reserve for token0
     * @param _reserve1: amount in reserve for token1
     * @param _isToken0Sold: whether token0 is expected to be sold (if false, sell token1)
     * @return amountToSwap: swapped amount in token0 (if _isToken0Sold is true) or token1 (if _isToken0Sold is false)
     */
    function _calculateAmountToSwapForRebalancing(
        uint256 _token0AmountIn,
        uint256 _token1AmountIn,
        uint256 _reserve0,
        uint256 _reserve1,
        bool _isToken0Sold,
        IUniswapV2Router01 _router
    ) private pure returns (uint256 amountToSwap) {
        if (_isToken0Sold) {
            uint256 token0AmountToSell = (_token0AmountIn -
                (_token1AmountIn * _reserve0) /
                _reserve1) / 2;
            uint256 nominator = _router.getAmountOut(token0AmountToSell, _reserve0, _reserve1);
            uint256 denominator = _router.quote(
                token0AmountToSell,
                _reserve0 + token0AmountToSell,
                _reserve1 - nominator
            );

            // Calculate the amount to sell (in token0)
            token0AmountToSell =
                (_token0AmountIn -
                    (_token1AmountIn * (_reserve0 + token0AmountToSell)) /
                    (_reserve1 - nominator)) /
                2;

            // Adjustment for price impact
            amountToSwap =
                2 *
                token0AmountToSell -
                Babylonian.sqrt(
                    (token0AmountToSell * token0AmountToSell * nominator) / denominator
                );
        } else {
            uint256 token1AmountToSell = (_token1AmountIn -
                (_token0AmountIn * _reserve1) /
                _reserve0) / 2;
            uint256 nominator = _router.getAmountOut(token1AmountToSell, _reserve1, _reserve0);

            uint256 denominator = _router.quote(
                token1AmountToSell,
                _reserve1 + token1AmountToSell,
                _reserve0 - nominator
            );

            // Calculate the amount to sell (in token1)
            token1AmountToSell =
                (_token1AmountIn -
                    ((_token0AmountIn * (_reserve1 + token1AmountToSell)) /
                        (_reserve0 - nominator))) /
                2;

            // Adjustment for price impact
            amountToSwap =
                2 *
                token1AmountToSell -
                Babylonian.sqrt(
                    (token1AmountToSell * token1AmountToSell * nominator) / denominator
                );
        }

        return amountToSwap;
    }

    /// @notice It allows the owner to withdraw dust left in the executor contract
    /// @param _tokenAddress: the address of the token to withdraw
    /// @dev This function is only callable by owner.
    function recoverDust(address _tokenAddress) external onlyOwner {
        IERC20 token = IERC20(_tokenAddress);
        uint256 amount = token.balanceOf(address(this));
        require(amount > 0, "Nothing to recover");
        token.transfer(address(msg.sender), amount);
    }
}
