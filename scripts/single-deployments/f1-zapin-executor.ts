import { ethers } from "hardhat";
import { DaemonsContracts, updateContracts } from "../daemons-contracts";

export const deployZapInExecutor = async (
    contracts: DaemonsContracts
): Promise<DaemonsContracts> => {
    console.log("Deploying ZapIn Executor");

    const executorContract = await ethers.getContractFactory("ZapInScriptExecutor");
    const executor = await executorContract.deploy();
    await executor.deployed();

    console.log(`ZapIn Executor deployed`);
    return updateContracts(contracts, "ZapInScriptExecutor", executor.address);
};
