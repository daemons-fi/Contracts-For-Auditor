import { DaemonsContracts, getContract, getContractAddress } from "../daemons-contracts";

export const registerZapInExecutor = async (contracts: DaemonsContracts): Promise<void> => {
    console.log("Registering ZapInScript Executor in GasTank");

    const gasTank = await getContract(contracts, "GasTank");
    const executorAddress = getContractAddress(contracts, "ZapInScriptExecutor");
    await gasTank.addExecutor(executorAddress);

    console.log(`ZapInScript Executor registered`);
};
