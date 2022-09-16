//SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "../interfaces/aave/IMoneyMarket.sol";
import "../interfaces/uniswapV2/IUniswapV2Router.sol";
import "../interfaces/uniswapV2/IUniswapV2Factory.sol";
import "../interfaces/uniswapV2/IUniswapV2Pair.sol";
import "../interfaces/IGasTank.sol";
import "../core/Treasury.sol";

struct AccountData {
    uint256 totalCollateralETH;
    uint256 totalDebtETH;
    uint256 availableBorrowsETH;
    uint256 currentLiquidationThreshold;
    uint256 ltv;
    uint256 healthFactor;
}

struct MmInfo {
    AccountData accountData;
    uint128[] APYs;
    Balances balances;
}

struct DaemonsInfo {
    uint256 claimableDAEM;
    uint256 claimableETH;
    uint256 ethInGasTank;
    uint256 daemInGasTank;
    uint256 daemInTreasury;
}

struct Balances {
    uint256 coin;
    uint256[] tokens;
}

struct DaemonsInfoWithBalances {
    DaemonsInfo daemonsInfo;
    Balances balances;
}

struct LPInfo {
    address pairAddress;
    uint256 balance;
    address token0;
    address token1;
    uint112 reserve0;
    uint112 reserve1;
}

/**
 * @title InfoFetcher Contract
 * @notice Fetching for on-chain information from off-chain is expensive!
 * One has to do tons of requests and, on the long term, you gotta pay for
 * all of them! This is why the InfoFetcher was invented.
 *
 * This contract does stuff you'd never do in a non-readonly contract, like
 * loops and dealing with huge pieces of info. This will cut the number of
 * requests and their cost.
 */
