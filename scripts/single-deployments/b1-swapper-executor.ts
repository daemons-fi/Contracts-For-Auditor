import { ethers } from "hardhat";
import { DaemonsContracts, updateContracts } from "../daemons-contracts";

export const deploySwapperExecutor = async (
    contracts: DaemonsContracts
): Promise<DaemonsContracts> => {
    console.log("Deploying Swapper Executor");

    const executorContract = await ethers.getContractFactory("SwapperScriptExecutor");
    const executor = await executorContract.deploy();
    await executor.deployed();

    console.log(`Swapper Executor deployed`);
    return updateContracts(contracts, "SwapperScriptExecutor", executor.address);
};
