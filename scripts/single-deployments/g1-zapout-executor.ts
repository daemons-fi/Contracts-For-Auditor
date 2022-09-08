import { ethers } from "hardhat";
import { DaemonsContracts, updateContracts } from "../daemons-contracts";

export const deployZapOutExecutor = async (
    contracts: DaemonsContracts
): Promise<DaemonsContracts> => {
    console.log("Deploying ZapOut Executor");

    const executorContract = await ethers.getContractFactory("ZapOutScriptExecutor");
    const executor = await executorContract.deploy();
    await executor.deployed();

    console.log(`ZapOut Executor deployed`);
    return updateContracts(contracts, "ZapOutScriptExecutor", executor.address);
};
