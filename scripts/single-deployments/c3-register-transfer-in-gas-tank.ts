import { DaemonsContracts, getContract, getContractAddress } from "../daemons-contracts";

export const registerTransferExecutor = async (contracts: DaemonsContracts): Promise<void> => {
    console.log("Registering Transfer Executor in GasTank");

    const gasTank = await getContract(contracts, "GasTank");
    const executorAddress = getContractAddress(contracts, "TransferScriptExecutor");
    await gasTank.addExecutor(executorAddress);

    console.log(`Transfer Executor registered`);
};
