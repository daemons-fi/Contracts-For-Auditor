//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.9;

import "../interfaces/ILiquidityManager.sol";
import "../interfaces/uniswapV2/IUniswapV2Router.sol";
import "../interfaces/uniswapV2/IUniswapV2Factory.sol";
import "../interfaces/uniswapV2/IUniswapV2Pair.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title UniswapV2 Liquidity Manager
/// @notice Liquidity manager that can interface with IUniswapV2 interfaces
contract UniswapV2LiquidityManager is ILiquidityManager, Ownable {
    address private immutable WETH;
    address private immutable DAEM;

    IUniswapV2Router01 private lpRouter;
    address public polLp;

    constructor(address _DAEM, address _lpRouter) {
        require(_DAEM != address(0));
        lpRouter = IUniswapV2Router01(_lpRouter);
        WETH = lpRouter.WETH();
        DAEM = _DAEM;
        IERC20(DAEM).approve(_lpRouter, type(uint256).max);
        IERC20(WETH).approve(_lpRouter, type(uint256).max);
    }

    /* ========== RESTRICTED FUNCTIONS ========== */

    /// @inheritdoc ILiquidityManager
    function createLP(uint256 amountDAEM, address to) external payable onlyOwner {
        require(polLp == address(0), "LP already initialized");

        // Gets the specified amount of DAEM
        IERC20(DAEM).transferFrom(msg.sender, address(this), amountDAEM);

        // Create the LP
        IUniswapV2Router01(lpRouter).addLiquidityETH{value: msg.value}(
            DAEM,
            amountDAEM,
            0,
            0,
            to,
            block.timestamp
        );

        // fetch the newly created DAEM-ETH-LP address
        polLp = IUniswapV2Factory(IUniswapV2Router01(lpRouter).factory()).getPair(WETH, DAEM);
        require(polLp != address(0), "LP address fetching failed");
    }

    /// @inheritdoc ILiquidityManager
    function setPolLP(address lpAddress) external onlyOwner {
        require(polLp == address(0), "LP already initialized");
        polLp = lpAddress;
    }

    /* ========== VIEWS ========== */

    /// @inheritdoc ILiquidityManager
    function ETHToDAEM(uint256 ethAmount) external view returns (uint256) {
        require(polLp != address(0), "LP not initialized yet");

        address[] memory ETHToDAEMPath = new address[](2);
        ETHToDAEMPath[0] = WETH;
        ETHToDAEMPath[1] = DAEM;
        return IUniswapV2Router01(lpRouter).getAmountsOut(ethAmount, ETHToDAEMPath)[1];
    }

    /// @inheritdoc ILiquidityManager
    function DAEMToETH(uint256 daemAmount) external view returns (uint256) {
        require(polLp != address(0), "LP not initialized yet");

        address[] memory DAEMToEthPath = new address[](2);
        DAEMToEthPath[0] = DAEM;
        DAEMToEthPath[1] = WETH;
        return IUniswapV2Router01(lpRouter).getAmountsOut(daemAmount, DAEMToEthPath)[1];
    }

    /// @inheritdoc ILiquidityManager
    function percentageOfDAEMInLP(address user) external view returns (uint256) {
        require(polLp != address(0), "LP not initialized yet");
        uint256 totalSupply = IERC20(DAEM).totalSupply();
        IUniswapV2Pair lp = IUniswapV2Pair(polLp);
        uint256 lpTotalSupply = lp.totalSupply();
        uint256 ownedLp = lp.balanceOf(user);
        (uint256 resA, uint256 resB, ) = lp.getReserves();
        uint256 DAEMInLp = lp.token0() == DAEM ? resA : resB;
        uint256 ownedDAEMInLp = (ownedLp * DAEMInLp) / lpTotalSupply;
        return (ownedDAEMInLp * 10000) / totalSupply;
    }

    /* ========== SWAP FUNCTIONS ========== */

    /// @inheritdoc ILiquidityManager
    function swapETHforDAEM(
        uint256 amountOutMin,
        address to,
        uint256 deadline
    ) external payable returns (uint256 amount) {
        require(polLp != address(0), "LP not initialized yet");
        address[] memory ETHToDAEMPath = new address[](2);
        ETHToDAEMPath[0] = WETH;
        ETHToDAEMPath[1] = DAEM;

        return
            lpRouter.swapExactETHForTokens{value: msg.value}(
                amountOutMin,
                ETHToDAEMPath,
                to,
                deadline
            )[1];
    }

    /// @inheritdoc ILiquidityManager
    function swapTokenForToken(
        uint256 amountIn,
        uint256 swapType,
        uint256 amountOutMin,
        address to,
        uint256 deadline
    ) external returns (uint256 amount) {
        require(polLp != address(0), "LP not initialized yet");
        // swapType => 0: WETH-to-DAEM, 1:DAEM-to-WETH, 2: DAEM-to-ETH.

        address[] memory path = new address[](2);
        path[0] = swapType == 0 ? WETH : DAEM;
        path[1] = swapType == 0 ? DAEM : WETH;

        require(
            IERC20(path[0]).allowance(msg.sender, address(this)) >= amountIn,
            "[LIQ-MAN] Not enough allowance"
        );
        IERC20(path[0]).transferFrom(msg.sender, address(this), amountIn);

        if (swapType == 2) // DAEM-to-ETH
        {
            return lpRouter.swapExactTokensForETH(amountIn, amountOutMin, path, to, deadline)[1];
        } else {
            return lpRouter.swapExactTokensForTokens(amountIn, amountOutMin, path, to, deadline)[1];
        }
    }

    /* ========== LIQUIDITY FUNCTIONS ========== */

    /// @inheritdoc ILiquidityManager
    function addLiquidityETH(
        uint256 amountDAEM,
        address to,
        uint256 deadline
    ) external payable {
        require(polLp != address(0), "LP not initialized yet");

        // Gets the specified amount of DAEM
        IERC20(DAEM).transferFrom(msg.sender, address(this), amountDAEM);

        // Adds the liquidity
        IUniswapV2Router01(lpRouter).addLiquidityETH{value: msg.value}(
            DAEM,
            amountDAEM,
            0,
            0,
            to,
            deadline
        );

        // send back all unused DAEM
        IERC20(DAEM).transfer(msg.sender, IERC20(DAEM).balanceOf(address(this)));
    }

    receive() external payable {
        // Any ETH sent is immediately transferred to the contract owner.
        payable(owner()).transfer(msg.value);
    }
}
