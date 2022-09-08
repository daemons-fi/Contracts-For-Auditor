import { ethers } from "hardhat";
import { DaemonsContracts, updateContracts } from "../daemons-contracts";

export const deployMmBaseExecutor = async (
    contracts: DaemonsContracts
): Promise<DaemonsContracts> => {
    console.log("Deploying MmBase Executor");

    const executorContract = await ethers.getContractFactory("MmBaseScriptExecutor");
    const executor = await executorContract.deploy();
    await executor.deployed();

    console.log(`MmBase Executor deployed`);
    return updateContracts(contracts, "MmBaseScriptExecutor", executor.address);
};
