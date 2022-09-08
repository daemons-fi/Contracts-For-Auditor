import { ethers } from "hardhat";
import { DaemonsContracts, updateContracts } from "../daemons-contracts";

export const deployTransferExecutor = async (
    contracts: DaemonsContracts
): Promise<DaemonsContracts> => {
    console.log("Deploying Transfer Executor");

    const executorContract = await ethers.getContractFactory("TransferScriptExecutor");
    const executor = await executorContract.deploy();
    await executor.deployed();

    console.log(`Transfer Executor deployed`);
    return updateContracts(contracts, "TransferScriptExecutor", executor.address);
};
