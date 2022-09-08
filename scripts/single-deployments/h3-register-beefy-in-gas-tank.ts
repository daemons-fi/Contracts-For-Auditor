import { DaemonsContracts, getContract, getContractAddress } from "../daemons-contracts";

export const registerBeefyExecutor = async (contracts: DaemonsContracts): Promise<void> => {
    console.log("Registering BeefyScript Executor in GasTank");

    const gasTank = await getContract(contracts, "GasTank");
    const executorAddress = getContractAddress(contracts, "BeefyScriptExecutor");
    await gasTank.addExecutor(executorAddress);

    console.log(`BeefyScript Executor registered`);
};
