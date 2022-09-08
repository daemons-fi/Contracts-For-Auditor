import { DaemonsContracts, getContract, getContractAddress } from "../daemons-contracts";

export const initializeBeefyExecutor = async (contracts: DaemonsContracts): Promise<void> => {
    console.log("Updating Beefy Executor");

    const gasTankAddress = getContractAddress(contracts, "GasTank");
    const gasPriceFeedAddress = getContractAddress(contracts, "GasPriceFeed");

    const executor = await getContract(contracts, "BeefyScriptExecutor");
    await (await executor.setGasTank(gasTankAddress)).wait();
    await (await executor.setGasFeed(gasPriceFeedAddress)).wait();

    // final checks
    await executor.preliminaryCheck();
    console.log(`Beefy Executor updated`);
};
