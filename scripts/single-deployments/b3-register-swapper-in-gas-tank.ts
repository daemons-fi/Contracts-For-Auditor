import { DaemonsContracts, getContract, getContractAddress } from "../daemons-contracts";

export const registerSwapperExecutor = async (contracts: DaemonsContracts): Promise<void> => {
    console.log("Registering Swapper Executor in GasTank");

    const gasTank = await getContract(contracts, "GasTank");
    const executorAddress = getContractAddress(contracts, "SwapperScriptExecutor");
    await gasTank.addExecutor(executorAddress);

    console.log(`Swapper Executor registered`);
};
