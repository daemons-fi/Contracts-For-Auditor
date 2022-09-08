import { DaemonsContracts, getContractAddress } from "../daemons-contracts";
import hre from "hardhat";

export const verifySwapperExecutor = async (contracts: DaemonsContracts): Promise<void> => {
    console.log("Verifying Swapper Executor");

    try {
        const executor = getContractAddress(contracts, "SwapperScriptExecutor");
        await hre.run("verify:verify", { address: executor });
    } catch (error) {
        console.log(`Swapper Executor VERIFICATION FAILED`);
        console.log(error);
        return;
    }

    console.log(`Swapper Executor verified`);
};
