import { DaemonsContracts, getContract, getContractAddress } from "../daemons-contracts";

export const initializePassExecutor = async (contracts: DaemonsContracts): Promise<void> => {
    console.log("Updating Pass Executor");

    const gasTankAddress = getContractAddress(contracts, "GasTank");
    const gasPriceFeedAddress = getContractAddress(contracts, "GasPriceFeed");

    const executor = await getContract(contracts, "PassScriptExecutor");
    await (await executor.setGasTank(gasTankAddress)).wait();
    await (await executor.setGasFeed(gasPriceFeedAddress)).wait();

    // final checks
    await executor.preliminaryCheck();
    console.log(`Pass Executor updated`);
};
