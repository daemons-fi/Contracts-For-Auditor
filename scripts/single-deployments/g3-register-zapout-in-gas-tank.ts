import { DaemonsContracts, getContract, getContractAddress } from "../daemons-contracts";

export const registerZapOutExecutor = async (contracts: DaemonsContracts): Promise<void> => {
    console.log("Registering ZapOutScript Executor in GasTank");

    const gasTank = await getContract(contracts, "GasTank");
    const executorAddress = getContractAddress(contracts, "ZapOutScriptExecutor");
    await gasTank.addExecutor(executorAddress);

    console.log(`ZapOutScript Executor registered`);
};
