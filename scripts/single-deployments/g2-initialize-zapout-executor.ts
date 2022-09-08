import { DaemonsContracts, getContract, getContractAddress } from "../daemons-contracts";

export const initializeZapOutExecutor = async (contracts: DaemonsContracts): Promise<void> => {
    console.log("Updating ZapOut Executor");

    const gasTankAddress = getContractAddress(contracts, "GasTank");
    const gasPriceFeedAddress = getContractAddress(contracts, "GasPriceFeed");

    const executor = await getContract(contracts, "ZapOutScriptExecutor");
    await (await executor.setGasTank(gasTankAddress)).wait();
    await (await executor.setGasFeed(gasPriceFeedAddress)).wait();

    // final checks
    await executor.preliminaryCheck();
    console.log(`ZapOut Executor updated`);
};
