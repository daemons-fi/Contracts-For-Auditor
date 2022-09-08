import { ethers } from "hardhat";
import { DaemonsContracts, updateContracts } from "../daemons-contracts";

export const deployMmAdvancedExecutor = async (
    contracts: DaemonsContracts
): Promise<DaemonsContracts> => {
    console.log("Deploying MmAdvanced Executor");

    const executorContract = await ethers.getContractFactory("MmAdvancedScriptExecutor");
    const executor = await executorContract.deploy();
    await executor.deployed();

    console.log(`MmAdvanced Executor deployed`);
    return updateContracts(contracts, "MmAdvancedScriptExecutor", executor.address);
};
