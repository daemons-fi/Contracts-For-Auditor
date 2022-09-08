import { ethers } from "hardhat";
import { DaemonsContracts, updateContracts } from "../daemons-contracts";

export const deployBeefyExecutor = async (
    contracts: DaemonsContracts
): Promise<DaemonsContracts> => {
    console.log("Deploying Beefy Executor");

    const executorContract = await ethers.getContractFactory("BeefyScriptExecutor");
    const executor = await executorContract.deploy();
    await executor.deployed();

    console.log(`Beefy Executor deployed`);
    return updateContracts(contracts, "BeefyScriptExecutor", executor.address);
};