contract InfoFetcher {
    /* ========== PUBLIC VIEWS ========== */

    /// @notice Fetch the user ETH balance and of the passed list of tokens
    /// @param user the user to check the balance of.
    /// @param tokens the addresses of the ERC20 tokens to get the balances from.
    function fetchBalances(address user, address[] calldata tokens)
        public
        view
        returns (Balances memory)
    {
        uint256[] memory tokenBalances = new uint256[](tokens.length);

        for (uint256 i = 0; i < tokens.length; i++) {
            tokenBalances[i] = ERC20(tokens[i]).balanceOf(user);
        }

        return Balances(user.balance, tokenBalances);
    }

    /// @notice Fetch the user balances in GasTank and Treasury
    /// @param user the user to check the balance of.
    /// @param _treasury the addresses of the Treasury on this chain.
    /// @param _gasTank the addresses of the GasTank on this chain.
    function fetchUserStateOnDaemons(
        address user,
        address _treasury,
        address _gasTank
    ) public view returns (DaemonsInfo memory) {
        Treasury treasury = Treasury(_treasury);
        IGasTank gasTank = IGasTank(_gasTank);
        return
            DaemonsInfo(
                gasTank.claimable(user),
                treasury.earned(user),
                gasTank.gasBalanceOf(user),
                gasTank.tipBalanceOf(user),
                treasury.balanceOf(user)
            );
    }

    /// @notice Fetch the user balances for the specified tokens AND in GasTank and Treasury
    /// @param user the user to check the balance of.
    /// @param _treasury the addresses of the Treasury on this chain.
    /// @param _gasTank the addresses of the GasTank on this chain.
    function fetchUserStateOnDaemonsAndBalances(
        address user,
        address _treasury,
        address _gasTank,
        address[] calldata tokens
    ) public view returns (DaemonsInfoWithBalances memory) {
        return
            DaemonsInfoWithBalances(
                fetchUserStateOnDaemons(user, _treasury, _gasTank),
                fetchBalances(user, tokens)
            );
    }

    /// @notice Fetch the user ETH balance and of the passed list of tokens
    /// @param tokenA the first token of the LP.
    /// @param tokenB the second token of the LP.
    /// @param router the router of the DEX owning the LP.
    /// @param user the user to check the LP balance of.
    function fetchLpInfo(
        address tokenA,
        address tokenB,
        address router,
        address user
    ) public view returns (LPInfo memory) {
        address factory = IUniswapV2Router01(router).factory();
        address pairAddress = IUniswapV2Factory(factory).getPair(tokenA, tokenB);

        // if pair is not supported, we return an empty object
        if (pairAddress == address(0)) {
            return LPInfo(address(0), 0, address(0), address(0), 0, 0);
        }

        IUniswapV2Pair pair = IUniswapV2Pair(pairAddress);
        (uint112 reserve0, uint112 reserve1, ) = pair.getReserves();

        return
            LPInfo(
                address(pair),
                pair.balanceOf(user),
                pair.token0(),
                pair.token1(),
                reserve0,
                reserve1
            );
    }

    /// @notice Fetch information about the loans status of a user in the specified MM.
    /// @param mmPool the pool of the MoneyMarket to consider.
    /// @param isV3 specifies whether the MM is a V2 or V3, needed as the signature of the APY function is different.
    /// @param user the user to check the balance of.
    /// @param tokens the addresses of the ERC20 tokens to get the APYs for.
    /// @param aTokens the addresses of the supply/variableDebt/fixedDebt tokens.
    function fetchMmInfo(
        address mmPool,
        bool isV3,
        address user,
        address[] calldata tokens,
        address[] calldata aTokens
    ) external view returns (MmInfo memory) {
        return
            MmInfo(
                fetchAccountData(mmPool, user),
                fetchAPYs(mmPool, isV3, tokens),
                fetchBalances(user, aTokens)
            );
    }

    function fetchAccountData(address mmPool, address user)
        private
        view
        returns (AccountData memory)
    {
        (
            uint256 totalCollateralETH,
            uint256 totalDebtETH,
            uint256 availableBorrowsETH,
            uint256 currentLiquidationThreshold,
            uint256 ltv,
            uint256 healthFactor
        ) = IMoneyMarket(mmPool).getUserAccountData(user);

        return
            AccountData(
                totalCollateralETH,
                totalDebtETH,
                availableBorrowsETH,
                currentLiquidationThreshold,
                ltv,
                healthFactor
            );
    }

    function fetchAPYs(
        address mmPool,
        bool isV3,
        address[] calldata tokens
    ) private view returns (uint128[] memory) {
        uint128[] memory APYs = new uint128[](tokens.length * 3);

        // for each token, extract the APYs (in RAY) and place them in a flattened array.
        // the array will, thus, have a 3*tokens length.
        for (uint128 i = 0; i < tokens.length; i++) {
            uint128[] memory result = isV3
                ? fetchAPYsV3(mmPool, tokens[i])
                : fetchAPYsV2(mmPool, tokens[i]);
            APYs[i * 3] = result[0];
            APYs[i * 3 + 1] = result[1];
            APYs[i * 3 + 2] = result[2];
        }

        return APYs;
    }

    function fetchAPYsV2(address mmPool, address token) private view returns (uint128[] memory) {
        IGetReserveDataV2.ReserveData memory rd = IGetReserveDataV2(mmPool).getReserveData(token);

        uint128[] memory result = new uint128[](3);
        result[0] = rd.currentLiquidityRate;
        result[1] = rd.currentVariableBorrowRate;
        result[2] = rd.currentStableBorrowRate;
        return result;
    }

    function fetchAPYsV3(address mmPool, address token) private view returns (uint128[] memory) {
        IGetReserveDataV3.ReserveData memory rd = IGetReserveDataV3(mmPool).getReserveData(token);

        uint128[] memory result = new uint128[](3);
        result[0] = rd.currentLiquidityRate;
        result[1] = rd.currentVariableBorrowRate;
        result[2] = rd.currentStableBorrowRate;
        return result;
    }
}
