import { ethers } from "hardhat";
import { DaemonsContracts, getContractAddress, updateContracts } from "../daemons-contracts";

export const deployUniswapV2LiquidityManager = async (
    contracts: DaemonsContracts
): Promise<DaemonsContracts> => {
    console.log("Deploying UniswapLiquidityManager");

    const routerAddress = getContractAddress(contracts, "IUniswapV2Router01");
    const tokenAddress = getContractAddress(contracts, "DaemonsToken");
    const UniswapLiquidityManagerContract = await ethers.getContractFactory(
        "UniswapV2LiquidityManager"
    );
    const liquidityManager = await UniswapLiquidityManagerContract.deploy(
        tokenAddress,
        routerAddress
    );
    await liquidityManager.deployed();

    console.log(`UniswapLiquidityManager deployed`);
    return updateContracts(contracts, "ILiquidityManager", liquidityManager.address);
};
