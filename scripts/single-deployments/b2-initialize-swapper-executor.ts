import { DaemonsContracts, getContract, getContractAddress } from "../daemons-contracts";

export const initializeSwapperExecutor = async (contracts: DaemonsContracts): Promise<void> => {
    console.log("Updating Swapper Executor");

    const gasTankAddress = getContractAddress(contracts, "GasTank");
    const gasPriceFeedAddress = getContractAddress(contracts, "GasPriceFeed");

    const executor = await getContract(contracts, "SwapperScriptExecutor");
    await (await executor.setGasTank(gasTankAddress)).wait();
    await (await executor.setGasFeed(gasPriceFeedAddress)).wait();

    // final checks
    await executor.preliminaryCheck();
    console.log(`Swapper Executor updated`);
};
