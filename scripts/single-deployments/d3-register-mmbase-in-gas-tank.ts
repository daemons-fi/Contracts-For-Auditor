import { DaemonsContracts, getContract, getContractAddress } from "../daemons-contracts";

export const registerMmBaseExecutor = async (contracts: DaemonsContracts): Promise<void> => {
    console.log("Registering MmBase Executor in GasTank");

    const gasTank = await getContract(contracts, "GasTank");
    const executorAddress = getContractAddress(contracts, "MmBaseScriptExecutor");
    await gasTank.addExecutor(executorAddress);

    console.log(`MmBase Executor registered`);
};
