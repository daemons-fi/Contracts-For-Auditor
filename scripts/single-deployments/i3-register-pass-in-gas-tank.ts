import { DaemonsContracts, getContract, getContractAddress } from "../daemons-contracts";

export const registerPassExecutor = async (contracts: DaemonsContracts): Promise<void> => {
    console.log("Registering PassScript Executor in GasTank");

    const gasTank = await getContract(contracts, "GasTank");
    const executorAddress = getContractAddress(contracts, "PassScriptExecutor");
    await gasTank.addExecutor(executorAddress);

    console.log(`PassScript Executor registered`);
};
