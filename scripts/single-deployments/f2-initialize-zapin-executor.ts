import { DaemonsContracts, getContract, getContractAddress } from "../daemons-contracts";

export const initializeZapInExecutor = async (contracts: DaemonsContracts): Promise<void> => {
    console.log("Updating ZapIn Executor");

    const gasTankAddress = getContractAddress(contracts, "GasTank");
    const gasPriceFeedAddress = getContractAddress(contracts, "GasPriceFeed");

    const executor = await getContract(contracts, "ZapInScriptExecutor");
    await (await executor.setGasTank(gasTankAddress)).wait();
    await (await executor.setGasFeed(gasPriceFeedAddress)).wait();

    // final checks
    await executor.preliminaryCheck();
    console.log(`ZapIn Executor updated`);
};
