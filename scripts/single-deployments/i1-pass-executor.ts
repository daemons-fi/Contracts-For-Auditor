import { ethers } from "hardhat";
import { DaemonsContracts, updateContracts } from "../daemons-contracts";

export const deployPassExecutor = async (
    contracts: DaemonsContracts
): Promise<DaemonsContracts> => {
    console.log("Deploying Pass Executor");

    const executorContract = await ethers.getContractFactory("PassScriptExecutor");
    const executor = await executorContract.deploy();
    await executor.deployed();

    console.log(`Pass Executor deployed`);
    return updateContracts(contracts, "PassScriptExecutor", executor.address);
};
