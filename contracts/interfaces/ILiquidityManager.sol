//SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

/**
 * @title Liquidity Manager Interface
 * @notice The treasury will delegate to contracts inheriting this interface the management
 * of the ETH-DAEM liquidity. This is needed as different chains might use different DEXes,
 * with different algorithms.
 */
interface ILiquidityManager {

    /* ========== RESTRICTED FUNCTIONS ========== */

    /**
     * @notice Creates the ETH-DAEM-LP
     * @dev remember to give the allowance for `amountDAEM`
     * @param amountDAEM the amount of DAEM tokens to add to the LP, together with the sent ETH.
     * @param to address that will receive the LP.
     */
    function createLP(uint256 amountDAEM, address to) external payable;

    /**
     * @notice Sets the already existing DAEM-ETH-LP address
     * @param lpAddress the address of the DAEM-ETH-LP
     */
    function setPolLP(address lpAddress) external;

    /* ========== VIEWS ========== */

    /// @notice The address of the LP token
    function polLp() external view returns (address);

    /// @notice Given an amount of Ethereum, calculates how many DAEM it corresponds to
    /// @param ethAmount the ethereum amount
    function ETHToDAEM(uint256 ethAmount) external view returns (uint256);

    /// @notice Given an amount of DAEM, calculates how many Ethereum it corresponds to
    /// @param daemAmount the DAEM amount
    function DAEMToETH(uint256 daemAmount) external view returns (uint256);

    /// @notice calculate the percentage of DAEM tokens (of the total supply on this chain)
    /// that are currently locked in the user owned LP token
    function percentageOfDAEMInLP(address user) external view returns (uint256);

    /* ========== SWAP FUNCTIONS ========== */

    /**
     * @notice Swap ETH for DAEM token.
     * @param amountOutMin minimum amount to be sent, otherwise the tx will fail.
     * @param to address that will receive the swap result.
     * @param deadline block after which the transaction will fail.
     */
    function swapETHforDAEM(
        uint256 amountOutMin,
        address to,
        uint256 deadline
    ) external payable returns (uint256 amount);

    /**
     * @notice Swap either WETH for DAEM or DAEM for WETH/ETH.
     * @param swapType swap type. 0: WETH-to-DAEM, 1:DAEM-to-WETH, 2: DAEM-to-ETH.
     * @param amountIn the amount swapped of the input token.
     * @param amountOutMin minimum amount to be sent, otherwise the tx will fail.
     * @param to address that will receive the swap result.
     * @param deadline block after which the transaction will fail.
     */
    function swapTokenForToken(
        uint256 amountIn,
        uint256 swapType,
        uint256 amountOutMin,
        address to,
        uint256 deadline
    ) external returns (uint256 amount);

    /* ========== LIQUIDITY FUNCTIONS ========== */

    /**
     * @notice Adds liquidity to the ETH-DAEM LP.
     * @param amountDAEM the amount of DAEM tokens to add to the LP (at most, still depends on ETH amount).
     * @param to address that will receive the swap result.
     */
    function addLiquidityETH(
        uint256 amountDAEM,
        address to,
        uint256 deadline
    ) external payable;
}
