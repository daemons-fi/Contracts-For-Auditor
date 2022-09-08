import { DaemonsContracts, getContract, getContractAddress } from "../daemons-contracts";

export const registerMmAdvancedExecutor = async (contracts: DaemonsContracts): Promise<void> => {
    console.log("Registering MmAdvanced Executor in GasTank");

    const gasTank = await getContract(contracts, "GasTank");
    const executorAddress = getContractAddress(contracts, "MmAdvancedScriptExecutor");
    await gasTank.addExecutor(executorAddress);

    console.log(`MmAdvanced Executor registered`);
};
