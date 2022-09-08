import { DaemonsContracts, getContract, getContractAddress } from "../daemons-contracts";

export const initializeTransferExecutor = async (contracts: DaemonsContracts): Promise<void> => {
    console.log("Updating Transfer Executor");

    const gasTankAddress = getContractAddress(contracts, "GasTank");
    const gasPriceFeedAddress = getContractAddress(contracts, "GasPriceFeed");

    const executor = await getContract(contracts, "TransferScriptExecutor");
    await (await executor.setGasTank(gasTankAddress)).wait();
    await (await executor.setGasFeed(gasPriceFeedAddress)).wait();

    // final checks
    await executor.preliminaryCheck();
    console.log(`Transfer Executor updated`);
};
